const auditSchema = `{
  "summary": "string",
  "aesthetic_dimensions": [{"name":"构图与视觉焦点","rating":4,"observation":"string"}],
  "requirement_checks": [{"requirement":"string","status":"pass|partial|fail|not_evaluable","evidence":"string","recommendation":"string"}],
  "strengths": ["string"],
  "issues": [{"severity":"high|medium|low","category":"主体|构图|配色|风格|文字空间|细节|其他","observation":"string","recommendation":"string"}],
  "cannot_determine": ["string"]
}`;

const revisionSchema = `{
  "summary": "string",
  "merchant_intent": ["string"],
  "must_change": [{"priority":1,"action":"string","reason":"string","acceptance":"string"}],
  "optional_improvements": ["string"],
  "do_not_change": ["string"],
  "questions_to_confirm": ["string"]
}`;

const toString = (value) => typeof value === "string" ? value.trim() : "";
const toArray = (value) => Array.isArray(value) ? value.filter(Boolean).map(String) : [];
const rating = (value) => Math.min(5, Math.max(1, Math.round(Number(value) || 3)));
const status = (value) => ["pass", "partial", "fail", "not_evaluable"].includes(value) ? value : "not_evaluable";
const severity = (value) => ["high", "medium", "low"].includes(value) ? value : "medium";

export function normalizeAudit(raw = {}) {
  return {
    summary: toString(raw.summary),
    aesthetic_dimensions: (Array.isArray(raw.aesthetic_dimensions) ? raw.aesthetic_dimensions : []).map((item) => ({
      name: toString(item?.name) || "画面观察", rating: rating(item?.rating), observation: toString(item?.observation),
    })).filter((item) => item.observation),
    requirement_checks: (Array.isArray(raw.requirement_checks) ? raw.requirement_checks : []).map((item) => ({
      requirement: toString(item?.requirement), status: status(item?.status), evidence: toString(item?.evidence), recommendation: toString(item?.recommendation),
    })).filter((item) => item.requirement),
    strengths: toArray(raw.strengths),
    issues: (Array.isArray(raw.issues) ? raw.issues : []).map((item) => ({
      severity: severity(item?.severity), category: toString(item?.category) || "其他", observation: toString(item?.observation), recommendation: toString(item?.recommendation),
    })).filter((item) => item.observation),
    cannot_determine: toArray(raw.cannot_determine),
  };
}

export function normalizeRevision(raw = {}) {
  return {
    summary: toString(raw.summary),
    merchant_intent: toArray(raw.merchant_intent),
    must_change: (Array.isArray(raw.must_change) ? raw.must_change : []).map((item, index) => ({
      priority: Math.max(1, Math.min(9, Number(item?.priority) || index + 1)), action: toString(item?.action), reason: toString(item?.reason), acceptance: toString(item?.acceptance),
    })).filter((item) => item.action).sort((a, b) => a.priority - b.priority),
    optional_improvements: toArray(raw.optional_improvements),
    do_not_change: toArray(raw.do_not_change),
    questions_to_confirm: toArray(raw.questions_to_confirm),
  };
}

export function createDemoAudit(brief) {
  const mustHave = String(brief.brief?.must_have || "").split(/[、，,\n]/).map((item) => item.trim()).filter(Boolean);
  const subject = brief.brief?.subject || "画面主体";
  return normalizeAudit({
    summary: "当前为演示审查：已建立与任务书对应的核查清单。配置视觉模型后，将基于实际成稿给出画面证据。",
    aesthetic_dimensions: [
      { name: "构图与视觉焦点", rating: 3, observation: "需要视觉模型读取成稿后判断主体是否足够突出。" },
      { name: "风格与色彩", rating: 3, observation: "需要结合成稿核对任务书中的风格、配色和氛围要求。" },
      { name: "信息可读性", rating: 3, observation: "需要确认文字预留区与画面元素没有相互挤压。" },
    ],
    requirement_checks: mustHave.length ? mustHave.map((requirement) => ({ requirement, status: "not_evaluable", evidence: "演示模式未调用视觉模型，无法从图片确认。", recommendation: "配置视觉模型后重新审查。" })) : [{ requirement: subject, status: "not_evaluable", evidence: "演示模式未调用视觉模型，无法从图片确认。", recommendation: "配置视觉模型后重新审查。" }],
    strengths: [],
    issues: [],
    cannot_determine: ["当前没有配置 VISION_AI_API_KEY 与 VISION_AI_MODEL，图片尚未进入视觉模型审查。"],
  });
}

