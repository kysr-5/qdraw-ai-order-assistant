const schemaDescription = `{
  "project_title": "string",
  "summary": "string",
  "keywords": ["string"],
  "explicit_requirements": ["string"],
  "inferred_requirements": ["string"],
  "drawing_goal": "string",
  "usage_scene": "string",
  "main_subject": {"type":"string","count":"string","identity":"string","action":"string","expression":"string","props":["string"],"background":["string"]},
  "style_direction": {"art_style":"string","line_quality":"string","color":"string","mood_keywords":["string"],"reference_style":"string","disliked_style":"string"},
  "must_have": ["string"],
  "flexible_space": ["string"],
  "avoid": ["string"],
  "questions_to_confirm": ["string"],
  "artist_brief": "string",
  "profile_update_suggestions": {"new_preferences":[{"content":"string","evidence":"string","confidence":0.6}],"reinforced_preferences":[{"content":"string","evidence":"string","confidence":0.6}],"possible_changes":[{"content":"string","evidence":"string","confidence":0.6}],"one_off_requirements":[{"content":"string","evidence":"string","confidence":0.6}],"communication_notes":[{"content":"string","evidence":"string","confidence":0.6}]},
  "history_comparison": {"consistent_preferences":["string"],"new_requirements":["string"],"possible_conflicts":["string"],"artist_suggestions":["string"]}
}`;

const toArray = (value) => Array.isArray(value) ? value.filter(Boolean).map(String) : [];
const toString = (value) => typeof value === "string" ? value.trim() : "";
const suggestionTypes = ["new_preferences", "reinforced_preferences", "possible_changes", "one_off_requirements", "communication_notes"];

export function normalizeAnalysis(raw = {}) {
  const suggestions = raw.profile_update_suggestions || {};
  const normalizedSuggestions = {};
  for (const type of suggestionTypes) {
    const entries = Array.isArray(suggestions[type]) ? suggestions[type] : [];
    normalizedSuggestions[type] = entries.map((item) => typeof item === "string"
      ? { content: item, evidence: "AI 根据本次聊天生成", confidence: 0.6 }
      : { content: toString(item.content), evidence: toString(item.evidence), confidence: Math.min(0.95, Math.max(0.1, Number(item.confidence) || 0.6)) })
      .filter((item) => item.content);
  }
  const subject = raw.main_subject || {};
  const style = raw.style_direction || {};
  const history = raw.history_comparison || {};
  return {
    project_title: toString(raw.project_title),
    summary: toString(raw.summary),
    keywords: toArray(raw.keywords),
    explicit_requirements: toArray(raw.explicit_requirements),
    inferred_requirements: toArray(raw.inferred_requirements),
    drawing_goal: toString(raw.drawing_goal),
    usage_scene: toString(raw.usage_scene),
    main_subject: { type: toString(subject.type), count: toString(subject.count), identity: toString(subject.identity), action: toString(subject.action), expression: toString(subject.expression), props: toArray(subject.props), background: toArray(subject.background) },
    style_direction: { art_style: toString(style.art_style), line_quality: toString(style.line_quality), color: toString(style.color), mood_keywords: toArray(style.mood_keywords), reference_style: toString(style.reference_style), disliked_style: toString(style.disliked_style) },
    must_have: toArray(raw.must_have),
    flexible_space: toArray(raw.flexible_space),
    avoid: toArray(raw.avoid),
    questions_to_confirm: toArray(raw.questions_to_confirm),
    artist_brief: toString(raw.artist_brief),
    profile_update_suggestions: normalizedSuggestions,
    history_comparison: { consistent_preferences: toArray(history.consistent_preferences), new_requirements: toArray(history.new_requirements), possible_conflicts: toArray(history.possible_conflicts), artist_suggestions: toArray(history.artist_suggestions) },
  };
}

