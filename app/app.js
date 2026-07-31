const state = { merchants: [], activeMerchant: null, activeBrief: null, view: "workspace", lastAnalysisInput: null, editingSuggestionId: null };

const elements = {
  merchantList: document.querySelector("#merchantList"), merchantTitle: document.querySelector("#merchantTitle"), workspace: document.querySelector("#workspace"), emptyState: document.querySelector("#emptyState"), merchantView: document.querySelector("#merchantView"), merchantViewTitle: document.querySelector("#merchantViewTitle"),
  chatInput: document.querySelector("#chatInput"), artistNote: document.querySelector("#artistNote"), sourceType: document.querySelector("#sourceType"), useProfile: document.querySelector("#useProfile"), chatCount: document.querySelector("#chatCount"), chatState: document.querySelector("#chatState"), inputHint: document.querySelector("#inputHint"), analyzeButton: document.querySelector("#analyzeButton"),
  analysisState: document.querySelector("#analysisState"), analysisContent: document.querySelector("#analysisContent"), analysisError: document.querySelector("#analysisError"), analysisErrorText: document.querySelector("#analysisErrorText"), retryButton: document.querySelector("#retryButton"),
  briefState: document.querySelector("#briefState"), profileContent: document.querySelector("#profileContent"), profileConfidence: document.querySelector("#profileConfidence"), profileSuggestion: document.querySelector("#profileSuggestion"),
  merchantDialog: document.querySelector("#merchantDialog"), merchantForm: document.querySelector("#merchantForm"), merchantNameInput: document.querySelector("#merchantNameInput"), merchantIndustryInput: document.querySelector("#merchantIndustryInput"), merchantNoteInput: document.querySelector("#merchantNoteInput"), merchantKeywordsInput: document.querySelector("#merchantKeywordsInput"),
  merchantDetailForm: document.querySelector("#merchantDetailForm"), detailName: document.querySelector("#detailMerchantName"), detailIndustry: document.querySelector("#detailMerchantIndustry"), detailNote: document.querySelector("#detailMerchantNote"), detailKeywords: document.querySelector("#detailMerchantKeywords"), merchantHistory: document.querySelector("#merchantHistory"),
  briefDialog: document.querySelector("#briefDialog"), briefDialogTitle: document.querySelector("#briefDialogTitle"), briefDialogContent: document.querySelector("#briefDialogContent"), toast: document.querySelector("#toast"), backendState: document.querySelector("#backendState"), backendDot: document.querySelector("#backendDot"),
};

const fieldLabels = {
  title: "项目名称", goal: "本次作画目的", usage_scene: "使用场景", theme: "画面主题", subject: "主体与形象设定", style: "风格方向", colors: "色彩氛围", composition: "构图建议", must_have: "必须包含", flexible: "可发挥项", avoid: "避免出现", references: "参考信息", questions: "待确认问题", artist_note: "画师备注",
};

function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function draftKey(merchantId) { return `qdraw-input-${merchantId}`; }
function currentInput() { return { chat_text: elements.chatInput.value, artist_note: elements.artistNote.value, source_type: elements.sourceType.value, use_merchant_profile: elements.useProfile.checked }; }

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json; charset=utf-8", ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "请求失败，请稍后重试");
  return body;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.add("hidden"), 2400);
}

function setAnalysisStatus(text, kind = "") {
  elements.analysisState.textContent = text;
  elements.analysisState.className = `analysis-state ${kind}`.trim();
}

function setBusy(busy) {
  elements.analyzeButton.disabled = busy || !elements.chatInput.value.trim();
  elements.analyzeButton.textContent = busy ? "分析中..." : "开始分析";
  elements.retryButton.disabled = busy;
}

