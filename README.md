# Qdraw AI 接单助手

## 运行产品

此版本已升级为带 SQLite 持久化的本地服务。启动后访问 `http://localhost:3000`：

```powershell
npm start
```

数据会保存到本机的 `data/qdraw.db`。商家、完整任务书、画像条目与画像建议均通过后端接口读写，刷新页面不会丢失。

默认处于明确标识的“演示 AI 模式”。若要接入真实模型服务，将 [`.env.example`](./.env.example) 复制为 `.env`，再填写：

DeepSeek 和阿里云百炼都可以直接使用，二选一即可：

```text
# DeepSeek
AI_API_URL=https://api.deepseek.com/chat/completions
AI_API_KEY=你的 DeepSeek API Key
AI_MODEL=deepseek-v4-flash
```

```text
# 阿里云百炼，将 {WorkspaceId} 换为业务空间 ID
AI_API_URL=https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions
AI_API_KEY=你的百炼 API Key
AI_MODEL=qwen-plus
```

后端会统一调用模型、要求 JSON 输出并规范化结果；前端不会接触密钥。

## 项目文档索引

## 成稿审查配置

成稿审查分为两条模型链路：文本模型用于聊天需求提取与商家反馈整理；视觉模型用于读取成稿、核对任务书和提取画面审查证据。密钥只填写在本机 `.env`，前端不会接触密钥。

```text
# DeepSeek：文本需求与修改单
TEXT_AI_API_URL=https://api.deepseek.com/chat/completions
TEXT_AI_API_KEY=你的 DeepSeek API Key
TEXT_AI_MODEL=deepseek-chat

# 阿里云百炼：成稿图片审查（将 WorkspaceId 换为业务空间 ID）
VISION_AI_API_URL=https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions
VISION_AI_API_KEY=你的百炼 API Key
VISION_AI_MODEL=qwen3.7-plus
```

操作顺序：确认任务书 → 上传 PNG/JPG/WebP 成稿（建议小于 7 MB）→ 查看审美要素与需求核对 → 粘贴商家反馈 → 生成画师修改单。未配置模型时，系统会明确标记为“演示审查”，不会把演示结果伪装成真实的视觉判断。

这个目录用于沉淀 Qdraw 后续规划、需求、产品迭代、技术认证和里程碑资料。

## 目录结构

- `01_规划文档/`: 项目愿景、目标用户、业务边界、阶段规划。
- `02_SPEC文档/`: 产品需求、功能规格、交互说明、接口约定。
- `03_产品迭代/`: 版本计划、迭代记录、待办池、发布复盘。
- `04_技术认证/`: 技术可行性验证、方案对比、PoC 记录、风险结论。
- `05_里程碑文档/`: 阶段目标、关键节点、验收标准、交付记录。

## 建议命名

建议使用 `YYYY-MM-DD_主题.md` 命名，例如：

- `2026-07-31_项目初始规划.md`
- `2026-07-31_绘图画布SPEC.md`
- `2026-07-31_MVP里程碑.md`
