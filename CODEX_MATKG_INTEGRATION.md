# Codex 任务 · 缝合 MatKG，别从头抽

> 给本地 Codex：读完直接开工，不用等确认。这是对 `CODEX_WORKFLOW.md` 的优先级调整——
> **先把别人已经做好的现成知识图谱接进来，不要从零一篇一篇文献抽。**

## 为什么改方向

`knowledge/edges.csv` 现在 36 条边，是人工从 20 篇文献里核验出来的，慢但可信。
从零靠 Sciverse 一篇篇检索抽取，速度太慢。**MatKG 是别人已经从 500 万+篇材料科学论文里自动抽好的关系数据，现成、免费、CC0协议（公开域随便用）**，没有理由不用。

## MatKG 是什么（已核实，不用再查）

- 代码：`github.com/olivettigroup/MatKG`（MIT团队，Elsa Olivetti组，37星）
- 数据：`zenodo.org/records/10022727`，CC0协议
- 规模：15万+实体，350万+关系三元组
- 核心文件：`SUBRELOBJ.csv`，**184MB，不用注册不用API key，点了就能下**
  - 下载直链：`https://zenodo.org/records/10022727/files/SUBRELOBJ.csv?download=1`
  - 还有 `entity_uri_mapping.pickle`（9.9MB，实体ID对照表）

## 任务：把 MatKG 缝进现有知识库

### 第一步：下载 + 摸清格式

```bash
curl -L -o /tmp/SUBRELOBJ.csv "https://zenodo.org/records/10022727/files/SUBRELOBJ.csv?download=1"
curl -L -o /tmp/entity_uri_mapping.pickle "https://zenodo.org/records/10022727/files/entity_uri_mapping.pickle?download=1"
head -20 /tmp/SUBRELOBJ.csv
```

摸清楚这个 csv 的列结构（大概率是 subject/relation/object 三元组形式，具体列名以实际下载的文件为准，不要靠猜）。

### 第二步：筛出跟超导材料相关的子集

MatKG 覆盖全材料科学，我们只要超导相关的。筛选思路：
- 用 `knowledge/edges.csv` 里已有的 35 个材料化学式（BaFe2As2、SrFe2As2、FeSe 这类）做实体匹配，找出 MatKG 里提到这些材料、或者提到"superconductor"/"superconductivity"/"Tc"这类关键词的三元组
- 也可以反过来：先筛"关系类型"里带 doping/substitution/synthesis 这类跟我们 R1-R9 体系相关的，再看涉及的材料是不是超导相关

### 第三步：格式转换，对齐现有 schema

MatKG 的三元组格式和 `knowledge/edges.csv` 的列（材料A/材料B/关系类型/文献DOI/年份/证据强度/文献标题/证据说明）大概率对不上，需要写一个转换脚本：

- MatKG 有没有 DOI 字段？如果有，直接搬；如果没有，这条边的"文献DOI"和"证据说明"两列就填不了，**这类数据要单独存，不能硬塞进现有 edges.csv**（现有 schema 要求每条边必须可回溯到文献，这是官方红线①的硬要求，不能破坏）
- 建议：MatKG 转换出来的数据先存成 `knowledge/edges_matkg.csv`（跟人工核验的 `edges.csv` 分开），在 `CLAUDE.md` 里补一条说明这两个文件的区别（一个是高置信度、可逐条溯源的核心集，一个是大规模但溯源粒度较粗的扩展集）
- `src/graph.py` 的 `build_graph()` 目前只读 `edges.csv`，需要加一个参数或者新函数，能选择只读核心集、还是核心集+扩展集一起读

### 第四步：跑通、验证规模变化

```bash
cd src && python3 pipeline.py
```
对比接入前后：点的数量、边的数量、非退化平行性证据的数量有没有明显提升。这是判断"缝合有没有用"的直接证据。

### 第五步：记账 + 推送

`logs/log.md` 追加一条：MatKG 接入了多少条超导相关三元组，格式转换遇到了什么问题，规模变化的具体数字。

```bash
git add -A
git commit -m "feat: integrate MatKG superconductor subset as extended edge set"
git push
```

## 铁律（不因为是"别人做好的"就放松）

1. **区分置信度**：MatKG 是统计方法自动抽取的，不是逐条人工核验过的，不能跟现有 36 条边混为一谈当同等证据用。在方案文档里必须说清楚"核心集人工核验、扩展集来自 MatKG 自动抽取"这个区别
2. **能不能溯源到具体文献，是两个数据集最大的差异**，这个差异要在 schema 里体现出来，不要为了图省事把两者硬拼一张表
3. 如果发现 MatKG 数据质量差（比如实体名字混乱、关系类型语义不清），如实记进 `logs/log.md`，不要硬凑

## 别做的事

- 不要下载 `ENTPTNERDOI.nt.tar.gz`（1.9GB）这类大文件，`SUBRELOBJ.csv` 够用了
- 不要试图把全部 350 万条三元组都处理一遍，只筛超导材料相关的子集
- 不要为了合并方便就删掉"能不能溯源"这个区分
