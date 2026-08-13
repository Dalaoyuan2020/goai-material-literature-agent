# Codex 任务 · 三件套初稿（研报 + 系统说明 + 路线Proposal）

> 今天要出一版。方向已经定了：**只做 track A（超导材料）**，`feature/baseline-submission` 分支上那份"SolidEvidence"（硫化物电池界面）已经搁置，不要参考它的科学内容，只复用它的团队介绍段落（见任务三，且有一处需要谨慎处理）。
> 需要同时用到两个仓库：`goai-material-literature-agent`（本仓库，数据/代码来源）和 `Dalaoyuan2020/ai4r-baseline-kit`（Proposal官方模板+填充脚本，没有就先clone）。

## 任务一：系统说明（自研核心 + 明确点名外部组件，不要写"全自研"）

写成 `submissions/track_a/系统说明.md`。诚实拆分，这是已经跟用户确认过的框架，不要改成"全自研"这种笼统说法（官方红线②新知与已知分清，写全自研是真实风险不是措辞问题）：

**自研部分**（全部Python标准库，只有可视化用了matplotlib）：
- L1-L4分层算法：成分向量化（`src/graph.py`）、编码退化检测（`src/rules.py`）、类比迁移生成候选（`src/application.py`）、轮次驱动候选扩张搜索（`src/search.py`，今天早些时候刚做的结构性修复：候选池不再是进循环前一次性生成，而是每轮根据LLM的扩张决策用次优/次次优源变换继续深挖，`pool_growth_by_round`能证明池子真随轮次增长）
- 证据分级体系：核心集（`knowledge/edges.csv`，81条DOI可溯源边）与扩展集（`knowledge/edges_matkg.csv`）物理隔离，`load_core_edges()`/`build_graph(include_extended=...)`强制显式区分
- LLM审计式接入（`src/llm_client.py`）：两个真实决策点（扩张判断 + 候选筛选），每次调用不论成败都落盘`outputs/llm_calls/`，`real_llm_api_called`/`llm_integration_mode`逐条如实标注，失败会诚实降级不伪装成功
- Agent四端口（`agent/soul.json`、`agent/workflow.json`）

**外部组件**（明确点名，不要含糊带过）：
- MatKG扩展数据集（Venugopal & Olivetti 2024，CC0协议，210条弱证据边，只用于扩大向量空间，不作强证据）
- Sciverse API（官方推荐检索源）
- Gemini API（真实LLM调用，`gemini-3.6-flash`模型）
- 前端桌面端（`LL-LK/cl-agent`仓库，React/Electron/Vite，另一位队友谭力奎开发）

## 任务二：调研报告（如果ai4r-baseline-kit里没找到官方指定模板，就用Markdown，按官方基础任务四步走）

写成 `submissions/track_a/调研报告.md`，覆盖官方基础任务的四步闭环，每一步都要有真实产物支撑，不能只写"我们将会…"（官方点名的坑）：

1. **检索筛选**：Sciverse调用记录（`outputs/sciverse_calls/`），43条边的检索扩库过程（36→79→81）
2. **知识抽取**：核心集81条边的结构化字段（材料A/B、关系类型R1-R9、DOI、证据强度、证据摘录），MatKG流式转换器（`src/matkg.py`）的两层过滤逻辑
3. **Gap识别**：6个候选假设（`outputs/pipeline_report.json`的`L4_application.candidates`），见任务四——今天要真的跑一次Materials Project交叉验证，如果验证通过就是真Gap，如果key还没配上就如实写"候选假设，交叉验证为初步可行性验证方案"，不能写成已完成
4. **证据链报告**：每条候选都带`next_step_required`字段，可回溯到具体DOI

## 任务三：路线Proposal（用ai4r-baseline-kit的官方模板+填充脚本）

**项目名称**：不要沿用"SolidEvidence"（那是track B电池项目的名字，如果重复使用容易让评审误以为团队在两个方向反复横跳，说明也说不清）。用一个平实、准确描述track A本身的名字，比如"材料证据链：超导材料构效关系发现Agent"，不用刻意造品牌感的名字。

按`docs/02_prompts.md`里的逐节填写提示词，参考`docs/03_template/official_template_with_team.docx`（含6.x团队介绍节）的章节结构，写好`content.json`后跑：
```
python3 scripts/fill_template.py content.json -o 材料证据链_算法赛初赛方案.docx
```

