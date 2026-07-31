import test from "node:test";
import assert from "node:assert/strict";
import { createDemoSketchPlan, normalizeSketchPlan, renderSketchSvg } from "./sketch.js";

test("normalizes sketch plans into stable drawable fields", () => {
  const plan = normalizeSketchPlan({
    title: "  草莓蛋糕海报草图  ",
    aspect_ratio: "poster",
    elements: [{ label: "女生", role: "person", position: "middle", size: "huge", note: "视觉中心" }],
    text_zones: [{ label: "标题", position: "header" }],
  });

  assert.equal(plan.title, "草莓蛋糕海报草图");
  assert.equal(plan.aspect_ratio, "portrait");
  assert.equal(plan.elements[0].position, "center");
  assert.equal(plan.elements[0].size, "medium");
  assert.equal(plan.text_zones[0].position, "top");
});

test("renders a demo sketch svg from a confirmed brief", () => {
  const brief = {
    title: "咖啡店春天海报",
    brief: {
      usage_scene: "小红书海报",
      subject: "年轻女生，草莓蛋糕，拿铁咖啡",
      must_have: "女生；草莓蛋糕；拿铁咖啡",
      style: "温暖手绘风",
      colors: "奶油黄、淡粉色",
      composition: "主体居中，顶部预留标题",
    },
  };
  const plan = createDemoSketchPlan(brief);
  const svg = renderSketchSvg(plan);

  assert.equal(plan.aspect_ratio, "portrait");
  assert.ok(plan.elements.some((item) => item.label.includes("女生")));
  assert.match(svg, /^<svg/);
  assert.match(svg, /咖啡店春天海报/);
});
