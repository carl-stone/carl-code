# Honcho Reasoning Architecture Study

## Overview

Honcho is a "memory agent" that ingests user/agent messages, reasons over them, and exposes a query API. Its core innovation is treating memory as **reasoning** rather than mere storage — it extracts structured conclusions from conversations and stores them as "peer representations."

The system has three interconnected components:

1. **Neuromancer XR** — extracts explicit facts and deductive conclusions
2. **Neuromancer MR** — derives inductive and abductive (probabilistic) conclusions
3. **Dreamer** — orchestrates the reasoning pipeline, prunes inconsistencies, and builds consolidated peer representations

---

## 1. Neuromancer XR (Explicit + Deductive)

### Role
Extracts **explicit facts** and **deductive conclusions** from conversation turns. Acts as the first-stage reasoning layer.

### Input Format

Each input is a **message batch** (typically 1-5 messages per batch) from a peer (user, agent, NPC, etc.):

```json
{
  "messages": [
    {"role": "user", "content": "Laverne skipped lunch today because she was busy at work."},
    {"role": "assistant", "content": "Great to hear!"}
  ],
  "peer_id": "user-123"
}
```

### Output Format

Structured JSON with two top-level arrays:

```json
{
  "explicit_conclusions": [
    {
      "type": "fact",
      "statement": "Laverne skipped lunch today",
      "confidence": 1.0
    },
    {
      "type": "deduction",
      "statement": "Laverne is busy at work",
      "confidence": 0.95
    }
  ]
}
```

### Training Data

- **Dataset**: ~10,000 conversation-turn-to-conclusion triples (manually curated)
- **Labels**: Explicit facts (directly stated) + deductive conclusions (logically entailed)
- **Sources**:
  - **LongMem** (LongMemory benchmark) — needle-in-a-haystack questions with ~115K tokens per question
  - **LoCoMo** (LongMemory Multi-Objective) — 16K-token conversations with 100+ questions per scenario
  - **BEAM** (Beyond A Million Tokens) — multi-million token dialogues
- **Labeling criteria**:
  - **Explicit**: Statement appears verbatim or paraphrased in the conversation
  - **Deductive**: Conclusion is a logical consequence of explicit statements (e.g., "skipped lunch" → "busy at work")

### Data Preparation Script (Python)

```python
# data_prepare.py
import json
from pathlib import Path
from typing import List

def extract_conclusions(batch: dict) -> dict:
    """Extract explicit and deductive conclusions from a message batch."""
    messages = batch.get("messages", [])
    explicit = []
    deductions = []

    # Simple heuristic: look for "because", "since", "therefore" patterns
    for msg in messages:
        content = msg.get("content", "")
        # Explicit fact detection (simplified)
        if "because" in content.lower() or "since" in content.lower():
            # Assume this is a deduction
            deductions.append({
                "type": "deduction",
                "statement": content.strip(),
                "confidence": 0.85
            })
        elif msg.get("role") == "user":
            # Assume this is an explicit fact
            explicit.append({
                "type": "fact",
                "statement": msg["content"].strip(),
                "confidence": 1.0
            })

    return {"explicit_conclusions": explicit, "deductive_conclusions": deductions}

def prepare_dataset(file_path: str) -> List[dict]:
    """Load and prepare a dataset of conversation batches."""
    with open(file_path, "r") as f:
        data = json.load(f)

    prepared = []
    for entry in data:
        prepared.append(extract_conclusions(entry))
    return prepared

# Example usage:
# prepared = prepare_dataset("conversations.json")
# print(len(prepared))
```

### Training Data Sources (Quick Links)

| Source | Size | Coverage | Best for |
|--------|------|----------|-----------|
| **LongMem S** | ~115K tokens per question | Needle-in-a-haystack recall | Explicit facts |
| **LoCoMo** | ~16K tokens per scenario | Multi-hop questions | Multi-hop reasoning |
| **BEAM** | Up to 10M tokens | Long-context reasoning | Deep temporal reasoning |
| **LongMem M** | ~1M tokens | Extended conversations | Pattern induction |

---

## 2. Neuromancer MR (Inductive + Abductive)

### Role
Derives **inductive patterns** (generalizable rules) and **abductive explanations** (best-explaining hypotheses) from the conclusions extracted by XR.

### Input Format
Same message batch as XR, but the model is trained to output:

```json
{
  "inductive_conclusions": [
    {
      "type": "pattern",
      "statement": "Laverne tends to skip meals when busy",
      "supporting_evidence": ["skipped lunch", "was busy at work"]
    },
    {
      "type": "abduction",
      "statement": "Laverne is likely work-obsessed",
      "rationale": "Skipping meals correlates with work-related events"
    }
  ]
}
```

### Training Data

- **Source**: Same as XR (LongMem, LoCoMo, BEAM)
- **Labels**: Inductive patterns (generalizable rules) + abductive hypotheses (best-explaining explanations)
- **Challenges**:
  - Inductive conclusions require **generalization** (e.g., "Laverne skips meals when busy" → "Busy people tend to skip meals")
  - Abductive conclusions require **plausibility ranking** (multiple possible explanations, pick the best)

### Data Preparation Script (Python)

```python
# train_mr.py - basic classifier setup for reasoning type prediction
classifier_data = [
    # (input_batch, predicted_label)
    ("Laverne skipped lunch because she was busy", "deduction"),
    ("Laverne tends to skip meals when busy", "induction"),
    ("Laverne is likely work-obsessed", "abduction"),
    ("Laverne likes desserts", "fact"),
    ("Laverne is probably busy", "abduction"),
    ("Laverne is probably interested in cooking", "induction"),
]

# Save as JSONL for training
from sklearn.model_selection import train_test_split

labels = [item[1] for item in classifier_data]
train_labels, val_labels = train_test_split(labels, test_size=0.2, random_state=42)
print(f"Train: {len(train_labels)}, Val: {len(val_labels)}")
```

---

## 3. Dreamer (Orchestrator)

### Role
Background process that:
- Runs asynchronously after each message batch
- Prunes inconsistent or redundant conclusions
- Consolidates conclusions into **peer representations** (structured summaries per peer)
- Ensures quality control (detects contradictions, merges duplicates)

### Input Format
```json
{
  "batch": [...messages...],
  "peer_id": "user-123",
  "current_state": {
    "explicit_conclusions": [...],
    "deductive_conclusions": [...],
    "inductive_conclusions": [...],
    "abductive_conclusions": [...]
  }
}
```

### Implementation Notes

- **Timing**: Runs asynchronously; can batch multiple message batches
- **Quality checks**:
  - Detect contradictory conclusions (e.g., "Laverne likes desserts" + "Laverne avoids sweets")
  - Merge similar conclusions (e.g., "skipped lunch" + "didn't eat lunch" → "Laverne skipped lunch")
  - Flag low-confidence inductions/abductions for human review

---

## 4. End-to-End Pipeline

```
Message Batch → [PostgreSQL Storage] → [Neuromancer XR] → [Neuromancer MR] → [Dreamer] → [Peer Representation] → [Dialectic API]
```

### Data Flow

1. **Ingestion**: Messages are stored in PostgreSQL (peer → messages → conclusions)
2. **Derivation**: XR extracts explicit/deductive conclusions; MR derives inductive/abductive ones
3. **Consolidation**: Dreamer prunes, merges, and stores refined conclusions as peer representations
4. **Query**: Honcho's Dialectic API retrieves peer representations for natural-language queries

---

## 5. Training Small LLMs for Reasoning Classification

### Goal
Train small models (e.g., LLaMA-3-8B, Phi-2, Mistral-7B) to **classify reasoning type** (explicit fact, deduction, induction, abduction) from conversation batches.

### Recommended Approach

#### Option A: Fine-tune a single model on XR's labeled data

**Dataset**: Curate ~10K conversation batches with annotated conclusions (XR format). Split into train/val/test.

**Labeling scheme**:
- **Class 0**: Explicit fact (verbatim or paraphrased statement)
- **Class 1**: Deduction (logical consequence of explicit statements)
- **Class 2**: Induction (generalizable pattern)
- **Class 3**: Abduction (best-explaining hypothesis)

**Training objective**: Cross-entropy classification on the label.

**Why this works**: XR already produces clean, structured outputs — ideal for supervised fine-tuning.

#### Option B: Multi-task fine-tuning (better for generalization)

Train on the same data with multiple heads:
- **Head 1**: Predict reasoning type (classification)
- **Head 2**: Generate the conclusion (conditional generation)
- **Head 3**: Rank confidence (regression)

This mimics Honcho's three-stage pipeline and teaches the model to distinguish XR vs. MR outputs.

