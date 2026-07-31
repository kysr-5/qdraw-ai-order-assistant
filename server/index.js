import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { analyzeRequest, analysisToBrief, toStoredSuggestions } from "./analysis.js";
import { createDemoRevision, createRevisionBrief, reviewArtwork, textConfigured, visionConfigured } from "./review.js";
import { createSketchPlan, renderSketchSvg } from "./sketch.js";
import { acceptSuggestion, confirmBrief, createAnalyzedBrief, createArtworkVersion, createImageReview, createMerchant, createSketchVersion, deleteBriefRawSource, deleteMerchant, getAnalysisContext, getArtwork, getBrief, getImageReview, getMerchant, getSketch, ignoreSuggestion, listArtworkPathsForMerchant, listMerchants, seedDemoData, updateBrief, updateImageReviewFeedback, updateMerchant } from "./storage.js";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const appDirectory = join(rootDirectory, "app");
const artworkDirectory = join(rootDirectory, "data", "artworks");
const mimeTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

if (existsSync(join(rootDirectory, ".env"))) process.loadEnvFile(join(rootDirectory, ".env"));

seedDemoData();

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 12_000_000) throw new Error("请求内容过大，图片请控制在 7 MB 以内");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function notFound(response) { sendJson(response, 404, { error: "未找到对应资源" }); }
function badRequest(response, message) { sendJson(response, 400, { error: message }); }

function decodeArtwork(dataUrl) {
  const match = typeof dataUrl === "string" && dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("请上传 PNG、JPG 或 WebP 图片");
  if (dataUrl.length > 10_000_000) throw new Error("图片过大，请控制在 7 MB 以内");
  const buffer = Buffer.from(match[2], "base64");
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isWebp = buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  const valid = { "image/png": isPng, "image/jpeg": isJpeg, "image/webp": isWebp }[match[1]];
  if (!buffer.length || !valid) throw new Error("图片内容与声明格式不匹配");
  return { mimeType: match[1], buffer };
}

