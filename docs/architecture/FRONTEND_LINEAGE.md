# 前端血缘与 DSH 迁移决策

更新日期：2026-08-16

## 当前两条前端线

1. `LL-LK/cl-agent` 是谭力奎独立维护的上游仓库，已经继续演进到 UI-5。此前的 `codex/wire-real-data` 修复 PR 已关闭且未合并。
2. 本仓库 `workbench/` 是 2026-08-12 从 cl-agent UI-3 分出的独立代码副本。分叉后已接入本仓库真实 Python 工作流、Node API 和知识数据，因此不再等同于 cl-agent 上游。

## 已验证事实

- `workbench/` Web 入口能够读取真实核心 DOI 证据、MatKG 弱证据和搜索产物；
- Python、Node/TypeScript 和 Vite 构建均有真实验证；
- Electron 入口在当前 Windows 环境以退出码 `3221225477` 原生崩溃，因此不是当前稳定入口；
- 数据仍是 CSV/JSON，Node 任务状态仍为内存态，这些边界不得包装成正式数据库或持久化服务。

## 决策

- 不再把 cl-agent UI-5 当作需要持续同步的产品上游；
- 不把已关闭的 `codex/wire-real-data` PR 当作本项目依赖；
- `workbench/` 保留为已验证的 Science/阅读功能迁移来源；
- DSH 负责宿主、真实会话、模型、工具、权限和持久化；
- 第一方 DSH Client 插件负责把阅读与 Science 入口组合进公开插槽；
- 不复制 cl-agent 的后续 UI，也不把现有 Express Demo 冒充为 DSH Host 服务。

## “已开发约四分之一”的口径

若继续使用“已开发约四分之一”的描述，它只表示 `workbench/` 已完成前端与真实材料后端的 MVP 融合，不表示 DSH 插件化、桌面稳定性、数据库持久化或正式产品已经完成。

## 当前迁移顺序

1. 建立比赛仓库自有的最小 DSH Client 插件并验证生命周期；
2. 通过公开 DSH 服务与插槽迁移阅读界面；
3. 将 Science 动作迁移到第一方 Host 服务，避免长期运行第二套独立 Express 会话后端；
4. 在公开详情选择接口阻塞解除后再完成工具详情组合；
5. 完成动态端口、单实例、崩溃恢复和 Pro 兼容闸门后，才扩大正式 UI 范围。