function renderMerchantList() {
  elements.merchantList.innerHTML = state.merchants.map((merchant) => {
    const active = merchant.id === state.activeMerchant?.id ? " active" : "";
    return `<button type="button" class="merchant-item${active}" data-merchant-id="${merchant.id}"><span class="merchant-avatar">${escapeHtml(merchant.name.slice(0, 1))}</span><span><span class="merchant-name">${escapeHtml(merchant.name)}</span><span class="merchant-meta">${merchant.brief_count} 个已确认任务</span></span></button>`;
  }).join("");
}

function renderAnalysis() {
  const analysis = state.activeBrief?.analysis;
  elements.analysisError.classList.add("hidden");
  if (!analysis?.summary) {
    setAnalysisStatus(elements.chatInput.value.trim() ? "可开始分析" : "等待聊天内容");
    elements.analysisContent.innerHTML = `<div class="analysis-placeholder">${elements.chatInput.value.trim() ? "点击“开始分析”提取作画需求。" : "粘贴聊天后，需求要点会显示在这里。"}</div>`;
    return;
  }
  const tags = (items, inferred = false) => items.length ? `<div class="tag-row">${items.map((item) => `<span class="tag${inferred ? " inferred" : ""}">${escapeHtml(item)}</span>`).join("")}</div>` : `<div class="analysis-text">未提取到</div>`;
  const history = analysis.history_comparison || {};
  const historyRows = [
    ["与历史一致", history.consistent_preferences], ["本次新增", history.new_requirements], ["可能冲突", history.possible_conflicts], ["接单建议", history.artist_suggestions],
  ].filter(([, items]) => items?.length).map(([label, items]) => `<div class="analysis-group"><div class="analysis-group-title">${label}</div>${tags(items, label === "可能冲突")}</div>`).join("");
  setAnalysisStatus(analysis.analysis_mode === "demo" ? "演示回退" : "AI 已生成", "ready");
  elements.analysisContent.innerHTML = `
    ${analysis.analysis_mode === "demo" ? `<div class="inline-error">未配置 AI 服务，当前显示的是本地演示分析。请在 .env 中配置 AI_API_KEY 和 AI_MODEL。</div>` : ""}
    <div class="analysis-group"><div class="analysis-group-title">项目标题</div><div class="analysis-text">${escapeHtml(analysis.project_title || "待画师命名")}</div></div>
    <div class="analysis-group"><div class="analysis-group-title">一句话摘要</div><div class="analysis-text">${escapeHtml(analysis.summary)}</div></div>
    <div class="analysis-group"><div class="analysis-group-title">关键词</div>${tags(analysis.keywords)}</div>
    <div class="analysis-group"><div class="analysis-group-title">商家明确要求</div>${tags(analysis.explicit_requirements)}</div>
    <div class="analysis-group"><div class="analysis-group-title">系统推断</div>${tags(analysis.inferred_requirements, true)}</div>
    <div class="analysis-group"><div class="analysis-group-title">待确认</div><ol class="question-list">${(analysis.questions_to_confirm || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>暂无</li>"}</ol></div>
    ${historyRows ? `<div class="analysis-group"><div class="analysis-group-title">历史画像对比</div></div>${historyRows}` : ""}`;
}

function renderBrief() {
  const brief = state.activeBrief?.brief || {};
  document.querySelectorAll("[data-brief-field]").forEach((field) => { field.value = brief[field.dataset.briefField] || ""; });
  elements.briefState.textContent = state.activeBrief?.status === "confirmed" ? "已确认" : state.activeBrief ? "草稿" : "新草稿";
  const disabled = !state.activeBrief || state.activeBrief.status === "confirmed";
  document.querySelectorAll("[data-brief-field], #saveBriefButton, #confirmBriefButton, #copyBriefButton, #copyQuestionsButton").forEach((control) => { control.disabled = disabled; });
}

function profileLabel(type) {
  return ({ style_preference: "风格偏好", composition_preference: "构图偏好", avoidance: "避雷项", new_preference: "新增偏好", reinforced_preference: "强化偏好", possible_change: "可能变化", one_off_requirement: "单次需求", communication_note: "沟通习惯" })[type] || "合作偏好";
}

