import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { analyzeRequest, analysisToBrief, toStoredSuggestions } from "./analysis.js";
import { acceptSuggestion, confirmBrief, createAnalyzedBrief, createMerchant, deleteMerchant, getAnalysisContext, getBrief, getMerchant, ignoreSuggestion, listMerchants, seedDemoData, updateBrief, updateMerchant } from "./storage.js";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const appDirectory = join(rootDirectory, "app");
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
    if (size > 1_000_000) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function notFound(response) { sendJson(response, 404, { error: "未找到对应资源" }); }
function badRequest(response, message) { sendJson(response, 400, { error: message }); }

async function handleApi(request, response, pathname) {
  const method = request.method;
  if (method === "GET" && pathname === "/api/health") return sendJson(response, 200, { ok: true, ai_configured: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL) });
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
    if (method === "DELETE") return deleteMerchant(id) ? sendJson(response, 200, { deleted: true }) : notFound(response);
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
  const briefMatch = pathname.match(/^\/api\/briefs\/([^/]+)(?:\/(confirm))?$/);
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
    const merchant = suggestionMatch[2] === "accept" ? acceptSuggestion(suggestionMatch[1], input.content) : ignoreSuggestion(suggestionMatch[1]);
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
