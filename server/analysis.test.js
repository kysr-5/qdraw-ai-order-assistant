import test from "node:test";
import assert from "node:assert/strict";
import { analysisToBrief, createDemoAnalysis, normalizeAnalysis } from "./analysis.js";

test("normalizes incomplete AI output into a stable task schema", () => {
  const analysis = normalizeAnalysis({
    summary: "  测试摘要  ",
    explicit_requirements: ["保留文字区域"],
    main_subject: { type: "人物", props: ["花束"] },
    profile_update_suggestions: { new_preferences: [{ content: "偏好留白", confidence: 2 }] },
  });

  assert.equal(analysis.summary, "测试摘要");
  assert.deepEqual(analysis.main_subject.props, ["花束"]);
  assert.equal(analysis.profile_update_suggestions.new_preferences[0].confidence, 0.95);
  assert.deepEqual(analysis.questions_to_confirm, []);
});

test("demo analysis uses historical profile in the comparison result", () => {
  const analysis = createDemoAnalysis(
    { chat_text: "想做可爱手绘的夏日活动海报，不要写实。", artist_note: "", source_type: "new_requirement" },
    { profile_items: [{ content: "偏好可爱手绘与明快配色" }, { content: "不喜欢过强的写实质感" }] },
  );
  const brief = analysisToBrief(analysis, { artist_note: "先确认报价" });

  assert.ok(analysis.history_comparison.consistent_preferences.includes("偏好可爱手绘与明快配色"));
  assert.match(brief.style, /可爱手绘/);
  assert.equal(brief.artist_note, "先确认报价");
});
