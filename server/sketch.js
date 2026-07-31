const sketchSchema = `{
  "title": "string",
  "concept_prompt": "string",
  "artist_prompt": "string",
  "layout_notes": ["string"],
  "aspect_ratio": "portrait|square|landscape",
  "focal_point": "string",
  "mood": "string",
  "elements": [{"label":"string","role":"person|product|prop|background|text|other","position":"left|center|right|top|bottom|top-left|top-right|bottom-left|bottom-right","size":"large|medium|small","note":"string"}],
  "text_zones": [{"label":"string","position":"top|bottom|left|right","note":"string"}],
  "checklist": ["string"]
}`;

const toString = (value) => typeof value === "string" ? value.trim() : "";
const toArray = (value) => Array.isArray(value) ? value.filter(Boolean).map(String) : [];

function textConfig() {
  return {
    url: process.env.TEXT_AI_API_URL || process.env.AI_API_URL,
    key: process.env.TEXT_AI_API_KEY || process.env.AI_API_KEY,
    model: process.env.TEXT_AI_MODEL || process.env.AI_MODEL,
  };
}

function normalizePosition(value) {
  return ["left", "center", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"].includes(value) ? value : "center";
}

function normalizeRole(value) {
  return ["person", "product", "prop", "background", "text", "other"].includes(value) ? value : "other";
}

function normalizeSize(value) {
  return ["large", "medium", "small"].includes(value) ? value : "medium";
}

function normalizeAspectRatio(value) {
  return ["portrait", "square", "landscape"].includes(value) ? value : "portrait";
}

export function normalizeSketchPlan(raw = {}) {
  const elements = (Array.isArray(raw.elements) ? raw.elements : []).map((item) => ({
    label: toString(item?.label),
    role: normalizeRole(item?.role),
    position: normalizePosition(item?.position),
    size: normalizeSize(item?.size),
    note: toString(item?.note),
  })).filter((item) => item.label);
  const textZones = (Array.isArray(raw.text_zones) ? raw.text_zones : []).map((item) => ({
    label: toString(item?.label) || "文字区",
    position: ["top", "bottom", "left", "right"].includes(item?.position) ? item.position : "top",
    note: toString(item?.note),
  }));
  return {
    title: toString(raw.title) || "构图草图",
    concept_prompt: toString(raw.concept_prompt),
    artist_prompt: toString(raw.artist_prompt),
    layout_notes: toArray(raw.layout_notes),
    aspect_ratio: normalizeAspectRatio(raw.aspect_ratio),
    focal_point: toString(raw.focal_point),
    mood: toString(raw.mood),
    elements,
    text_zones: textZones,
    checklist: toArray(raw.checklist),
  };
}

function splitBriefItems(value) {
  return String(value || "").split(/[、，,；;\n]/).map((item) => item.trim()).filter(Boolean);
}

export function createDemoSketchPlan(brief) {
  const task = brief.brief || {};
  const mustHave = splitBriefItems(task.must_have);
  const subject = splitBriefItems(task.subject).slice(0, 4);
  const elements = [...new Set([...mustHave, ...subject])].slice(0, 6).map((label, index) => ({
    label,
    role: /人|女生|男生|店主|角色|顾客/.test(label) ? "person" : (/蛋糕|咖啡|饮品|花|产品|包装/.test(label) ? "product" : "prop"),
    position: ["center", "bottom-right", "bottom-left", "top-right", "left", "right"][index] || "center",
    size: index === 0 ? "large" : (index < 3 ? "medium" : "small"),
    note: "根据任务书必须出现或建议出现。",
  }));
  if (!elements.length) elements.push({ label: task.theme || brief.title || "主视觉", role: "other", position: "center", size: "large", note: "作为画面视觉中心。" });
  return normalizeSketchPlan({
    title: `${brief.title || "作画任务"} 草图`,
    aspect_ratio: /海报|竖版|小红书/.test(`${task.usage_scene || ""}${task.composition || ""}`) ? "portrait" : "square",
    mood: task.colors || task.style || "清晰、可执行",
    focal_point: elements[0]?.label || "主视觉",
    concept_prompt: [task.theme, task.style, task.colors, task.composition].filter(Boolean).join("；"),
    artist_prompt: `先用粗线稿确认构图：${[task.subject, task.must_have, task.composition, task.avoid && `避免：${task.avoid}`].filter(Boolean).join("；")}`,
    layout_notes: [
      task.composition || "先确认主体大小、视线方向和文字区位置。",
      task.usage_scene ? `适配使用场景：${task.usage_scene}` : "",
      task.avoid ? `避免：${task.avoid}` : "",
    ].filter(Boolean),
    elements,
    text_zones: [{ label: "标题/活动文字预留", position: "top", note: "保持可读，不压住主体。" }],
    checklist: splitBriefItems(task.must_have).slice(0, 5),
  });
}

async function requestJson(config, payload) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 600);
    throw new Error(`AI 服务返回 ${response.status}${detail ? `：${detail}` : ""}`);
  }
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 服务未返回可用内容");
  return JSON.parse(typeof content === "string" ? content : content.map((item) => item.text || "").join(""));
}

