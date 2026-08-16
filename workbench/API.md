# 材料文献智能工作台 API

本地服务默认地址：`http://127.0.0.1:8787/api/v1`。除健康检查外，请求携带：

```http
X-Api-Key: dev-key-change-me
```

## 真实数据来源

- `knowledge/edges.csv`：核心 DOI 证据边
- `knowledge/edges_matkg.csv`：MatKG 聚合弱证据边
- `outputs/pipeline_report.json`：L2/L3/L4 统计和未验证候选
- `outputs/search_runs/*.json`：四家族搜索报告

Node 服务不实现第二套科学算法，只通过 `src/ui_bridge.py` 调用
`agent/workflow.json` 白名单中的 Python 动作。

## 主要接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 服务状态、项目根目录和知识边总数 |
| POST | `/knowledge/search` | 查询最多 1000 条真实核心/扩展边 |
| GET | `/knowledge/stats` | 返回当前真实材料、边和候选统计 |
| POST | `/tasks` | 创建 UI 任务 |
| GET | `/tasks/:id/events` | 订阅消息与真实工作流进度 SSE |
| POST | `/workflow/run` | 启动白名单 Python 工作流 |
| GET | `/jobs/:id` | 查询工作流状态和真实产物摘要 |

工作流请求示例：

```json
{
  "taskId": "task_xxx",
  "skillId": "search-1111",
  "input": {}
}
```

支持的 UI 技能映射见 `src/ui_bridge.py`；未注册动作会失败，不会降级为模拟成功。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `8787` | HTTP 端口 |
| `API_KEY` | `dev-key-change-me` | 本地 API 密钥 |
| `MATERIAL_AGENT_ROOT` | `workbench/..` | 当前材料文献智能体仓库根目录 |
| `PYTHON_BIN` | `python` / `python3` | Python 解释器 |
| `OUTPUT_DIR` | `outputs/workbench` | 导出与报告目录 |

完整结构仍可通过 `/openapi.json` 查看。