function renderProfile() {
  const merchant = state.activeMerchant;
  if (!merchant) return;
  const items = merchant.profile_items || [];
  elements.profileConfidence.textContent = items.length ? `${items.length} 条已确认` : "待积累";
  const profileRows = items.length ? items.map((item) => `<li><div><strong>${escapeHtml(item.content)}</strong><div class="profile-meta">${profileLabel(item.type)} · 置信度 ${Math.round(item.confidence * 100)}%</div><div class="profile-meta">证据：${escapeHtml(item.evidence || "待补充")}</div></div></li>`).join("") : `<div class="profile-empty">确认任务书中的建议后，长期偏好会在这里积累。</div>`;
  const history = merchant.briefs.filter((brief) => brief.status === "confirmed");
  elements.profileContent.innerHTML = `
    <section class="profile-section"><div class="profile-title">已确认画像</div>${items.length ? `<ul class="preference-list">${profileRows}</ul>` : profileRows}</section>
    <section class="profile-section"><div class="profile-title">商家信息</div><div class="profile-empty">${escapeHtml([merchant.industry, merchant.contact_note, merchant.brand_keywords?.join("、")].filter(Boolean).join(" · ") || "待补充")}</div></section>
    <section class="profile-section"><div class="profile-title">历史任务</div><div class="project-history">${history.length ? history.slice(0, 4).map(historyButton).join("") : `<div class="profile-empty">还没有已确认的任务。</div>`}</div></section>`;
  const suggestions = merchant.profile_suggestions || [];
  if (!suggestions.length) { elements.profileSuggestion.classList.add("hidden"); return; }
  elements.profileSuggestion.classList.remove("hidden");
  elements.profileSuggestion.innerHTML = `<p>画像更新建议</p>${suggestions.map((item) => {
    const editing = state.editingSuggestionId === item.id;
    return `<div class="suggestion-row">${editing ? suggestionEditor(item) : `<div class="suggestion-type">${profileLabel(item.type)} · ${Math.round(item.confidence * 100)}%</div><div>${escapeHtml(item.content)}</div><div class="suggestion-evidence">${escapeHtml(item.evidence || "缺少来源证据")}</div><div class="suggestion-actions"><button class="small-button confirm" data-profile-action="accept" data-suggestion-id="${item.id}" type="button">采纳</button><button class="small-button" data-profile-action="edit" data-suggestion-id="${item.id}" type="button">编辑后采纳</button><button class="small-button" data-profile-action="ignore" data-suggestion-id="${item.id}" type="button">忽略</button></div>`}</div>`;
  }).join("")}`;
}

function suggestionEditor(item) {
  const types = [["new_preference", "新增偏好"], ["reinforced_preference", "强化偏好"], ["possible_change", "可能变化"], ["one_off_requirement", "单次需求"], ["communication_note", "沟通习惯"], ["avoidance", "避雷项"]];
  return `<div class="suggestion-editor" data-suggestion-editor="${item.id}"><textarea data-suggestion-field="content">${escapeHtml(item.content)}</textarea><select data-suggestion-field="type">${types.map(([value, label]) => `<option value="${value}"${item.type === value ? " selected" : ""}>${label}</option>`).join("")}</select><input data-suggestion-field="confidence" type="number" min="10" max="95" value="${Math.round(item.confidence * 100)}" title="置信度百分比" /><div class="suggestion-evidence">${escapeHtml(item.evidence || "缺少来源证据")}</div><div class="suggestion-actions"><button class="small-button confirm" data-profile-action="accept" data-suggestion-id="${item.id}" type="button">确认采纳</button><button class="small-button" data-profile-action="cancel-edit" data-suggestion-id="${item.id}" type="button">取消</button></div></div>`;
}