export async function createSketchPlan({ brief, merchant }) {
  const config = textConfig();
  if (!config.url || !config.key || !config.model) return { mode: "demo", plan: createDemoSketchPlan(brief) };
  const system = `你是插画项目前期草图导演。请把已确认任务书转成画师可直接起草的构图草图方案，不要生成最终成稿描述，不要写营销文案。只输出 JSON，不要 Markdown。结构必须符合：${sketchSchema}`;
  const raw = await requestJson(config, {
    model: config.model,
    response_format: { type: "json_object" },
    temperature: 0.25,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ task_brief: brief.brief, merchant_profile: merchant.profile_items?.filter((item) => item.status === "active").map((item) => item.content) || [] }) },
    ],
  });
  return { mode: "ai", plan: normalizeSketchPlan(raw) };
}

function xml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[character]);
}

function wrapText(value, max = 14) {
  const text = String(value || "");
  const lines = [];
  for (let index = 0; index < text.length; index += max) lines.push(text.slice(index, index + max));
  return lines.slice(0, 3);
}

function canvasSize(aspectRatio) {
  if (aspectRatio === "landscape") return { width: 1200, height: 800 };
  if (aspectRatio === "square") return { width: 1000, height: 1000 };
  return { width: 960, height: 1200 };
}

function pointFor(position, width, height, index) {
  const map = {
    left: [width * 0.28, height * 0.52],
    center: [width * 0.5, height * 0.52],
    right: [width * 0.72, height * 0.52],
    top: [width * 0.5, height * 0.28],
    bottom: [width * 0.5, height * 0.76],
    "top-left": [width * 0.3, height * 0.3],
    "top-right": [width * 0.7, height * 0.3],
    "bottom-left": [width * 0.3, height * 0.74],
    "bottom-right": [width * 0.7, height * 0.74],
  };
  const [baseX, baseY] = map[position] || map.center;
  return [baseX + ((index % 2) * 24 - 12), baseY + (Math.floor(index / 2) * 26)];
}

function textZone(zone, width, height) {
  const rect = {
    top: [width * 0.14, height * 0.08, width * 0.72, height * 0.12],
    bottom: [width * 0.14, height * 0.82, width * 0.72, height * 0.1],
    left: [width * 0.06, height * 0.25, width * 0.16, height * 0.5],
    right: [width * 0.78, height * 0.25, width * 0.16, height * 0.5],
  }[zone.position] || [width * 0.14, height * 0.08, width * 0.72, height * 0.12];
  return `<g class="text-zone"><rect x="${rect[0]}" y="${rect[1]}" width="${rect[2]}" height="${rect[3]}" rx="20"/><text x="${rect[0] + 24}" y="${rect[1] + 42}">${xml(zone.label)}</text></g>`;
}

