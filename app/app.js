const storageKey = "qdraw-workspace-v1";

const demoChat = `商家：我们八月要做周年庆活动，想请你画一张可以发小红书和朋友圈的海报。\n画师：大概想要什么内容和感觉？\n商家：店主和我们家的柴犬一起在咖啡店门口，店主拿着一束花，狗狗坐在旁边就好。希望有一点夏天的感觉，颜色明快，但是不要太花。\n商家：人物希望偏可爱手绘，之前那种写实感不太适合我们。文字位置先留出来，周年庆和日期后面我们自己排。\n画师：尺寸和交付时间呢？\n商家：竖版，1080 x 1440，最好下周三前能看到初稿。`;

const defaultData = {
  activeMerchantId: "m-flower",
  merchants: [
    {
      id: "m-flower",
      name: "花田咖啡",
      note: "小红书店铺，合作过 2 次",
      profile: {
        preferences: ["偏好可爱手绘与明快配色", "需要为文字和活动日期保留排版空间", "不喜欢过强的写实质感"],
        communication: "确认尺寸、主角关系和交付节点后再进入绘制。",
      },
      briefs: [
        { id: "b-001", title: "夏日新品饮品插画", date: "2026-07-12", state: "已确认" },
        { id: "b-002", title: "店铺菜单角标", date: "2026-07-22", state: "已确认" },
      ],
      draft: { chat: demoChat, analysis: null, brief: {}, suggestion: null, state: "草稿" },
    },
    {
      id: "m-sen",
      name: "森屿花艺",
      note: "节日海报为主",
      profile: { preferences: ["偏好留白较多的画面", "常用自然植物元素"], communication: "修改意见通常集中在配色和花材。" },
      briefs: [{ id: "b-003", title: "七夕花礼海报", date: "2026-07-24", state: "已确认" }],
      draft: { chat: "", analysis: null, brief: {}, suggestion: null, state: "草稿" },
    },
  ],
};

let data = loadData();

const elements = {
  merchantList: document.querySelector("#merchantList"),
  merchantTitle: document.querySelector("#merchantTitle"),
  workspace: document.querySelector("#workspace"),
  emptyState: document.querySelector("#emptyState"),
  chatInput: document.querySelector("#chatInput"),
  chatCount: document.querySelector("#chatCount"),
  chatState: document.querySelector("#chatState"),
  analysisState: document.querySelector("#analysisState"),
  analysisContent: document.querySelector("#analysisContent"),
  briefState: document.querySelector("#briefState"),
  profileContent: document.querySelector("#profileContent"),
  profileConfidence: document.querySelector("#profileConfidence"),
  profileSuggestion: document.querySelector("#profileSuggestion"),
  merchantDialog: document.querySelector("#merchantDialog"),
  merchantForm: document.querySelector("#merchantForm"),
  merchantNameInput: document.querySelector("#merchantNameInput"),
  merchantNoteInput: document.querySelector("#merchantNoteInput"),
};

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || structuredClone(defaultData);
  } catch {
    return structuredClone(defaultData);
  }
}