内容来源：
- **1.x 项目概述/2.x科学问题理解**：科学意义部分要用到用户已经回答过的三点——机械工程博士背景、视觉算法积累；类比迁移思路来自"用图论/数学结构标准化描述材料关系"，参考过开源图论方法（具体是哪个项目用户没确认清楚，**不要在文档里点具体项目名，写成"参考图论相关开源实现"这种准确但不点名的表述**，避免零虚假引用红线风险）
- **3.x技术方案/3.3数据来源**：直接搬任务一系统说明里的自研/外部拆分内容
- **4.x阶段性结果**：真实数字——81条核心边、53篇唯一DOI、94个核心材料、210条MatKG弱边、326组非退化证据、17/17测试通过、39次真实Gemini调用（共160次决策中）、四家族验收PASS。Gap识别结果见任务四的产出
- **5.x复现与开源计划**：仓库当前私有，说明raw/knowledge/src三层结构和CLAUDE.md编译器契约
- **6.x团队介绍**：复用`feature/baseline-submission`分支`材料科学文献调研Agent_算法赛初赛方案.docx`里"六、团队介绍"整节的文字，**但林夏槿这条要谨慎处理**——她的身份写的是"福建霞浦县职业中专学校"学生，大概率未成年。官方隐私自查清单（`docs/08_privacy_checklist.md`）明确要求"未成年人队友的隐私信息一律不写"。这次先只写"林夏槿：负责Skill工程实现（sciverse-search/evidence-ledger）与Docker一键复现打包"，**去掉学校名称这类可识别未成年人身份的具体信息**，等用户明确确认她本人（或监护人）同意公开这些信息之后再补全。吕志远和谭力奎的信息没有这个问题，原样保留。

模板标题一字不动，正文3000-5000字。

## 任务四：Materials Project真实交叉验证（Gap识别的核心证据）

检查 `_digital_assets/api_keys.env`（Mac路径`~/Documents/Claude_Mini_agent/_digital_assets/api_keys.env`，309路径`C:\Users\WinnerSheep\Documents\Claude_Mini_agent\_digital_assets\api_keys.env`）里有没有`MP_API_KEY`。

**如果有**：写`src/mp_crosscheck.py`，对`outputs/pipeline_report.json`里`L4_application.candidates`的6个候选，根据`target_base`和`predicted_composition_delta`算出候选的实际组成式，用Materials Project REST API（`https://api.materialsproject.org`，Bearer认证）按组成查询是否已有匹配记录。查询结果（不论查到没查到）都要如实记录进`outputs/mp_crosscheck.json`：查到的标注"已知材料，非Gap"，没查到的标注"未见报道，符合Gap定义"。这个结果直接决定调研报告和Proposal里Gap识别那一节能不能写成"已完成"。

**如果没有**：不要空等，先按"初步可行性验证方案"把研报和Proposal的对应章节写完（如实说明交叉验证尚未执行，说明将执行的具体方法），其余任务照常推进。等key配上了再补跑这一步、更新对应章节。

## 任务五：自查（跑ai4r-baseline-kit自带的评分skill当对抗性审查）

Proposal生成后，按`.claude/skills/score-proposal/SKILL.md`的流程跑一遍模拟评分（读取docx全文→按`docs/04_rubric.md`打分→检查四条红线），把评分报告存进`submissions/track_a/评分自查.md`。如果红线检查有任何一条不过，必须回头改，不能带着红线问题往下走。

## 任务六：提交前打包检查

跑一遍`docs/08_privacy_checklist.md`的A、B两份清单，**特别注意**：`outputs/matkg_import_report.json`第4行现在写着本机绝对路径`H:\Codex_Agent\knowage\goai-material-literature-agent\...`，这个要改成相对路径或直接去掉这个字段，不能带绝对路径进最终提交材料。检查完把Word文件按官方要求压缩为ZIP。

## 交付清单

- [ ] `submissions/track_a/系统说明.md`
- [ ] `submissions/track_a/调研报告.md`
- [ ] `材料证据链_算法赛初赛方案.docx`（或你起的名字，模板标题不变）
- [ ] `outputs/mp_crosscheck.json`（有key就是真结果，没key就不生成，对应文档章节改成初步可行性验证方案表述）
- [ ] `submissions/track_a/评分自查.md`
- [ ] 隐私清单过一遍，`matkg_import_report.json`的绝对路径已清理
- [ ] `logs/log.md`追加本轮记录
- [ ] 全部commit+push，commit message说明这是三件套初稿，不是最终定稿