export function analysisToBrief(analysis, input) {
  const subject = analysis.main_subject;
  const style = analysis.style_direction;
  return {
    title: analysis.project_title || analysis.drawing_goal || "未命名作画任务",
    goal: analysis.drawing_goal,
    usage_scene: analysis.usage_scene,
    theme: analysis.summary,
    subject: [subject.type, subject.count, subject.identity, subject.action, subject.expression, ...subject.props, ...subject.background].filter(Boolean).join("；"),
    style: [style.art_style, style.line_quality, style.mood_keywords.join("、"), style.reference_style].filter(Boolean).join("；"),
    colors: style.color,
    composition: analysis.flexible_space.join("；"),
    must_have: analysis.must_have.join("；"),
    flexible: analysis.flexible_space.join("；"),
    avoid: analysis.avoid.join("；") || style.disliked_style,
    references: style.reference_style,
    questions: analysis.questions_to_confirm.join("\n"),
    artist_note: input.artist_note || "",
  };
}

function contains(chat, words) { return words.some((word) => chat.includes(word)); }

function findMentionedSubjects(chat) {
  const knownSubjects = ["小女孩", "小男孩", "店主", "柴犬", "小熊", "小猫", "小狗", "兔子", "草莓蛋糕", "蛋糕", "咖啡", "茶饮", "花束", "花艺"];
  const matches = knownSubjects.filter((subject) => chat.includes(subject));
  return matches.filter((subject) => !matches.some((other) => other !== subject && other.includes(subject)));
}

function demoProjectTitle(chat, subjects) {
  const occasion = ["春节", "元宵", "情人节", "七夕", "中秋", "国庆", "圣诞", "周年庆", "夏日", "夏天"].find((item) => chat.includes(item));
  const usage = ["海报", "菜单", "包装", "头像", "插画"].find((item) => chat.includes(item));
  const keySubject = subjects.find((item) => !["店主", "花束"].includes(item));
  return [occasion, keySubject, usage].filter(Boolean).join("") || [keySubject, usage].filter(Boolean).join("") || "商家插画需求";
}