function historyButton(brief) { return `<button class="history-item" data-brief-id="${brief.id}" type="button"><div class="history-title">${escapeHtml(brief.title)}</div><div class="history-date">${new Date(brief.confirmed_at || brief.updated_at).toLocaleDateString("zh-CN")} · 已确认</div></button>`; }

function renderMerchantView() {
  const merchant = state.activeMerchant;
  if (!merchant) return;
  elements.merchantViewTitle.textContent = merchant.name;
  elements.detailName.value = merchant.name;
  elements.detailIndustry.value = merchant.industry || "";
  elements.detailNote.value = merchant.contact_note || "";
  elements.detailKeywords.value = (merchant.brand_keywords || []).join("、");
  elements.merchantHistory.innerHTML = merchant.briefs.length ? merchant.briefs.map(historyButton).join("") : `<div class="profile-empty">还没有任务归档。</div>`;
}

function render() {
  renderMerchantList();
  const hasMerchant = Boolean(state.activeMerchant);
  elements.merchantTitle.textContent = state.view === "merchants" ? "商家管理" : (state.activeMerchant?.name || "选择一个商家");
  elements.workspace.classList.toggle("hidden", state.view !== "workspace" || !hasMerchant);
  elements.merchantView.classList.toggle("hidden", state.view !== "merchants" || !hasMerchant);
  elements.emptyState.classList.toggle("hidden", hasMerchant || state.view !== "workspace");
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  if (hasMerchant) { renderAnalysis(); renderBrief(); renderProfile(); renderMerchantView(); }
}

function updateChatInput() {
  const chat = elements.chatInput.value;
  elements.chatCount.textContent = `${chat.trim().length} 字`;
  const notices = [];
  if (chat.trim().length && chat.trim().length < 20) notices.push("聊天内容较短，分析结果可能不完整。");
  if (/1[3-9]\d{9}|[\w.+-]+@[\w-]+\.[\w.-]+|微信[号號]|地址|收货|报价|银行卡/.test(chat)) notices.push("检测到可能含有敏感信息。分析后可在历史任务中删除原始聊天。 ");
  elements.inputHint.classList.toggle("hidden", !notices.length);
  elements.inputHint.textContent = notices.join(" ");
  elements.analyzeButton.disabled = !chat.trim();
  if (state.activeMerchant) sessionStorage.setItem(draftKey(state.activeMerchant.id), JSON.stringify(currentInput()));
  if (!state.activeBrief) renderAnalysis();
}

async function refreshMerchant(id = state.activeMerchant?.id) {
  if (!id) return;
  const { merchant } = await api(`/api/merchants/${id}`);
  state.activeMerchant = merchant;
  state.merchants = state.merchants.map((item) => item.id === merchant.id ? { ...item, brief_count: merchant.briefs.filter((brief) => brief.status === "confirmed").length, profile_count: merchant.profile_items.filter((item) => item.status === "active").length } : item);
}

async function selectMerchant(id) {
  try {
    await refreshMerchant(id);
    state.activeBrief = null;
    const draft = sessionStorage.getItem(draftKey(id));
    const input = draft ? JSON.parse(draft) : { chat_text: "", artist_note: "", source_type: "new_requirement", use_merchant_profile: true };
    elements.chatInput.value = input.chat_text || "";
    elements.artistNote.value = input.artist_note || "";
    elements.sourceType.value = input.source_type || "new_requirement";
    elements.useProfile.checked = input.use_merchant_profile !== false;
    updateChatInput();
    render();
  } catch (error) { showToast(error.message); }
}