### Data Sources (Ready-to-Use)

| Source | Size | Coverage | Best for |
|--------|------|-----------|----------|
| **LongMem S** | ~115K tokens per question | Needle-in-a-haystack recall | Explicit facts |
| **LoCoMo** | ~16K tokens per scenario | Multi-hop questions | Multi-hop reasoning |
| **BEAM** | Up to 10M tokens | Long-context reasoning | Deep temporal reasoning |
| **LongMem M** | ~1M tokens | Extended conversations | Pattern induction |
| **Custom curated set** | Your own data | Domain-specific | Fine-tuning on your domain |

**How to use them**:
1. Filter for **conversation batches** (not single turns)
2. Extract **explicit statements** and **implied conclusions** manually or with a rule-based parser
3. Label each conclusion with its reasoning type
4. Train the classifier on the labeled batches

### Lightweight Laptop Implementation

For a laptop (CPU/GPU ≤ 24GB RAM):

| Component | Recommendation |
|-----------|-----------------|
| **Model** | LLaMA-3-8B-Instruct, Phi-2, or Mistral-7B (quantized to 4-bit) |
| **Framework** | HuggingFace `transformers` + `trl` (for RLHF-style fine-tuning) |
| **Training** | LoRA/QLoRA (4-bit quantization) — ~1-2 hours on a single GPU |
| **Inference** | Same model, same pipeline — no extra compute |
| **Memory** | Store peer representations in SQLite or TSV (lightweight) |
| **Dreamer** | Run as a background process that periodically re-consolidates peer cards (can be a simple Python script calling the model) |

### Step-by-Step Plan

1. **Collect data** — Pull LongMem/LoCoMo/BEAM conversations, extract explicit statements + implied conclusions
2. **Annotate** — Label each conclusion as Explicit/Deduction/Induction/Abduction
3. **Fine-tune** — Train a small classifier on the labeled batches
4. **Deploy** — Integrate the classifier into Honcho's pipeline (replace XR with a classifier that predicts reasoning type)
5. **Evaluate** — Measure accuracy on held-out batches; iterate on labeling quality

### Expected Performance

| Model | Explicit Fact Accuracy | Deduction Accuracy | Induction Accuracy | Abduction Accuracy |
|-------|------------------------|---------------------|---------------------|--------------------|
| LLaMA-3-8B (LoRA) | ~85% | ~75% | ~60% | ~50% |
| Phi-2 (4-bit) | ~80% | ~70% | ~55% | ~45% |
| Mistral-7B (quantized) | ~78% | ~72% | ~58% | ~48% |

These are rough estimates — actual numbers depend on data quality and labeling effort.

---

## 6. Key Takeaways

1. **XR** = fast, high-confidence extraction of explicit facts + deductions (the "what")
2. **MR** = slower, probabilistic induction + abduction (the "why" and "so what")
3. **Dreamer** = orchestrator that cleans and consolidates (the "glue")
4. **Small model training** is feasible — fine-tune a 7B-8B model on XR's labeled data for classification
5. **Data sources** are ready: LongMem, LoCoMo, BEAM — all publicly available and aligned with Honcho's benchmarks
6. **Lightweight deployment** is achievable on a laptop with LoRA + SQLite peer storage

---

## References

- **Honcho Blog** — "Memory as Reasoning" (original architecture)
- **LongMem** — LongMemory benchmark (https://arxiv.org/abs/2410.10813)
- **LoCoMo** — LongMemory Multi-Objective (https://arxiv.org/abs/2402.17753)
- **BEAM** — Beyond A Million Tokens (https://arxiv.org/abs/2510.27246)
- **Neuromancer XR** — "Neuromancer XR: Memory as Reasoning" (Plastic Labs blog)
- **Neuromancer MR** — Planned in the same blog post (future work)

---

## Quick Start Checklist

- [ ] Collect ~10K conversation batches from LongMem/LoCoMo
- [ ] Annotate each batch with explicit/deduction/induction/abduction labels
- [ ] Prepare train/val/test splits
- [ ] Fine-tune LLaMA-3-8B (LoRA) on the labeled data
- [ ] Evaluate on held-out batches
- [ ] Integrate classifier into Honcho pipeline (replace XR with classifier)
- [ ] Deploy on laptop (CPU/GPU ≤ 24GB RAM)

---

*Last updated: 2026-08-13*  
*Author: Carl Stone (carl-code)*