export function createDemoRevision(audit, feedback = "") {
  const issues = audit.issues || [];
  const checks = audit.requirement_checks || [];
  const actionable = [
    ...issues.map((item, index) => ({ priority: index + 1, action: item.recommendation || item.observation, reason: item.observation, acceptance: "完成后重新对照任务书检查。" })),
    ...checks.filter((item) => item.status === "fail" || item.status === "partial").map((item, index) => ({ priority: issues.length + index + 1, action: item.recommendation || `补强“${item.requirement}”`, reason: item.evidence, acceptance: `“${item.requirement}”应达到通过状态。` })),
  ];
  if (feedback.trim()) actionable.unshift({ priority: 1, action: `优先回应商家反馈：${feedback.trim()}`, reason: "商家本次明确反馈", acceptance: "商家确认该修改方向。" });
  return normalizeRevision({
    summary: feedback.trim() ? "已将商家反馈与审查结论合并为修改单。" : "以下修改单仅基于当前审查结论。",
    merchant_intent: feedback.trim() ? [feedback.trim()] : [],
    must_change: actionable,
    optional_improvements: audit.strengths?.length ? ["保留审查中识别出的有效画面优势，避免为修改而修改。"] : [],
    do_not_change: [],
    questions_to_confirm: audit.cannot_determine || [],
  });
}

function textConfig() {
  return {
    url: process.env.TEXT_AI_API_URL || process.env.AI_API_URL,
    key: process.env.TEXT_AI_API_KEY || process.env.AI_API_KEY,
    model: process.env.TEXT_AI_MODEL || process.env.AI_MODEL,
  };
}

function visionConfig() {
  return {
    url: process.env.VISION_AI_API_URL,
    key: process.env.VISION_AI_API_KEY,
    model: process.env.VISION_AI_MODEL,
  };
}

async function requestJson(config, payload) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`AI 服务返回 ${response.status}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 服务未返回可用内容");
  return JSON.parse(typeof content === "string" ? content : content.map((item) => item.text || "").join(""));
}

export async function reviewArtwork({ brief, merchant, dataUrl }) {
  const config = visionConfig();
  if (!config.url || !config.key || !config.model) return { mode: "demo", audit: createDemoAudit(brief) };
  const requirements = { task_brief: brief.brief, merchant_profile: merchant.profile_items?.filter((item) => item.status === "active").map((item) => item.content) || [] };
  const system = `你是插画交付审查助手。只依据图片中实际可见的证据和给出的任务书评估，不要臆测。把“审美”拆成可操作的构图、视觉焦点、色彩、风格一致性、信息可读性与细节平衡。每一项任务书要求必须标为 pass、partial、fail 或 not_evaluable。不要评价画师人格，不要给绝对的“好看/不好看”判断。只输出 JSON，不要 Markdown。结构必须符合：${auditSchema}`;
  const raw = await requestJson(config, {
    model: config.model,
    response_format: { type: "json_object" },
    enable_thinking: false,
    temperature: 0.15,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [{ type: "text", text: JSON.stringify(requirements) }, { type: "image_url", image_url: { url: dataUrl } }] },
    ],
  });
  return { mode: "ai", audit: normalizeAudit(raw) };
}

export async function createRevisionBrief({ brief, audit, merchantFeedback }) {
  const config = textConfig();
  if (!config.url || !config.key || !config.model) return { mode: "demo", revision: createDemoRevision(audit, merchantFeedback) };
  const system = `你是插画项目的修改单编辑。把商家反馈、已确认任务书和视觉审查合并为画师可执行的修改单。商家反馈优先级最高；审查结论中的不确定项不得伪装成事实。每条必须修改项必须包含行动、原因和验收标准。只输出 JSON，不要 Markdown。结构必须符合：${revisionSchema}`;
  const raw = await requestJson(config, {
    model: config.model,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ task_brief: brief.brief, visual_audit: audit, merchant_feedback: merchantFeedback }) }],
  });
  return { mode: "ai", revision: normalizeRevision(raw) };
}

export function visionConfigured() { const config = visionConfig(); return Boolean(config.url && config.key && config.model); }
export function textConfigured() { const config = textConfig(); return Boolean(config.url && config.key && config.model); }