async function runAnalysis() {
  const merchant = state.activeMerchant;
  const input = currentInput();
  if (!merchant || !input.chat_text.trim()) return;
  state.lastAnalysisInput = input;
  elements.analysisError.classList.add("hidden");
  setAnalysisStatus("分析中", "loading");
  elements.analysisContent.innerHTML = `<div class="analysis-placeholder">正在整理需求、比对历史画像并生成任务书...</div>`;
  setBusy(true);
  try {
    const result = await api("/api/briefs/analyze", { method: "POST", body: JSON.stringify({ merchant_id: merchant.id, ...input }) });
    state.activeBrief = result.brief;
    sessionStorage.removeItem(draftKey(merchant.id));
    await refreshMerchant();
    render();
    showToast(result.analysis_mode === "ai" ? "AI 分析完成" : "已生成演示分析，请配置 AI 服务");
  } catch (error) {
    setAnalysisStatus("分析失败");
    elements.analysisErrorText.textContent = error.message;
    elements.analysisError.classList.remove("hidden");
    elements.analysisContent.innerHTML = `<div class="analysis-placeholder">原始聊天已保留，可修正后重试。</div>`;
  } finally { setBusy(false); }
}

function getEditedBrief() {
  return Object.fromEntries([...document.querySelectorAll("[data-brief-field]")].map((field) => [field.dataset.briefField, field.value.trim()]));
}

function asMarkdown(brief, merchant) {
  return `# ${brief.title || "未命名作画任务"}\n\n商家：${merchant.name}\n状态：${state.activeBrief?.status === "confirmed" ? "已确认" : "草稿"}\n\n${Object.entries(fieldLabels).filter(([key]) => key !== "title").map(([key, label]) => `## ${label}\n${brief[key] || "待确认"}`).join("\n\n")}`;
}

async function copyText(text, successMessage) {
  try { await navigator.clipboard.writeText(text); showToast(successMessage); }
  catch { showToast("浏览器不支持自动复制，请手动选择内容。\n" + text); }
}

async function saveBrief() {
  if (!state.activeBrief || state.activeBrief.status === "confirmed") return;
  try {
    const { brief } = await api(`/api/briefs/${state.activeBrief.id}`, { method: "PATCH", body: JSON.stringify({ title: getEditedBrief().title, artist_note: getEditedBrief().artist_note, brief: getEditedBrief() }) });
    state.activeBrief = brief;
    await refreshMerchant();
    render();
    showToast("任务书草稿已保存");
  } catch (error) { showToast(error.message); }
}

async function confirmBrief() {
  if (!state.activeBrief) return;
  await saveBrief();
  try {
    const { brief } = await api(`/api/briefs/${state.activeBrief.id}/confirm`, { method: "POST", body: "{}" });
    state.activeBrief = brief;
    await refreshMerchant();
    render();
    showToast("任务书已确认并归档");
  } catch (error) { showToast(error.message); }
}

async function resolveSuggestion(event) {
  const button = event.target.closest("[data-profile-action]");
  if (!button) return;
  if (button.dataset.profileAction === "edit") { state.editingSuggestionId = button.dataset.suggestionId; renderProfile(); return; }
  if (button.dataset.profileAction === "cancel-edit") { state.editingSuggestionId = null; renderProfile(); return; }
  try {
    let payload = {};
    if (button.dataset.profileAction === "accept") {
      const editor = elements.profileSuggestion.querySelector(`[data-suggestion-editor="${button.dataset.suggestionId}"]`);
      if (editor) payload = { content: editor.querySelector('[data-suggestion-field="content"]').value, type: editor.querySelector('[data-suggestion-field="type"]').value, confidence: Number(editor.querySelector('[data-suggestion-field="confidence"]').value) / 100 };
    }
    const { merchant } = await api(`/api/profile-suggestions/${button.dataset.suggestionId}/${button.dataset.profileAction}`, { method: "POST", body: JSON.stringify(payload) });
    state.activeMerchant = merchant;
    state.editingSuggestionId = null;
    state.merchants = state.merchants.map((item) => item.id === merchant.id ? { ...item, profile_count: merchant.profile_items.length } : item);
    render();
    showToast(button.dataset.profileAction === "accept" ? "画像建议已采纳" : "画像建议已忽略");
  } catch (error) { showToast(error.message); }
}