async function handleApi(request, response, pathname) {
  const method = request.method;
  if (method === "GET" && pathname === "/api/health") return sendJson(response, 200, { ok: true, ai_configured: textConfigured(), text_ai_configured: textConfigured(), vision_ai_configured: visionConfigured(), sketch_ai_configured: textConfigured() });
  if (method === "GET" && pathname === "/api/merchants") return sendJson(response, 200, { merchants: listMerchants() });
  if (method === "POST" && pathname === "/api/merchants") {
    const input = await readJson(request);
    if (!input.name?.trim()) return badRequest(response, "商家名称不能为空");
    return sendJson(response, 201, { merchant: createMerchant(input) });
  }
  const merchantMatch = pathname.match(/^\/api\/merchants\/([^/]+)$/);
  if (merchantMatch) {
    const id = decodeURIComponent(merchantMatch[1]);
    if (method === "GET") {
      const merchant = getMerchant(id);
      return merchant ? sendJson(response, 200, { merchant }) : notFound(response);
    }
    if (method === "PATCH") {
      const merchant = updateMerchant(id, await readJson(request));
      return merchant ? sendJson(response, 200, { merchant }) : notFound(response);
    }
    if (method === "DELETE") {
      const artworkPaths = listArtworkPathsForMerchant(id);
      if (!deleteMerchant(id)) return notFound(response);
      await Promise.all(artworkPaths.map((filePath) => unlink(filePath).catch(() => {})));
      return sendJson(response, 200, { deleted: true });
    }
  }
  if (method === "POST" && pathname === "/api/briefs/analyze") {
    const input = await readJson(request);
    if (!input.merchant_id || !input.chat_text?.trim()) return badRequest(response, "商家和聊天内容不能为空");
    const context = getAnalysisContext(input.merchant_id);
    if (!context) return notFound(response);
    const result = await analyzeRequest(input, input.use_merchant_profile === false ? { ...context, profile_items: [] } : context);
    const brief = analysisToBrief(result.analysis, input);
    const stored = createAnalyzedBrief({ ...input, analysis: { ...result.analysis, analysis_mode: result.mode }, brief, suggestions: toStoredSuggestions(result.analysis) });
    return sendJson(response, 201, { brief: stored, analysis_mode: result.mode });
  }
  const artworkFileMatch = pathname.match(/^\/api\/artworks\/([^/]+)\/file$/);
  if (artworkFileMatch && method === "GET") {
    const artwork = getArtwork(decodeURIComponent(artworkFileMatch[1]), true);
    if (!artwork) return notFound(response);
    try {
      const content = await readFile(artwork.file_path);
      response.writeHead(200, { "Content-Type": artwork.mime_type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
      return response.end(content);
    } catch { return notFound(response); }
  }
  const sketchFileMatch = pathname.match(/^\/api\/sketches\/([^/]+)\/file$/);
  if (sketchFileMatch && method === "GET") {
    const sketch = getSketch(decodeURIComponent(sketchFileMatch[1]), true);
    if (!sketch) return notFound(response);
    response.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
    return response.end(sketch.svg_text);
  }
  const sketchMatch = pathname.match(/^\/api\/briefs\/([^/]+)\/sketches$/);
  if (sketchMatch && method === "POST") {
    const brief = getBrief(decodeURIComponent(sketchMatch[1]));
    if (!brief) return notFound(response);
    if (brief.status !== "confirmed") return badRequest(response, "请先确认任务书，再生成给画师看的草图");
    const merchant = getMerchant(brief.merchant_id);
    const result = await createSketchPlan({ brief, merchant });
    const svgText = renderSketchSvg(result.plan);
    const promptText = result.plan.artist_prompt || result.plan.concept_prompt || "";
    const sketch = createSketchVersion({ briefId: brief.id, plan: result.plan, svgText, promptText, generationMode: result.mode });
    return sendJson(response, 201, { sketch });
  }
  const artworkReviewMatch = pathname.match(/^\/api\/briefs\/([^/]+)\/artwork-reviews$/);
  if (artworkReviewMatch && method === "POST") {
    const brief = getBrief(decodeURIComponent(artworkReviewMatch[1]));
    if (!brief) return notFound(response);
    if (brief.status !== "confirmed") return badRequest(response, "请先确认任务书，再上传成稿审查");
    const input = await readJson(request);
    const decoded = decodeArtwork(input.data_url);
    const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[decoded.mimeType];
    await mkdir(artworkDirectory, { recursive: true });
    const filePath = join(artworkDirectory, `${randomUUID()}.${extension}`);
    await writeFile(filePath, decoded.buffer);
    const artwork = createArtworkVersion({ briefId: brief.id, fileName: String(input.file_name || `artwork.${extension}`).slice(0, 120), mimeType: decoded.mimeType, filePath, byteSize: decoded.buffer.length, note: String(input.note || "") });
    const merchant = getMerchant(brief.merchant_id);
    const result = await reviewArtwork({ brief, merchant, dataUrl: input.data_url });
    const revision = createDemoRevision(result.audit);
    const review = createImageReview({ briefId: brief.id, artworkId: artwork.id, audit: result.audit, auditMode: result.mode, revision, revisionMode: "audit" });
    return sendJson(response, 201, { review });
  }
  const reviewFeedbackMatch = pathname.match(/^\/api\/image-reviews\/([^/]+)\/feedback$/);
  if (reviewFeedbackMatch && method === "POST") {
    const review = getImageReview(decodeURIComponent(reviewFeedbackMatch[1]));
    if (!review) return notFound(response);
    const input = await readJson(request);
    const merchantFeedback = String(input.merchant_feedback || "").trim();
    if (!merchantFeedback) return badRequest(response, "请先输入商家反馈");
    const brief = getBrief(review.brief_id);
    const result = await createRevisionBrief({ brief, audit: review.audit, merchantFeedback });
    const updated = updateImageReviewFeedback(review.id, { merchantFeedback, revision: result.revision, revisionMode: result.mode });
    return sendJson(response, 200, { review: updated });
  }
  const briefMatch = pathname.match(/^\/api\/briefs\/([^/]+)(?:\/(confirm))?$/);
  const rawSourceMatch = pathname.match(/^\/api\/briefs\/([^/]+)\/raw-source$/);
  if (rawSourceMatch && method === "DELETE") {
    const brief = deleteBriefRawSource(decodeURIComponent(rawSourceMatch[1]));
    return brief ? sendJson(response, 200, { brief }) : notFound(response);
  }
  if (briefMatch) {
    const id = decodeURIComponent(briefMatch[1]);
    if (method === "GET") {
      const brief = getBrief(id);
      return brief ? sendJson(response, 200, { brief }) : notFound(response);
    }
    if (method === "PATCH" && !briefMatch[2]) {
      const brief = updateBrief(id, await readJson(request));
      return brief ? sendJson(response, 200, { brief }) : notFound(response);
    }
    if (method === "POST" && briefMatch[2] === "confirm") {
      const brief = confirmBrief(id);
      return brief ? sendJson(response, 200, { brief }) : notFound(response);
    }
  }
  const suggestionMatch = pathname.match(/^\/api\/profile-suggestions\/([^/]+)\/(accept|ignore)$/);
  if (suggestionMatch && method === "POST") {
    const input = await readJson(request);
    const merchant = suggestionMatch[2] === "accept" ? acceptSuggestion(suggestionMatch[1], input) : ignoreSuggestion(suggestionMatch[1]);
    return merchant ? sendJson(response, 200, { merchant }) : notFound(response);
  }
  return notFound(response);
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(appDirectory, requested));
  if (!filePath.startsWith(appDirectory)) return notFound(response);
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch { notFound(response); }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url.pathname);
    return await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    const message = error instanceof SyntaxError ? "请求 JSON 格式错误" : error.message || "服务异常";
    return sendJson(response, 500, { error: message });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Qdraw is running at http://localhost:${port}`));
