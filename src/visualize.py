"""Generate evidence-tiered visualizations from machine-readable outputs.

All plotted values are loaded from ``outputs/pipeline_report.json`` and
``outputs/search_runs/*.json``.  DOI-backed core evidence uses dark solid
marks; MatKG aggregate weak evidence uses light hatched/dashed marks.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Patch
from matplotlib.lines import Line2D


REPO_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_REPORT = REPO_ROOT / "outputs" / "pipeline_report.json"
SEARCH_RUNS_DIR = REPO_ROOT / "outputs" / "search_runs"
OUTPUT_DIR = REPO_ROOT / "outputs" / "visualizations"

CORE_COLOR = "#173F5F"
WEAK_COLOR = "#A9C6DA"
HYPOTHESIS_COLOR = "#D17A22"
BASELINE_COLOR = "#707070"
GRID_COLOR = "#D9DEE3"
TEXT_COLOR = "#20262D"
FAMILY_LABELS = ("122", "1111", "11", "214", "diboride", "other")


def load_inputs(pipeline_path=PIPELINE_REPORT, search_dir=SEARCH_RUNS_DIR):
    with Path(pipeline_path).open(encoding="utf-8") as handle:
        pipeline = json.load(handle)
    search_runs = []
    for path in sorted(Path(search_dir).glob("*.json")):
        with path.open(encoding="utf-8") as handle:
            search_runs.append(json.load(handle))
    if not search_runs:
        raise FileNotFoundError(f"no search run JSON files found in {search_dir}")
    return pipeline, search_runs


def _finish_figure(fig, path, caption):
    fig.text(0.5, 0.012, caption, ha="center", va="bottom", fontsize=9, color=TEXT_COLOR)
    fig.savefig(
        path,
        dpi=180,
        bbox_inches="tight",
        facecolor="white",
        metadata={"Description": caption, "DataSource": "pipeline_report.json and search_runs JSON"},
    )
    plt.close(fig)


def _style_axis(axis):
    axis.spines[["top", "right"]].set_visible(False)
    axis.grid(axis="y", color=GRID_COLOR, linewidth=0.7, alpha=0.8)
    axis.set_axisbelow(True)
    axis.tick_params(colors=TEXT_COLOR)


def write_pipeline_mermaid(pipeline, search_runs, output_dir):
    l1 = pipeline["L1_sources"]
    l2 = pipeline["L2_structure"]
    l3 = pipeline["L3_rules"]
    l4 = pipeline["L4_application"]
    observed = sum(run["retained_candidate_count"] for run in search_runs)
    text = f"""# Knowledge-base construction pipeline

```mermaid
flowchart TD
    A["Sciverse + manual verification<br/>{l1['unique_doi_backed_literature_count']} DOI-backed papers"]:::core
    B["Core knowledge graph<br/>{l2['core_edges_count']} DOI-backed edges · {l2['core_materials_count']} core materials"]:::core
    C["MatKG weak extension<br/>{l2['extended_edges_count']} aggregate edges · {l2['extended_nodes_count']} extension nodes<br/>0 row-level DOI"]:::weak
    D["Vectorization<br/>{l2['materials_count']} nodes · {l2['composition_dims']} composition dimensions"]:::method
    E["Parallelism detection<br/>{l3['non_degenerate_evidence']} non-degenerate core evidence pairs"]:::core
    F["Analogy transfer<br/>{l4['candidates_generated']} unverified hypotheses"]:::hypothesis
    G["BO-style search<br/>{len(search_runs)} material families · {observed} unique observed hypotheses<br/>heuristic approximation, not a real LLM call"]:::hypothesis
    H["Research report"]:::method

    A --> B
    B --> D
    C -. "weak vector-space context only" .-> D
    D --> E --> F --> G --> H

    classDef core fill:#DCE8F0,stroke:#173F5F,stroke-width:2px,color:#102A3C;
    classDef weak fill:#F1F6F9,stroke:#A9C6DA,stroke-width:2px,stroke-dasharray:6 4,color:#38556A;
    classDef method fill:#F3F4F5,stroke:#59636D,stroke-width:1.5px,color:#20262D;
    classDef hypothesis fill:#FFF2E5,stroke:#D17A22,stroke-width:2px,stroke-dasharray:7 4,color:#6E3A08;
```