async function openBrief(id) {
  try {
    const { brief } = await api(`/api/briefs/${id}`);
    elements.briefDialogTitle.textContent = brief.title;
    const briefFields = Object.entries(fieldLabels).filter(([key]) => key !== "title" && brief.brief[key]).map(([key, label]) => `<div class="detail-pair"><strong>${label}</strong><span>${escapeHtml(brief.brief[key])}</span></div>`).join("") || `<p>任务书字段尚未补充。</p>`;
    const analysis = brief.analysis || {};
    const profileUpdates = brief.profile_updates || [];
    const suggestions = brief.profile_suggestions || [];
    const rawSource = brief.chat_text ? `<div class="raw-chat">${escapeHtml(brief.chat_text)}</div><div class="privacy-row"><span>原始聊天已保存，可能含有商家隐私信息。</span><button class="danger-button" data-delete-raw-source="${brief.id}" type="button">删除原始聊天</button></div>` : `<div class="privacy-row"><span>原始聊天已删除，任务书与画像记录仍保留。</span></div>`;
    elements.briefDialogContent.innerHTML = `
      <section class="detail-section"><h3>最终任务书</h3><div class="detail-grid">${briefFields}</div></section>
      <section class="detail-section"><h3>需求分析</h3><p>${escapeHtml(analysis.summary || "未保存分析摘要")}</p><div class="tag-row">${(analysis.explicit_requirements || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div></section>
      <section class="detail-section"><h3>画像更新记录</h3><p>${profileUpdates.length ? profileUpdates.map((item) => `${profileLabel(item.type)}：${item.content}`).join("；") : "未采纳画像建议。"}</p><p class="profile-meta">本次生成 ${suggestions.length} 条建议，已采纳 ${profileUpdates.length} 条。</p></section>
      <section class="detail-section"><h3>原始聊天</h3>${rawSource}</section>`;
    elements.briefDialog.showModal();
  } catch (error) { showToast(error.message); }
}

async function deleteRawSource(id) {
  if (!window.confirm("删除后不能恢复原始聊天，但任务书和画像记录会保留。确定删除吗？")) return;
  try {
    const { brief } = await api(`/api/briefs/${id}/raw-source`, { method: "DELETE" });
    elements.briefDialog.close();
    await openBrief(brief.id);
    showToast("原始聊天已删除");
  } catch (error) { showToast(error.message); }
}

function startNewBrief() {
  if (!state.activeMerchant) return openMerchantDialog();
  state.view = "workspace";
  state.activeBrief = null;
  sessionStorage.removeItem(draftKey(state.activeMerchant.id));
  elements.chatInput.value = ""; elements.artistNote.value = ""; elements.sourceType.value = "new_requirement"; elements.useProfile.checked = true;
  updateChatInput(); render(); elements.chatInput.focus();
}

function openMerchantDialog() { elements.merchantDialog.showModal(); elements.merchantNameInput.focus(); }

async function createMerchant() {
  try {
    const { merchant } = await api("/api/merchants", { method: "POST", body: JSON.stringify({ name: elements.merchantNameInput.value, industry: elements.merchantIndustryInput.value, contact_note: elements.merchantNoteInput.value, brand_keywords: elements.merchantKeywordsInput.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) }) });
    elements.merchantForm.reset(); elements.merchantDialog.close();
    state.merchants.unshift({ ...merchant, brief_count: 0, profile_count: 0 });
    await selectMerchant(merchant.id); showToast("商家已创建");
  } catch (error) { showToast(error.message); }
}

async function saveMerchantDetails(event) {
  event.preventDefault();
  if (!state.activeMerchant) return;
  try {
    const { merchant } = await api(`/api/merchants/${state.activeMerchant.id}`, { method: "PATCH", body: JSON.stringify({ name: elements.detailName.value, industry: elements.detailIndustry.value, contact_note: elements.detailNote.value, brand_keywords: elements.detailKeywords.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) }) });
    state.activeMerchant = merchant;
    state.merchants = state.merchants.map((item) => item.id === merchant.id ? { ...item, name: merchant.name } : item);
    render(); showToast("商家资料已保存");
  } catch (error) { showToast(error.message); }
}