function elementNode(item, width, height, index) {
  const [x, y] = pointFor(item.position, width, height, index);
  const scale = item.size === "large" ? 1.35 : (item.size === "small" ? 0.82 : 1);
  const w = 150 * scale;
  const h = 104 * scale;
  const labelLines = wrapText(item.label, 10);
  const label = labelLines.map((line, lineIndex) => `<tspan x="${x}" dy="${lineIndex ? 24 : 0}">${xml(line)}</tspan>`).join("");
  if (item.role === "person") {
    return `<g class="sketch-element"><circle cx="${x}" cy="${y - h * 0.35}" r="${36 * scale}"/><path d="M ${x - 54 * scale} ${y + h * 0.35} Q ${x} ${y - h * 0.05} ${x + 54 * scale} ${y + h * 0.35}"/><line x1="${x}" y1="${y - h * 0.05}" x2="${x}" y2="${y + h * 0.44}"/><text class="element-label" x="${x}" y="${y + h * 0.68}">${label}</text></g>`;
  }
  if (item.role === "product") {
    return `<g class="sketch-element"><ellipse cx="${x}" cy="${y + h * 0.35}" rx="${w * 0.45}" ry="${h * 0.16}"/><rect x="${x - w * 0.42}" y="${y - h * 0.34}" width="${w * 0.84}" height="${h * 0.62}" rx="18"/><path d="M ${x - w * 0.34} ${y - h * 0.02} C ${x - w * 0.12} ${y - h * 0.22}, ${x + w * 0.12} ${y + h * 0.2}, ${x + w * 0.34} ${y - h * 0.02}"/><text class="element-label" x="${x}" y="${y + h * 0.68}">${label}</text></g>`;
  }
  return `<g class="sketch-element"><rect x="${x - w * 0.5}" y="${y - h * 0.5}" width="${w}" height="${h}" rx="20"/><path d="M ${x - w * 0.36} ${y + h * 0.25} C ${x - w * 0.08} ${y - h * 0.16}, ${x + w * 0.15} ${y + h * 0.13}, ${x + w * 0.38} ${y - h * 0.2}"/><text class="element-label" x="${x}" y="${y + h * 0.66}">${label}</text></g>`;
}

export function renderSketchSvg(plan) {
  const { width, height } = canvasSize(plan.aspect_ratio);
  const notes = (plan.layout_notes || []).slice(0, 4).map((note, index) => `<text x="${width - 310}" y="${height - 170 + index * 28}">${xml(note).slice(0, 32)}</text>`).join("");
  const checklist = (plan.checklist || []).slice(0, 5).map((item, index) => `<text x="56" y="${height - 148 + index * 28}">□ ${xml(item).slice(0, 28)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(plan.title)}">
  <style>
    .paper{fill:#fbfaf4}.frame{fill:none;stroke:#172425;stroke-width:3}.guide{stroke:#b8c7c4;stroke-width:2;stroke-dasharray:12 14}.sketch-element *{fill:none;stroke:#172425;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.element-label{font:700 24px sans-serif;text-anchor:middle;fill:#172425;stroke:none}.text-zone rect{fill:#fffdf7;stroke:#a16207;stroke-width:3;stroke-dasharray:10 10}.text-zone text,.note text,.check text{font:700 24px sans-serif;fill:#6d5a28}.title{font:800 34px sans-serif;fill:#172425}.sub{font:22px sans-serif;fill:#607270}.focal{fill:none;stroke:#0f766e;stroke-width:4;stroke-dasharray:16 10}
  </style>
  <rect class="paper" width="100%" height="100%"/>
  <rect class="frame" x="34" y="34" width="${width - 68}" height="${height - 68}" rx="24"/>
  <line class="guide" x1="${width / 3}" y1="54" x2="${width / 3}" y2="${height - 54}"/><line class="guide" x1="${width * 2 / 3}" y1="54" x2="${width * 2 / 3}" y2="${height - 54}"/>
  <line class="guide" x1="54" y1="${height / 3}" x2="${width - 54}" y2="${height / 3}"/><line class="guide" x1="54" y1="${height * 2 / 3}" x2="${width - 54}" y2="${height * 2 / 3}"/>
  <text class="title" x="56" y="82">${xml(plan.title).slice(0, 24)}</text>
  <text class="sub" x="56" y="118">焦点：${xml(plan.focal_point || "主视觉").slice(0, 26)}</text>
  <ellipse class="focal" cx="${width * 0.5}" cy="${height * 0.52}" rx="${width * 0.24}" ry="${height * 0.2}"/>
  ${(plan.text_zones || []).map((zone) => textZone(zone, width, height)).join("")}
  ${(plan.elements || []).slice(0, 8).map((item, index) => elementNode(item, width, height, index)).join("")}
  <g class="check">${checklist}</g>
  <g class="note">${notes}</g>
</svg>`;
}
