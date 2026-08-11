# Codex 恢复任务 · 环境已解锁，继续跑完整 MatKG 导入

> 给本地 Codex：读完直接开工，不用等确认。
> 这是你上一轮任务（`CODEX_MATKG_INTEGRATION.md` / `CODEX_TRIGGER.md`）的续跑。
> 上一轮你正确诊断出两个卡点并诚实停手，没有硬凑数据——两个卡点现在都已解决，直接继续。

## 上一轮的结论（不用重新诊断，直接采信）

- 下载 3 次都在 curl error 18 处中断，最高到 23.4%，你正确地停止重试，没有用不完整数据造假结果
- `SCIVERSE_KEY` 在环境变量和约定密钥文件里都没找到，你正确地没有硬跑
- 你已经摸清 MatKG 真实格式：`Subject,Object,Rel,Count`，`Rel` 是 NER 实体类型对（如 `CHM-SMT`），不含逐行 DOI，`Count` 只是聚合前共同出现的文献数——这个发现是对的，不用重新验证

## 现在已解锁的两件事

1. **完整 `SUBRELOBJ.csv` 已就位**：`H:\Codex_Agent\knowage\goai-material-literature-agent\.tmp\matkg\SUBRELOBJ.csv`，184,088,025 字节，已核实与 Zenodo 官方发布大小完全一致（不是残缺文件）。
2. **`SCIVERSE_KEY` 已配好**：写在 `C:\Users\WinnerSheep\Documents\Claude_Mini_agent\_digital_assets\api_keys.env`（无 BOM 写入，已在本机验证 `sciverse._load_key()` 能正确读到 47 字符的 key）。

## 任务：跑完整导入

```bash
cd "H:\Codex_Agent\knowage\goai-material-literature-agent\src"
python matkg.py --input "..\.tmp\matkg\SUBRELOBJ.csv"
```

按你上一轮已经设计好的规则处理（不用改逻辑，直接跑）：
- 两层过滤：材料层（35个核心化学式 + Fe-based/cuprate/pnictide/122/1111/MgB2 关键词）+ 关系层（doping/substitution/synthesis/structure 相关）
- 结果写入 `knowledge/edges_matkg.csv`，**保持你已经设计好的空 DOI + 弱证据标记（强证据资格=false）**，不要因为这次是完整文件就放松这条约束——MatKG 本身就没有逐行 DOI，这是数据源的客观限制，不是文件不完整导致的，不会因为文件完整了就自动出现 DOI

## 跑完之后

1. `cd ../src && python pipeline.py`，对比这几个数字接入前后的变化：
   - `L2_structure.extended_edges_count`（应该从 0 变成一个明显更大的数）
   - `L2_structure.materials_count` vs `core_materials_count`（扩展节点应该明显增多）
   - 确认 `L3_rules.evidence_source` 仍然是 `"core_only"`（这条不能变，扩展集不能污染强证据）

2. `logs/log.md` 追加一条：完整文件筛出了多少条相关三元组、按 R1-R9 关系族分布怎样（对照 `MKG-DOPING`/`MKG-SUBSTITUTION`/`MKG-SYNTHESIS`/`MKG-STRUCTURE` 四类各多少条）、跟上一轮 23.4% 前缀诊断的比例数字对不对得上（用来交叉验证这次导入逻辑没跑错）

3. 跑现有的单元测试确认没有退化：
   ```bash
   python -m pytest tests/test_matkg_integration.py -v
   ```

4. 全部确认无误后推送：
   ```bash
   git add -A
   git commit -m "feat: import full MatKG superconductor subset (N edges, weak evidence)"
   git push
   ```
   提交信息里的 N 换成实际数字，不要用占位符。

## 铁律（跟上一轮一致，重申一遍）

- 扩展集边不允许伪装成强证据，`edges.csv`（核心集）和 `edges_matkg.csv`（扩展集）永远是两个文件，不合并
- 如果这次导入结果跟上一轮 23.4% 前缀诊断的比例差异很大（比如筛出的条数占比明显不成比例），先如实记录这个异常，不要不声不响地用大数字掩盖，可能说明筛选逻辑对不同数据段表现不一致，值得留意
- 不要因为环境已经解锁就放松验证标准，跑完照样要看真实输出再报告"完成"，不要假设"文件在了就一定成功"
