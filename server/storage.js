import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const databasePath = join(rootDirectory, "data", "qdraw.db");
mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    industry TEXT NOT NULL DEFAULT '',
    contact_note TEXT NOT NULL DEFAULT '',
    brand_keywords TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_briefs (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'new_requirement',
    chat_text TEXT NOT NULL DEFAULT '',
    artist_note TEXT NOT NULL DEFAULT '',
    analysis_json TEXT NOT NULL DEFAULT '{}',
    brief_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    confirmed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS profile_items (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    evidence TEXT NOT NULL DEFAULT '',
    source_brief_id TEXT REFERENCES project_briefs(id) ON DELETE SET NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE TABLE IF NOT EXISTS profile_suggestions (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    brief_id TEXT NOT NULL REFERENCES project_briefs(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    evidence TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 0.5,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );
`);

const now = () => new Date().toISOString();
const fromJson = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

function hydrateBrief(row) {
  if (!row) return null;
  const brief = {
    ...row,
    analysis: fromJson(row.analysis_json, {}),
    brief: fromJson(row.brief_json, {}),
    analysis_json: undefined,
    brief_json: undefined,
  };
  brief.profile_suggestions = db.prepare("SELECT * FROM profile_suggestions WHERE brief_id = ? ORDER BY created_at ASC").all(row.id).map(hydrateSuggestion);
  brief.profile_updates = db.prepare("SELECT * FROM profile_items WHERE source_brief_id = ? ORDER BY last_seen_at ASC").all(row.id).map(hydrateProfileItem);
  return brief;
}

function hydrateProfileItem(row) {
  return { ...row, confidence: Number(row.confidence) };
}

function hydrateSuggestion(row) {
  return { ...row, confidence: Number(row.confidence) };
}

export function listMerchants() {
  return db.prepare(`
    SELECT m.*, COUNT(DISTINCT b.id) AS brief_count, COUNT(DISTINCT p.id) AS profile_count
    FROM merchants m
    LEFT JOIN project_briefs b ON b.merchant_id = m.id AND b.status = 'confirmed'
    LEFT JOIN profile_items p ON p.merchant_id = m.id AND p.status = 'active'
    GROUP BY m.id
    ORDER BY m.updated_at DESC
  `).all().map((row) => ({
    ...row,
    brand_keywords: fromJson(row.brand_keywords, []),
    brief_count: Number(row.brief_count),
    profile_count: Number(row.profile_count),
  }));
}

export function getMerchant(id) {
  const row = db.prepare("SELECT * FROM merchants WHERE id = ?").get(id);
  if (!row) return null;
  const briefs = db.prepare(`SELECT * FROM project_briefs WHERE merchant_id = ? ORDER BY updated_at DESC`).all(id).map(hydrateBrief);
  const profileItems = db.prepare(`SELECT * FROM profile_items WHERE merchant_id = ? ORDER BY last_seen_at DESC`).all(id).map(hydrateProfileItem);
  const suggestions = db.prepare(`SELECT * FROM profile_suggestions WHERE merchant_id = ? AND status = 'pending' ORDER BY created_at DESC`).all(id).map(hydrateSuggestion);
  return { ...row, brand_keywords: fromJson(row.brand_keywords, []), briefs, profile_items: profileItems, profile_suggestions: suggestions };
}

export function createMerchant(input) {
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`INSERT INTO merchants (id, name, industry, contact_note, brand_keywords, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.name.trim(), input.industry?.trim() || "", input.contact_note?.trim() || "", JSON.stringify(input.brand_keywords || []), createdAt, createdAt);
  return getMerchant(id);
}

export function updateMerchant(id, input) {
  const current = getMerchant(id);
  if (!current) return null;
  db.prepare(`UPDATE merchants SET name = ?, industry = ?, contact_note = ?, brand_keywords = ?, updated_at = ? WHERE id = ?`).run(
    input.name?.trim() || current.name,
    input.industry?.trim() || "",
    input.contact_note?.trim() || "",
    JSON.stringify(Array.isArray(input.brand_keywords) ? input.brand_keywords : current.brand_keywords),
    now(),
    id,
  );
  return getMerchant(id);
}

export function deleteMerchant(id) {
  return db.prepare("DELETE FROM merchants WHERE id = ?").run(id).changes > 0;
}

export function createAnalyzedBrief(input) {
  const id = randomUUID();
  const createdAt = now();
  const title = input.brief.title || input.analysis.drawing_goal || "未命名作画任务";
  db.prepare(`INSERT INTO project_briefs (id, merchant_id, title, source_type, chat_text, artist_note, analysis_json, brief_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
    .run(id, input.merchant_id, title, input.source_type, input.chat_text, input.artist_note || "", JSON.stringify(input.analysis), JSON.stringify(input.brief), createdAt, createdAt);
  for (const suggestion of input.suggestions) {
    db.prepare(`INSERT INTO profile_suggestions (id, merchant_id, brief_id, type, content, evidence, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .run(randomUUID(), input.merchant_id, id, suggestion.type, suggestion.content, suggestion.evidence || "", suggestion.confidence || 0.6, createdAt);
  }
  return getBrief(id);
}

export function getBrief(id) {
  return hydrateBrief(db.prepare("SELECT * FROM project_briefs WHERE id = ?").get(id));
}

export function updateBrief(id, input) {
  const current = getBrief(id);
  if (!current) return null;
  const brief = { ...current.brief, ...(input.brief || {}) };
  const title = input.title?.trim() || brief.title || current.title;
  db.prepare(`UPDATE project_briefs SET title = ?, artist_note = ?, brief_json = ?, updated_at = ? WHERE id = ?`).run(
    title,
    input.artist_note ?? current.artist_note,
    JSON.stringify(brief),
    now(),
    id,
  );
  return getBrief(id);
}

export function confirmBrief(id) {
  const brief = getBrief(id);
  if (!brief) return null;
  const timestamp = now();
  db.prepare(`UPDATE project_briefs SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ?`).run(timestamp, timestamp, id);
  db.prepare("UPDATE merchants SET updated_at = ? WHERE id = ?").run(timestamp, brief.merchant_id);
  return getBrief(id);
}

export function acceptSuggestion(id, override = {}) {
  const suggestion = db.prepare("SELECT * FROM profile_suggestions WHERE id = ?").get(id);
  if (!suggestion || suggestion.status !== "pending") return null;
  const timestamp = now();
  const content = override.content?.trim() || suggestion.content;
  const type = override.type?.trim() || suggestion.type;
  const confidence = Math.min(0.95, Math.max(0.1, Number(override.confidence) || suggestion.confidence));
  const duplicate = db.prepare(`SELECT id FROM profile_items WHERE merchant_id = ? AND content = ? AND status = 'active'`).get(suggestion.merchant_id, content);
  if (duplicate) {
    db.prepare("UPDATE profile_items SET last_seen_at = ?, confidence = MAX(confidence, ?) WHERE id = ?").run(timestamp, confidence, duplicate.id);
  } else {
    db.prepare(`INSERT INTO profile_items (id, merchant_id, type, content, evidence, source_brief_id, confidence, first_seen_at, last_seen_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`)
      .run(randomUUID(), suggestion.merchant_id, type, content, suggestion.evidence, suggestion.brief_id, confidence, timestamp, timestamp);
  }
  db.prepare("UPDATE profile_suggestions SET status = 'accepted', resolved_at = ? WHERE id = ?").run(timestamp, id);
  return getMerchant(suggestion.merchant_id);
}

export function ignoreSuggestion(id) {
  const suggestion = db.prepare("SELECT * FROM profile_suggestions WHERE id = ?").get(id);
  if (!suggestion || suggestion.status !== "pending") return null;
  db.prepare("UPDATE profile_suggestions SET status = 'ignored', resolved_at = ? WHERE id = ?").run(now(), id);
  return getMerchant(suggestion.merchant_id);
}

export function deleteBriefRawSource(id) {
  const brief = getBrief(id);
  if (!brief) return null;
  db.prepare("UPDATE project_briefs SET chat_text = '', updated_at = ? WHERE id = ?").run(now(), id);
  return getBrief(id);
}

export function getAnalysisContext(merchantId) {
  const merchant = getMerchant(merchantId);
  if (!merchant) return null;
  return {
    merchant: {
      name: merchant.name,
      industry: merchant.industry,
      contact_note: merchant.contact_note,
      brand_keywords: merchant.brand_keywords,
    },
    profile_items: merchant.profile_items.filter((item) => item.status === "active"),
    recent_briefs: merchant.briefs.filter((brief) => brief.status === "confirmed").slice(0, 5).map((brief) => ({ id: brief.id, title: brief.title, brief: brief.brief })),
  };
}

export function seedDemoData() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM merchants").get().count;
  if (count > 0) return;
  const merchant = createMerchant({ name: "花田咖啡", industry: "咖啡店", contact_note: "小红书店铺，合作过 2 次", brand_keywords: ["夏日", "亲切", "手绘"] });
  const timestamp = now();
  for (const item of [
    ["style_preference", "偏好可爱手绘与明快配色", "历史合作中多次要求可爱手绘和明快配色", 0.82],
    ["composition_preference", "需要为文字和活动日期保留排版空间", "菜单和活动海报均要求预留标题区", 0.79],
    ["avoidance", "不喜欢过强的写实质感", "商家反馈写实感不适合品牌", 0.72],
  ]) {
    db.prepare(`INSERT INTO profile_items (id, merchant_id, type, content, evidence, confidence, first_seen_at, last_seen_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`)
      .run(randomUUID(), merchant.id, item[0], item[1], item[2], item[3], timestamp, timestamp);
  }
}
