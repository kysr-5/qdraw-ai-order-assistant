import test from "node:test";
import assert from "node:assert/strict";
import { createDemoRevision, normalizeAudit, normalizeRevision } from "./review.js";

test("normalizes visual audit output into stable review fields", () => {
  const audit = normalizeAudit({
    summary: "  画面主体清晰  ",
    aesthetic_dimensions: [{ name: "构图", rating: 8, observation: "焦点明确" }],
    requirement_checks: [{ requirement: "包含小女孩", status: "partial", evidence: "人物位于画面左侧" }],
    issues: [{ severity: "urgent", category: "构图", observation: "标题区拥挤" }],
  });

  assert.equal(audit.summary, "画面主体清晰");
  assert.equal(audit.aesthetic_dimensions[0].rating, 5);
  assert.equal(audit.requirement_checks[0].status, "partial");
  assert.equal(audit.issues[0].severity, "medium");
});

test("creates a revision brief that keeps merchant feedback separate and actionable", () => {
  const audit = normalizeAudit({
    issues: [{ severity: "high", category: "构图", observation: "蛋糕不够突出", recommendation: "放大蛋糕并靠近视觉中心" }],
    requirement_checks: [{ requirement: "草莓蛋糕", status: "partial", evidence: "可见但偏小", recommendation: "提升蛋糕面积与对比度" }],
  });
  const revision = createDemoRevision(audit, "整体更清新一点，人物表情不要改");
  const normalized = normalizeRevision(revision);

  assert.equal(normalized.merchant_intent[0], "整体更清新一点，人物表情不要改");
  assert.match(normalized.must_change[0].action, /商家反馈/);
  assert.ok(normalized.must_change.some((item) => item.action.includes("蛋糕")));
});
