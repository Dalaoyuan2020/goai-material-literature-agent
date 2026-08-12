# Material Literature Workbench API Server

本地桥接服务：知识库接口读取仓库真实 CSV/报告，工作流接口通过 `src/ui_bridge.py` 执行 `agent/workflow.json` 白名单内的 Python 动作。默认监听 `0.0.0.0:8787`。

## 初始化

```powershell
cd server
npm install
copy .env.example .env
npm run dev
```

## 启动

```powershell
npm run dev       # 开发
npm run build     # 编译
npm start         # 运行编译产物
npm run typecheck # 类型检查
```

## 配置

| 变量 | 默认值 | 说明 |
|---|---|---|
| HOST | 0.0.0.0 | 监听地址，便于局域网/容器部署 |
| PORT | 8787 | HTTP 端口 |
| API_KEY | dev-key-change-me | 所有接口必须携带 `X-Api-Key` |
| CORS_ORIGIN | 前端开发地址 | 多个来源用逗号分隔 |
| BACKEND_BASE_URL | http://localhost:8787/api/v1 | 前端配置的后端地址 |
| MATERIAL_AGENT_ROOT | `workbench/..` | 材料文献智能体仓库根目录 |
| PYTHON_BIN | `python` / `python3` | Python 解释器 |
| OUTPUT_DIR | `outputs/workbench` | 导出文件和报告输出目录 |

## 接口文档

- OpenAPI：`server/openapi.json`
- 运行时 OpenAPI：`GET /openapi.json`、`GET /api/v1/openapi.json`
- 完整对接文档：`API.md`
- 开源引擎矩阵：`docs/ENGINES.md`

## 请求示例

```http
GET /api/v1/health
X-Api-Key: dev-key-change-me
```

```json
POST /api/v1/tasks
X-Api-Key: dev-key-change-me
Content-Type: application/json

{
  "title": "铁基超导图谱分析",
  "module": "opensource",
  "openCitespace": true
}
```

## 当前实现

- 健康检查、任务 CRUD、对话消息、SSE 事件
- 真实核心/扩展知识库检索与统计、开源引擎矩阵
- 白名单 Python 工作流、真实产物摘要、导出与报告生成
- 文件下载、报告下载、OpenAPI 托管
- 统一错误格式和 `X-Api-Key` 鉴权
