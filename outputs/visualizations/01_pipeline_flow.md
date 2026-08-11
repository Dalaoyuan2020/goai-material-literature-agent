# Knowledge-base construction pipeline

```mermaid
flowchart TD
    A["Sciverse + manual verification<br/>53 DOI-backed papers"]:::core
    B["Core knowledge graph<br/>81 DOI-backed edges · 94 core materials"]:::core
    C["MatKG weak extension<br/>210 aggregate edges · 46 extension nodes<br/>0 row-level DOI"]:::weak
    D["Vectorization<br/>140 nodes · 53 composition dimensions"]:::method
    E["Parallelism detection<br/>326 non-degenerate core evidence pairs"]:::core
    F["Analogy transfer<br/>6 unverified hypotheses"]:::hypothesis
    G["Iterative search<br/>4 material families · 80 retained hypotheses<br/>audited heuristic fallback"]:::hypothesis
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
