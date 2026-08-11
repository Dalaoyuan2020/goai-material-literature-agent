import csv
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))

from graph import build_graph, load_core_edges, load_edges  # noqa: E402
from matkg import OUTPUT_FIELDS, convert_matkg  # noqa: E402


CORE_FIELDS = (
    "材料A",
    "材料B",
    "关系类型",
    "关系类型定义",
    "文献DOI",
    "年份",
    "证据强度",
    "文献标题",
    "证据说明",
)


class MatKGIntegrationTests(unittest.TestCase):
    def write_core(self, path: Path) -> None:
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=CORE_FIELDS)
            writer.writeheader()
            writer.writerow(
                {
                    "材料A": "MgB2",
                    "材料B": "Mg1-xAlxB2",
                    "关系类型": "R1",
                    "关系类型定义": "test",
                    "文献DOI": "10.1/test",
                    "年份": "2001",
                    "证据强度": "direct",
                    "文献标题": "test",
                    "证据说明": "quoted evidence",
                }
            )

    def test_two_layer_filter_and_no_doi_claim(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            core_path = root / "edges.csv"
            input_path = root / "SUBRELOBJ.csv"
            output_path = root / "edges_matkg.csv"
            self.write_core(core_path)

            input_path.write_text(
                "Subject,Object,Rel,Count\n"
                "MgB2,Annealing,CHM-SMT,40\n"
                "MgB2,Electrical Conductivity,CHM-PRO,50\n"
                "Graphene,Doping,CHM-SMT,50\n"
                "122,Crystal Structure,SPL-DSC,35\n"
                "FeSe,Doping,CHM-PRO\n",
                encoding="utf-8",
            )

            stats = convert_matkg(input_path, core_path, output_path)
            self.assertEqual(stats["raw_rows_processed"], 5)
            self.assertEqual(stats["malformed_rows_skipped"], 1)
            self.assertEqual(stats["selected_rows"], 2)
            self.assertEqual(stats["selected_unique_nodes"], 4)
            self.assertEqual(stats["strong_evidence_eligible_rows"], 0)

            with output_path.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual([row["扩展关系类型"] for row in rows], ["MKG-SYNTHESIS", "MKG-STRUCTURE"])
            self.assertTrue(all(row["文献DOI"] == "" for row in rows))
            self.assertTrue(all(row["强证据资格"] == "false" for row in rows))

    def test_graph_opt_in_keeps_core_and_extension_separate(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            core_path = root / "edges.csv"
            extended_path = root / "edges_matkg.csv"
            self.write_core(core_path)

            with extended_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
                writer.writeheader()
                writer.writerow(
                    {
                        "实体A": "MgB2",
                        "实体B": "Annealing",
                        "扩展关系类型": "MKG-SYNTHESIS",
                        "扩展关系类型定义": "weak",
                        "MatKG关系标签": "CHM-SMT",
                        "共现文献数": "40",
                        "材料匹配依据": "A:core:MgB2",
                        "关系筛选依据": "tag:SMT",
                        "来源数据集": "MatKG",
                        "文献DOI": "",
                        "证据等级": "matkg_aggregate_weak",
                        "强证据资格": "false",
                    }
                )

            core_edges = load_core_edges(core_path)
            all_edges = load_edges(True, core_path, extended_path)
            self.assertEqual(len(core_edges), 1)
            self.assertEqual(len(all_edges), 2)
            self.assertEqual(core_edges[0]["_source"], "core")
            self.assertEqual(all_edges[1]["_source"], "matkg")

            core_nodes, _ = build_graph(False, core_path, extended_path)
            all_nodes, _ = build_graph(True, core_path, extended_path)
            self.assertNotIn("Annealing", core_nodes)
            self.assertEqual(all_nodes["Annealing"]["node_type"], "SMT")
            self.assertFalse(all_nodes["Annealing"]["is_core_material"])


if __name__ == "__main__":
    unittest.main()