async function removeMerchant() {
  const merchant = state.activeMerchant;
  if (!merchant || !window.confirm(`确定删除“${merchant.name}”及其全部任务和画像吗？此操作不可恢复。`)) return;
  try {
    await api(`/api/merchants/${merchant.id}`, { method: "DELETE" });
    state.merchants = state.merchants.filter((item) => item.id !== merchant.id);
    state.activeMerchant = null; state.activeBrief = null;
    if (state.merchants[0]) await selectMerchant(state.merchants[0].id);
    else render();
    showToast("商家已删除");
  } catch (error) { showToast(error.message); }
}

async function init() {
  try {
    const health = await api("/api/health");
    elements.backendState.textContent = health.ai_configured ? "AI 服务已连接" : "演示 AI 模式";
    if (!health.ai_configured) elements.backendDot.style.background = "#d3a63c";
    const { merchants } = await api("/api/merchants");
    state.merchants = merchants;
    if (merchants.length) await selectMerchant(merchants[0].id);
    else render();
  } catch (error) {
    elements.backendState.textContent = "后端未连接"; elements.backendDot.style.background = "#d75a4a";
    showToast("无法连接后端，请运行 npm start。"); render();
  }
}

document.querySelector("#newMerchantButton").addEventListener("click", openMerchantDialog);
document.querySelector("#emptyNewMerchantButton").addEventListener("click", openMerchantDialog);
document.querySelector("#newBriefButton").addEventListener("click", startNewBrief);
document.querySelector("#merchantViewNewBrief").addEventListener("click", startNewBrief);
elements.analyzeButton.addEventListener("click", runAnalysis);
elements.retryButton.addEventListener("click", runAnalysis);
elements.chatInput.addEventListener("input", updateChatInput);
elements.artistNote.addEventListener("input", updateChatInput);
elements.sourceType.addEventListener("change", updateChatInput);
elements.useProfile.addEventListener("change", updateChatInput);
document.querySelector("#saveBriefButton").addEventListener("click", saveBrief);
document.querySelector("#confirmBriefButton").addEventListener("click", confirmBrief);
document.querySelector("#copyBriefButton").addEventListener("click", () => state.activeBrief && copyText(asMarkdown(getEditedBrief(), state.activeMerchant), "任务书已复制"));
document.querySelector("#copyQuestionsButton").addEventListener("click", () => copyText(getEditedBrief().questions || "暂无待确认问题", "待确认问题已复制"));
document.querySelector("#closeBriefDialog").addEventListener("click", () => elements.briefDialog.close());
document.querySelector("#deleteMerchantButton").addEventListener("click", removeMerchant);
elements.merchantDetailForm.addEventListener("submit", saveMerchantDetails);
elements.merchantForm.addEventListener("submit", (event) => { event.preventDefault(); if (event.submitter?.value === "cancel") return elements.merchantDialog.close(); createMerchant(); });
elements.merchantList.addEventListener("click", (event) => { const button = event.target.closest("[data-merchant-id]"); if (button) selectMerchant(button.dataset.merchantId); });
elements.profileSuggestion.addEventListener("click", resolveSuggestion);
elements.profileContent.addEventListener("click", (event) => { const button = event.target.closest("[data-brief-id]"); if (button) openBrief(button.dataset.briefId); });
elements.merchantHistory.addEventListener("click", (event) => { const button = event.target.closest("[data-brief-id]"); if (button) openBrief(button.dataset.briefId); });
elements.briefDialog.addEventListener("click", (event) => { const button = event.target.closest("[data-delete-raw-source]"); if (button) deleteRawSource(button.dataset.deleteRawSource); });
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; render(); }));

init();
