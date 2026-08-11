# 入库日志（append-only，只追加不修改）

## 2026-08-10 · 初次编译

- 原料：那晚从超导材料文献人工核验出的 36 条边（迁移进 `knowledge/edges.csv`）
- 编译产物：35 个材料点，45 组非退化平行性证据，4 个类比迁移候选假设
- 已知假信号：6 组"编码退化"（成分增量完全相同，平行性由构造保证非实测），已在 `src/rules.py` 里做自动检测排除
- Sciverse API 接通，`outputs/sciverse_calls/` 已有首条调用审计记录

## 2026-08-11 · 第二轮入库（Sciverse 检索扩库）

- 原料：Sciverse API 10 个关键词检索（iron pnictide doping / cuprate substitution / FeSe Te doping / MgB2 doping / nickel oxide pressure / kagome doping / chemical pressure / transition metal doping / hydride high pressure / cuprate rare earth substitution），共 150 条记录，筛出 58 条候选文献，审计记录 10 条存 `outputs/sciverse_calls/`
- 新增边：43 条（R1×11, R2×8, R3×1, R5×2, R7×12, R9×9），全部带真实 DOI（31 个唯一 DOI，经 CrossRef 验证存在）+ 摘要原文证据摘录（程序化逐字核验）
- 证据强度：direct 42，negative 1（FeTe 加压不超导，负样本）
- 查重：与现有 36 条边三元组无重复；候选内跳过 11 条重复边、20 条无明确证据边
- 新关系类型发现：**氧位H-掺杂 O→H（1111系）**（LaFeAsO→LaFeAsO1-xHx，10.1038/ncomms1913，2012，第二超导穹顶 Tc 36K@x=0.3）——现有 R4 仅定义 O→F，O→H 不属于任何现有类型，按铁律不强行归类，仅记录候选，供后续 schema 扩展决策（R4 是否需要泛化为"氧位阴离子掺杂"）
- 规模变化：材料点 35→91，边 36→79