function saveData() {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

function activeMerchant() {
  return data.merchants.find((merchant) => merchant.id === data.activeMerchantId);
}

function escapeHtml(value = "") {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function makeTags(items, inferred = false) {
  return items.map((item) => `<span class="tag${inferred ? " inferred" : ""}">${escapeHtml(item)}</span>`).join("");
}

function renderMerchantList() {
  elements.merchantList.innerHTML = data.merchants.map((merchant) => {
    const active = merchant.id === data.activeMerchantId ? " active" : "";
    const initial = merchant.name.slice(0, 1);
    return `<button type="button" class="merchant-item${active}" data-merchant-id="${merchant.id}">
      <span class="merchant-avatar">${escapeHtml(initial)}</span>
      <span><span class="merchant-name">${escapeHtml(merchant.name)}</span><span class="merchant-meta">${merchant.briefs.length} 个已确认任务</span></span>
    </button>`;
  }).join("");
}

function renderAnalysis(draft) {
  const analysis = draft.analysis;
  if (!analysis) {
    elements.analysisState.textContent = draft.chat.trim() ? "可开始分析" : "等待聊天内容";
    elements.analysisState.classList.remove("ready");
    elements.analysisContent.innerHTML = `<div class="analysis-placeholder">${draft.chat.trim() ? "点击“开始分析”提取作画需求。" : "粘贴聊天后，需求要点会显示在这里。"}</div>`;
    return;
  }
  elements.analysisState.textContent = "已生成";
  elements.analysisState.classList.add("ready");
  elements.analysisContent.innerHTML = `
    <div class="analysis-group"><div class="analysis-group-title">一句话摘要</div><div class="analysis-text">${escapeHtml(analysis.summary)}</div></div>
    <div class="analysis-group"><div class="analysis-group-title">商家明确要求</div><div class="tag-row">${makeTags(analysis.explicit)}</div></div>
    <div class="analysis-group"><div class="analysis-group-title">系统推断</div><div class="tag-row">${makeTags(analysis.inferred, true)}</div></div>
    <div class="analysis-group"><div class="analysis-group-title">待确认</div><ol class="question-list">${analysis.questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></div>`;
}

function renderBrief(draft) {
  const brief = draft.brief || {};
  document.querySelectorAll("[data-brief-field]").forEach((field) => {
    field.value = brief[field.dataset.briefField] || "";
  });
  elements.briefState.textContent = draft.state || "草稿";
}

function renderProfile(merchant) {
  const profile = merchant.profile;
  const preferences = profile.preferences.length
    ? `<ul class="preference-list">${profile.preferences.map((preference) => `<li>${escapeHtml(preference)}</li>`).join("")}</ul>`
    : `<div class="profile-empty">确认任务书后，稳定偏好会在这里积累。</div>`;
  const history = merchant.briefs.length
    ? merchant.briefs.slice(0, 4).map((brief) => `<div class="history-item"><div class="history-title">${escapeHtml(brief.title)}</div><div class="history-date">${brief.date} · ${brief.state}</div></div>`).join("")
    : `<div class="profile-empty">还没有已确认的任务。</div>`;
  elements.profileContent.innerHTML = `
    <section class="profile-section"><div class="profile-title">已确认偏好</div>${preferences}</section>
    <section class="profile-section"><div class="profile-title">沟通习惯</div><div class="profile-empty">${escapeHtml(profile.communication || "待积累")}</div></section>
    <section class="profile-section"><div class="profile-title">历史任务</div><div class="project-history">${history}</div></section>`;
  elements.profileConfidence.textContent = profile.preferences.length ? `${profile.preferences.length} 条偏好` : "待积累";

  const suggestion = merchant.draft.suggestion;
  if (!suggestion) {
    elements.profileSuggestion.classList.add("hidden");
    return;
  }
  elements.profileSuggestion.classList.remove("hidden");
  elements.profileSuggestion.innerHTML = `<p>建议新增画像：${escapeHtml(suggestion)}</p><div class="suggestion-actions"><button class="small-button confirm" data-profile-action="accept" type="button">采纳</button><button class="small-button" data-profile-action="ignore" type="button">忽略</button></div>`;
}

function renderWorkspace() {
  const merchant = activeMerchant();
  const hasMerchant = Boolean(merchant);
  elements.workspace.classList.toggle("hidden", !hasMerchant);
  elements.emptyState.classList.toggle("hidden", hasMerchant);
  if (!merchant) {
    elements.merchantTitle.textContent = "选择一个商家";
    return;
  }
  elements.merchantTitle.textContent = merchant.name;
  elements.chatInput.value = merchant.draft.chat || "";
  updateChatCount();
  elements.chatState.textContent = merchant.draft.analysis ? "已分析" : "待分析";
  renderAnalysis(merchant.draft);
  renderBrief(merchant.draft);
  renderProfile(merchant);
}

function render() {
  renderMerchantList();
  renderWorkspace();
}

function updateChatCount() {
  elements.chatCount.textContent = `${elements.chatInput.value.trim().length} 字`;
}

function analyzeChat(chat) {
  const lower = chat.toLowerCase();
  const includes = (words) => words.some((word) => lower.includes(word));
  const explicit = [];
  const inferred = [];
  const questions = [];

  if (includes(["海报", "小红书", "朋友圈", "宣传"])) explicit.push("用于社交媒体宣传的活动海报");
  if (includes(["竖版", "1080", "1440"])) explicit.push("竖版 1080 × 1440 尺寸");
  if (includes(["店主", "人物"])) explicit.push("画面包含店主角色");
  if (includes(["柴犬", "狗狗", "宠物"])) explicit.push("画面包含柴犬或宠物");
  if (includes(["可爱", "手绘"])) explicit.push("可爱手绘风格");
  if (includes(["明快", "夏天", "夏日"])) explicit.push("明快、带夏日感的配色");
  if (includes(["不要太花", "留白", "文字位置", "排版空间"])) explicit.push("画面控制复杂度并为文字留出空间");
  if (includes(["写实", "不太适合"])) explicit.push("避免强写实质感");
  if (includes(["下周", "初稿", "交付"])) explicit.push("需要在约定节点前提供初稿");
  if (!explicit.length) explicit.push("从聊天中提取到一项待进一步整理的作画需求");

  if (includes(["周年", "活动"])) inferred.push("视觉重心应预留活动标题和日期区");
  if (includes(["咖啡", "店铺"])) inferred.push("背景可使用具有识别度的店铺门头或环境元素");
  if (includes(["小红书", "朋友圈"])) inferred.push("构图优先保证移动端缩略图的主体清晰度");
  if (!inferred.length) inferred.push("先以主体清晰、信息层级明确为构图方向");

  if (!includes(["预算", "报价"])) questions.push("本次预算或可接受的报价区间是多少？");
  if (!includes(["参考图", "参考"])) questions.push("是否有希望接近或避开的参考图？");
  if (!includes(["文字", "文案"])) questions.push("最终需要预留哪些文字内容和位置？");
  if (!includes(["尺寸", "1080", "1440"])) questions.push("最终发布渠道和尺寸是否已确认？");

  const subject = includes(["柴犬", "狗狗"]) ? "店主手持花束，与柴犬在店铺门口互动或同框。" : "根据聊天确认主体、数量、动作和场景。";
  const style = includes(["可爱", "手绘"]) ? "可爱手绘，线条轻松；明快但不过度繁杂的夏日配色。" : "根据商家提供的风格词和参考图确认。";
  const goal = includes(["周年", "活动"]) ? "为周年庆活动制作适合社交媒体传播的主视觉插画。" : "将商家聊天整理为可执行的作画需求。";
  const avoid = includes(["写实"]) ? "强写实质感、画面元素过多、挤占文字区域。" : "与商家已明确表达的偏好相冲突的处理方式。";
  const summary = `${goal} 主体围绕${subject.replace("。", "")} 风格方向为${style}`;

  return {
    summary,
    explicit,
    inferred,
    questions,
    brief: {
      goal,
      subject,
      style,
      mustHave: explicit.join("；"),
      avoid,
      questions: questions.join("\n"),
    },
    suggestion: includes(["可爱", "手绘"]) ? "偏好可爱手绘和明快配色，避免强写实质感。" : "倾向在确认文字排版空间后再开始绘制。",
  };
}

function runAnalysis() {
  const merchant = activeMerchant();
  if (!merchant) return;
  const chat = elements.chatInput.value.trim();
  merchant.draft.chat = chat;
  if (!chat) {
    merchant.draft.analysis = null;
    merchant.draft.brief = {};
    merchant.draft.suggestion = null;
    saveData();
    renderWorkspace();
    return;
  }
  const result = analyzeChat(chat);
  merchant.draft.analysis = result;
  merchant.draft.brief = result.brief;
  merchant.draft.suggestion = result.suggestion;
  merchant.draft.state = "待确认";
  saveData();
  renderWorkspace();
}

function saveBrief() {
  const merchant = activeMerchant();
  if (!merchant) return;
  merchant.draft.brief = merchant.draft.brief || {};
  document.querySelectorAll("[data-brief-field]").forEach((field) => {
    merchant.draft.brief[field.dataset.briefField] = field.value.trim();
  });
  merchant.draft.state = "草稿已保存";
  saveData();
  renderWorkspace();
}

function confirmBrief() {
  const merchant = activeMerchant();
  if (!merchant) return;
  saveBrief();
  const goal = merchant.draft.brief.goal || "未命名任务";
  merchant.briefs.unshift({
    id: `b-${Date.now()}`,
    title: goal.length > 18 ? `${goal.slice(0, 18)}...` : goal,
    date: new Date().toISOString().slice(0, 10),
    state: "已确认",
  });
  merchant.draft.state = "已确认";
  saveData();
  render();
}

function createMerchant() {
  const name = elements.merchantNameInput.value.trim();
  if (!name) return;
  const merchant = {
    id: `m-${Date.now()}`,
    name,
    note: elements.merchantNoteInput.value.trim(),
    profile: { preferences: [], communication: "待从实际合作中积累。" },
    briefs: [],
    draft: { chat: "", analysis: null, brief: {}, suggestion: null, state: "草稿" },
  };
  data.merchants.unshift(merchant);
  data.activeMerchantId = merchant.id;
  saveData();
  elements.merchantForm.reset();
  elements.merchantDialog.close();
  render();
}

function openMerchantDialog() {
  elements.merchantDialog.showModal();
  elements.merchantNameInput.focus();
}

document.querySelector("#newMerchantButton").addEventListener("click", openMerchantDialog);
document.querySelector("#emptyNewMerchantButton").addEventListener("click", openMerchantDialog);
document.querySelector("#newBriefButton").addEventListener("click", () => {
  if (!activeMerchant()) return openMerchantDialog();
  const merchant = activeMerchant();
  merchant.draft = { chat: "", analysis: null, brief: {}, suggestion: null, state: "草稿" };
  saveData();
  renderWorkspace();
  elements.chatInput.focus();
});
document.querySelector("#analyzeButton").addEventListener("click", runAnalysis);
document.querySelector("#saveBriefButton").addEventListener("click", saveBrief);
document.querySelector("#confirmBriefButton").addEventListener("click", confirmBrief);
document.querySelector("#resetDemoButton").addEventListener("click", () => {
  data = structuredClone(defaultData);
  saveData();
  render();
});

elements.chatInput.addEventListener("input", () => {
  const merchant = activeMerchant();
  if (!merchant) return;
  merchant.draft.chat = elements.chatInput.value;
  merchant.draft.analysis = null;
  merchant.draft.state = "待分析";
  updateChatCount();
  saveData();
  renderAnalysis(merchant.draft);
});

elements.merchantList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-merchant-id]");
  if (!button) return;
  data.activeMerchantId = button.dataset.merchantId;
  saveData();
  render();
});

elements.profileSuggestion.addEventListener("click", (event) => {
  const action = event.target.dataset.profileAction;
  if (!action) return;
  const merchant = activeMerchant();
  if (action === "accept" && merchant.draft.suggestion && !merchant.profile.preferences.includes(merchant.draft.suggestion)) {
    merchant.profile.preferences.unshift(merchant.draft.suggestion);
  }
  merchant.draft.suggestion = null;
  saveData();
  renderProfile(merchant);
});

elements.merchantForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    elements.merchantDialog.close();
    return;
  }
  createMerchant();
});

render();