export function createDemoAnalysis(input, context) {
  const chat = input.chat_text;
  const subjects = findMentionedSubjects(chat);
  const explicit = [];
  const inferred = [];
  const questions = [];
  if (contains(chat, ["海报", "小红书", "朋友圈", "宣传"])) explicit.push("用于社交媒体传播的活动视觉");
  if (contains(chat, ["竖版", "1080", "1440"])) explicit.push("竖版发布尺寸");
  if (contains(chat, ["店主", "人物"])) explicit.push("画面需包含店主或人物角色");
  if (subjects.length) explicit.push(`画面主体包含：${subjects.join("、")}`);
  if (contains(chat, ["可爱", "手绘"])) explicit.push("可爱手绘风格");
  if (contains(chat, ["明快", "夏天", "夏日"])) explicit.push("明快、有季节感的配色");
  if (contains(chat, ["写实", "不太适合"])) explicit.push("避免强写实质感");
  if (!explicit.length) explicit.push("聊天中有待整理的作画需求");
  if (contains(chat, ["周年", "活动", "文字位置", "日期"])) inferred.push("需预留活动标题和日期的排版区域");
  if (contains(chat, ["咖啡", "店铺"])) inferred.push("背景可包含店铺门头或品牌环境元素");
  if (!inferred.length) inferred.push("优先确保主体清晰和信息层级明确");
  if (!contains(chat, ["预算", "报价"])) questions.push("本次预算或可接受的报价区间是多少？");
  if (!contains(chat, ["参考图", "参考"])) questions.push("是否有希望接近或避开的参考图？");
  if (!contains(chat, ["交付", "初稿", "下周"])) questions.push("初稿和最终交付时间如何安排？");
  const profileContents = context.profile_items.map((item) => item.content);
  const consistent = profileContents.filter((item) => (item.includes("手绘") && contains(chat, ["手绘", "可爱"])) || (item.includes("写实") && contains(chat, ["写实"])));
  const analysis = normalizeAnalysis({
    project_title: demoProjectTitle(chat, subjects),
    summary: "将本次聊天整理为可执行的社交媒体活动插画任务。",
    keywords: ["活动视觉", "社交媒体", ...explicit.slice(0, 4)],
    explicit_requirements: explicit,
    inferred_requirements: inferred,
    drawing_goal: contains(chat, ["周年", "活动"]) ? "制作适合社交媒体发布的活动主视觉插画" : "根据商家聊天制作可执行的插画任务",
    usage_scene: contains(chat, ["小红书", "朋友圈"]) ? "小红书、朋友圈等移动端社交媒体" : "待确认发布渠道",
    main_subject: { type: subjects.length ? subjects.join("、") : (contains(chat, ["人物", "角色"]) ? "人物角色" : "待确认"), count: subjects.length > 1 ? `${subjects.length} 个主要主体` : (subjects.length ? "1 个主要主体" : "待确认"), identity: subjects.filter((item) => ["店主", "小女孩", "小男孩"].includes(item)).join("、") || "待确认", action: contains(chat, ["花束"]) ? "手持花束，与画面主体同框" : "待确认", expression: "自然亲切", props: subjects.filter((item) => ["花束", "草莓蛋糕", "蛋糕", "咖啡", "茶饮"].includes(item)), background: contains(chat, ["咖啡", "店铺"]) ? ["店铺门口或咖啡店环境"] : [] },
    style_direction: { art_style: contains(chat, ["可爱", "手绘"]) ? "可爱手绘" : "待确认", line_quality: "轻松、干净", color: contains(chat, ["明快", "夏天", "夏日"]) ? "明快而不过分繁杂的夏日色彩" : "待确认", mood_keywords: ["亲切", "轻松"], reference_style: "", disliked_style: contains(chat, ["写实"]) ? "强写实质感" : "" },
    must_have: explicit,
    flexible_space: inferred,
    avoid: contains(chat, ["写实"]) ? ["强写实质感", "画面元素过多导致文字区拥挤"] : ["未确认的品牌元素"],
    questions_to_confirm: questions,
    artist_brief: "先确认文字内容、尺寸与交付时间，再进入草图。",
    profile_update_suggestions: {
      new_preferences: contains(chat, ["可爱", "手绘"]) ? [{ content: "偏好可爱手绘和明快配色", evidence: "商家本次明确提到可爱手绘和明快颜色", confidence: 0.72 }] : [],
      reinforced_preferences: consistent.map((content) => ({ content, evidence: "本次聊天与历史偏好一致", confidence: 0.82 })),
      possible_changes: [],
      one_off_requirements: contains(chat, ["周年", "活动"]) ? [{ content: "本次活动需预留周年庆文案区域", evidence: "商家提到周年庆和日期后续自行排版", confidence: 0.8 }] : [],
      communication_notes: [{ content: "确认尺寸、主体关系与交付节点后再开始绘制", evidence: "聊天仍缺少报价或交付信息", confidence: 0.64 }],
    },
    history_comparison: { consistent_preferences: consistent, new_requirements: inferred, possible_conflicts: [], artist_suggestions: consistent.length ? ["可沿用已确认的风格方向，并确认本次活动文字区。"] : ["先确认本次是否属于长期偏好，再写入商家画像。"] },
  });
  return analysis;
}

export async function analyzeRequest(input, context) {
  const config = {
    url: process.env.TEXT_AI_API_URL || process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions",
    key: process.env.TEXT_AI_API_KEY || process.env.AI_API_KEY,
    model: process.env.TEXT_AI_MODEL || process.env.AI_MODEL,
  };
  if (!config.key || !config.model) {
    return { mode: "demo", analysis: createDemoAnalysis(input, context) };
  }
  const system = `你是服务于插画师的接单需求分析助手。请严格输出 JSON，不要 Markdown。将商家明确说过的要求与推断分开；画像只能提出建议，不能直接写入。JSON 结构必须符合：${schemaDescription}`;
  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
    body: JSON.stringify({
      model: config.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ input, merchant_context: context }) },
      ],
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`AI 服务返回 ${response.status}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 服务未返回可用内容");
  return { mode: "ai", analysis: normalizeAnalysis(JSON.parse(content)) };
}

export function toStoredSuggestions(analysis) {
  const labels = { new_preferences: "new_preference", reinforced_preferences: "reinforced_preference", possible_changes: "possible_change", one_off_requirements: "one_off_requirement", communication_notes: "communication_note" };
  return suggestionTypes.flatMap((group) => analysis.profile_update_suggestions[group].map((item) => ({ ...item, type: labels[group] })));
}