Caption: Solid dark-blue paths are DOI-backed core evidence. The pale dashed MatKG branch contributes only weak vector-space context; orange dashed nodes are unverified hypotheses. All counts come from `pipeline_report.json` and the four `search_runs` JSON files.
"""
    path = output_dir / "01_pipeline_flow.md"
    path.write_text(text, encoding="utf-8")
    return path


def draw_pipeline_flow(pipeline, search_runs, output_dir):
    l1 = pipeline["L1_sources"]
    l2 = pipeline["L2_structure"]
    l3 = pipeline["L3_rules"]
    l4 = pipeline["L4_application"]
    observed = sum(run["retained_candidate_count"] for run in search_runs)
    fig, axis = plt.subplots(figsize=(10, 12))
    axis.set_xlim(0, 10)
    axis.set_ylim(0, 12)
    axis.axis("off")

    nodes = [
        (5, 11.1, "Literature ingestion", f"{l1['unique_doi_backed_literature_count']} DOI-backed papers", "core"),
        (3.3, 9.45, "Core knowledge graph", f"{l2['core_edges_count']} edges · {l2['core_materials_count']} materials", "core"),
        (7.4, 9.45, "MatKG extension", f"{l2['extended_edges_count']} weak edges · {l2['extended_nodes_count']} nodes", "weak"),
        (5, 7.65, "Vectorization", f"{l2['materials_count']} nodes · {l2['composition_dims']}D composition", "method"),
        (5, 5.95, "Parallelism detection", f"{l3['non_degenerate_evidence']} non-degenerate core pairs", "core"),
        (5, 4.25, "Analogy transfer", f"{l4['candidates_generated']} unverified hypotheses", "hypothesis"),
        (5, 2.55, "BO-style search", f"{len(search_runs)} families · {observed} observed hypotheses", "hypothesis"),
        (5, 0.9, "Research report", "evidence tiers remain explicit", "method"),
    ]
    style = {
        "core": ("#DCE8F0", CORE_COLOR, "solid"),
        "weak": ("#F1F6F9", WEAK_COLOR, "dashed"),
        "method": ("#F3F4F5", BASELINE_COLOR, "solid"),
        "hypothesis": ("#FFF2E5", HYPOTHESIS_COLOR, "dashed"),
    }
    for x, y, title, value, tier in nodes:
        face, edge, line_style = style[tier]
        box = FancyBboxPatch(
            (x - 1.55, y - 0.48),
            3.1,
            0.96,
            boxstyle="round,pad=0.08,rounding_size=0.08",
            facecolor=face,
            edgecolor=edge,
            linewidth=2,
            linestyle=line_style,
        )
        axis.add_patch(box)
        axis.text(x, y + 0.13, title, ha="center", va="center", fontsize=11, weight="bold", color=TEXT_COLOR)
        axis.text(x, y - 0.18, value, ha="center", va="center", fontsize=9.5, color=TEXT_COLOR)

    arrows = [
        ((5, 10.62), (3.3, 9.95), CORE_COLOR, "solid"),
        ((3.3, 8.97), (5, 8.13), CORE_COLOR, "solid"),
        ((7.4, 8.97), (5.35, 8.13), WEAK_COLOR, "dashed"),
        ((5, 7.17), (5, 6.43), CORE_COLOR, "solid"),
        ((5, 5.47), (5, 4.73), CORE_COLOR, "solid"),
        ((5, 3.77), (5, 3.03), HYPOTHESIS_COLOR, "dashed"),
        ((5, 2.07), (5, 1.38), HYPOTHESIS_COLOR, "dashed"),
    ]
    for start, end, color, line_style in arrows:
        axis.add_patch(
            FancyArrowPatch(
                start,
                end,
                arrowstyle="-|>",
                mutation_scale=14,
                color=color,
                linewidth=1.8,
                linestyle=line_style,
            )
        )
    axis.text(7.45, 8.42, "weak context only\n(no row-level DOI)", ha="center", fontsize=9, color="#55758C")
    axis.set_title("From verified literature to search hypotheses", fontsize=16, color=TEXT_COLOR, pad=14)
    caption = "Dark solid marks are DOI-backed core evidence; the pale dashed MatKG branch is weak context only; orange dashed stages contain unverified hypotheses."
    path = output_dir / "01_pipeline_flow.png"
    _finish_figure(fig, path, caption)
    return path


def draw_relation_distribution(pipeline, output_dir):
    core = pipeline["L2_structure"]["core_relation_counts"]
    weak = pipeline["L2_structure"]["matkg_relation_counts"]
    labels = list(core) + list(weak)
    core_values = [core.get(label, 0) for label in labels]
    weak_values = [weak.get(label, 0) for label in labels]
    x = np.arange(len(labels))
    width = 0.38
    fig, axis = plt.subplots(figsize=(14, 7))
    bars_core = axis.bar(x - width / 2, core_values, width, color=CORE_COLOR, label="Core DOI-backed edges")
    bars_weak = axis.bar(
        x + width / 2,
        weak_values,
        width,
        color=WEAK_COLOR,
        edgecolor="#5F839B",
        hatch="//",
        label="MatKG aggregate weak edges",
    )
    axis.bar_label(bars_core, labels=[str(v) if v else "" for v in core_values], padding=3, fontsize=8)
    axis.bar_label(bars_weak, labels=[str(v) if v else "" for v in weak_values], padding=3, fontsize=8)
    axis.set_xticks(x, labels, rotation=35, ha="right")
    axis.set_ylabel("Edge count")
    axis.set_title("Relation-type distribution by evidence tier")
    axis.legend(frameon=False)
    _style_axis(axis)
    fig.subplots_adjust(bottom=0.28)
    caption = "Counts are read from pipeline_report.json. Dark bars are 36 DOI-backed core edges; light hatched bars are 210 MatKG aggregate edges with no row-level DOI."
    path = output_dir / "02a_relation_distribution.png"
    _finish_figure(fig, path, caption)
    return path


def draw_family_coverage(pipeline, output_dir):
    coverage = pipeline["L2_structure"]["family_coverage"]
    x = np.arange(len(FAMILY_LABELS))
    width = 0.38
    fig, axes = plt.subplots(1, 2, figsize=(15, 6.8), sharex=True)
    panels = [
        ("Node coverage", "core_nodes", "matkg_extended_nodes", "Node count"),
        ("Edge coverage by source endpoint", "core_edges", "matkg_extended_edges", "Edge count"),
    ]
    for axis, (title, core_key, weak_key, ylabel) in zip(axes, panels):
        core_values = [coverage[core_key][label] for label in FAMILY_LABELS]
        weak_values = [coverage[weak_key][label] for label in FAMILY_LABELS]
        core_bars = axis.bar(x - width / 2, core_values, width, color=CORE_COLOR, label="Core DOI-backed")
        weak_bars = axis.bar(
            x + width / 2,
            weak_values,
            width,
            color=WEAK_COLOR,
            edgecolor="#5F839B",
            hatch="//",
            label="MatKG weak extension",
        )
        axis.bar_label(core_bars, labels=[str(v) if v else "" for v in core_values], padding=3, fontsize=8)
        axis.bar_label(weak_bars, labels=[str(v) if v else "" for v in weak_values], padding=3, fontsize=8)
        axis.set_title(title)
        axis.set_ylabel(ylabel)
        axis.set_xticks(x, FAMILY_LABELS, rotation=25, ha="right")
        _style_axis(axis)
    axes[0].legend(frameon=False, loc="upper left")
    fig.suptitle("Material-family coverage by evidence tier", fontsize=15, color=TEXT_COLOR)
    fig.subplots_adjust(bottom=0.20, top=0.86, wspace=0.20)
    caption = "Core and MatKG counts remain separate. Heterogeneous MatKG entity nodes are grouped under 'other'; edges are assigned by source endpoint to avoid double counting."
    path = output_dir / "02b_family_coverage.png"
    _finish_figure(fig, path, caption)
    return path


def draw_parallelism_distribution(pipeline, output_dir):
    evidence = pipeline["L3_rules"]["non_degenerate_evidence_records"]
    core_values = np.array([item["cosine"] for item in evidence], dtype=float)
    baseline = pipeline["L3_rules"]["random_baseline"]
    baseline_values = np.array(baseline["cosines"], dtype=float)
    bins = np.linspace(-1.0, 1.0, 11)
    fig, axis = plt.subplots(figsize=(11, 7))
    axis.hist(
        core_values,
        bins=bins,
        color=CORE_COLOR,
        alpha=0.82,
        label=f"Core same-relation evidence (n={len(core_values)})",
    )
    axis.hist(
        baseline_values,
        bins=bins,
        histtype="step",
        color=BASELINE_COLOR,
        linewidth=2,
        linestyle="--",
        label=f"Random core-pair baseline (n={len(baseline_values)})",
    )
    core_mean = float(core_values.mean())
    axis.axvline(core_mean, color=CORE_COLOR, linewidth=2, label=f"Evidence mean {core_mean:+.3f}")
    axis.axvline(
        baseline["mean"],
        color=BASELINE_COLOR,
        linewidth=1.8,
        linestyle="--",
        label=f"Baseline mean {baseline['mean']:+.3f}",
    )
    axis.set_xlim(-1.02, 1.02)
    axis.set_xlabel("Signed cosine similarity")
    axis.set_ylabel("Pair count")
    axis.set_title("Non-degenerate relation-vector alignment vs random core baseline")
    axis.legend(frameon=False, fontsize=9)
    _style_axis(axis)
    caption = f"Both distributions are recomputed from DOI-backed core edges (seed {baseline['seed']}); MatKG weak edges are excluded because they lack row-level DOI and strong-evidence eligibility."
    path = output_dir / "03a_parallelism_distribution.png"
    _finish_figure(fig, path, caption)
    return path


def _choose_analogy_candidate(pipeline):
    candidates = pipeline["L4_application"]["candidates"]
    for candidate in candidates:
        if candidate["source_transform"].startswith("BaFe2As2 "):
            return candidate
    if not candidates:
        raise ValueError("pipeline report contains no L4 analogy candidate")
    return candidates[0]


def draw_analogy_case(pipeline, output_dir):
    candidate = _choose_analogy_candidate(pipeline)
    source_a, source_b = [part.strip() for part in candidate["source_transform"].split("→", 1)]
    target = candidate["target_base"]
    delta = candidate["predicted_composition_delta"]
    delta_text = ", ".join(f"{key} {value:+.4f}" for key, value in sorted(delta.items()))
    fig, axis = plt.subplots(figsize=(12, 7))
    axis.set_xlim(0, 12)
    axis.set_ylim(0, 7)
    axis.axis("off")

    positions = {
        "A": (2.0, 5.0),
        "B": (9.4, 5.0),
        "D": (2.0, 1.8),
        "Dprime": (9.4, 1.8),
    }
    labels = {
        "A": f"A · {source_a}\nDOI-backed core material",
        "B": f"B · {source_b}\nknown transformed material",
        "D": f"D · {target}\ncore target material",
        "Dprime": "D′ · vector prediction\nUnverified candidate hypothesis",
    }
    for key, (x, y) in positions.items():
        hypothesis = key == "Dprime"
        box = FancyBboxPatch(
            (x - 1.45, y - 0.55),
            2.9,
            1.1,
            boxstyle="round,pad=0.08,rounding_size=0.08",
            facecolor="#FFF2E5" if hypothesis else "#DCE8F0",
            edgecolor=HYPOTHESIS_COLOR if hypothesis else CORE_COLOR,
            linestyle="dashed" if hypothesis else "solid",
            linewidth=2.2,
        )
        axis.add_patch(box)
        axis.text(x, y, labels[key], ha="center", va="center", fontsize=10, color=TEXT_COLOR)

    axis.add_patch(
        FancyArrowPatch(
            (3.5, 5.0),
            (7.9, 5.0),
            arrowstyle="-|>",
            mutation_scale=18,
            linewidth=2.6,
            color=CORE_COLOR,
        )
    )
    axis.text(5.7, 5.35, f"Known core transformation\nsource cosine {candidate['source_cosine']:+.4f}", ha="center", color=CORE_COLOR)
    axis.add_patch(
        FancyArrowPatch(
            (3.5, 1.8),
            (7.9, 1.8),
            arrowstyle="-|>",
            mutation_scale=18,
            linewidth=2.6,
            linestyle="dashed",
            color=HYPOTHESIS_COLOR,
        )
    )
    axis.text(5.7, 2.15, f"Transfer the same composition delta\n{delta_text}", ha="center", color="#8A4B0F")
    axis.add_patch(
        FancyArrowPatch(
            (5.7, 4.45),
            (5.7, 2.35),
            arrowstyle="-|>",
            mutation_scale=14,
            linewidth=1.5,
            linestyle=":",
            color=BASELINE_COLOR,
        )
    )
    axis.text(6.0, 3.4, "analogy transfer", rotation=90, va="center", fontsize=9, color=BASELINE_COLOR)
    axis.set_title("How a known transformation becomes an unverified candidate", fontsize=15, color=TEXT_COLOR, pad=12)
    legend = [
        Line2D([0], [0], color=CORE_COLOR, lw=2.5, label="DOI-backed core transformation"),
        Line2D([0], [0], color=HYPOTHESIS_COLOR, lw=2.5, ls="--", label="Unverified predicted transformation"),
        Patch(facecolor="#F1F6F9", edgecolor=WEAK_COLOR, hatch="//", label="MatKG weak evidence (excluded here)"),
    ]
    axis.legend(handles=legend, loc="lower center", bbox_to_anchor=(0.5, -0.02), ncol=3, frameon=False, fontsize=9)
    caption = "The solid A→B transformation and target D are core materials; D′ is only a vector-level hypothesis. MatKG weak edges are not used as source evidence."
    path = output_dir / "03b_analogy_case_demo.png"
    _finish_figure(fig, path, caption)
    return path


def generate_all(output_dir=OUTPUT_DIR, pipeline_path=PIPELINE_REPORT, search_dir=SEARCH_RUNS_DIR):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    pipeline, search_runs = load_inputs(pipeline_path, search_dir)
    return [
        write_pipeline_mermaid(pipeline, search_runs, output_dir),
        draw_pipeline_flow(pipeline, search_runs, output_dir),
        draw_relation_distribution(pipeline, output_dir),
        draw_family_coverage(pipeline, output_dir),
        draw_parallelism_distribution(pipeline, output_dir),
        draw_analogy_case(pipeline, output_dir),
    ]


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    for generated_path in generate_all():
        print(generated_path)
