# Structure Audit Fixture: The Tide Archive

> **Fixture notice:** This report is handwritten to exercise the v2 contract and provide a realistic audit target. No model, conversational engine, or Scriptorium run produced it. The manuscript defects are intentional. No prose or scene changes have been applied.

## Scope and Reading Notes

The complete fixture manuscript has three chapters, so beat positions below use chapter-level estimates. The strongest assets are the immediate disturbance, the concrete 06:00 deadline, the recurring ferry horn, and Mei's credible opposition to Ning's Lie. The main structural risk is that events solve Ning's problem before her choices do.

| Landmark or check | Position | Status | Fixture diagnostic |
|---|---|---|---|
| Hook / Disturbance | Chapter 1 opening | On time | The failed copy and condemned archive create a driving question. |
| Inciting Event | Early Chapter 1 | On time | The index failure first breaks Ning's routine. |
| Key Event | End Chapter 1 | Thin | Ning commits to solo transfer, but can reverse the choice at little cost. |
| First Plot Point / Doorway 1 | End Chapter 1 | Thin | Locking the door is dynamic but not convincingly irreversible. |
| First Pinch Point | Early Chapter 2 | On time | The accelerated safety deadline concretely restricts options. |
| Midpoint / Mirror Moment | Middle Chapter 2 | Thin | Mei's support for the move reveals truth without changing Ning's behavior. |
| Second Pinch Point | Late Chapter 2 | On time | Power loss removes the available transfer method. |
| Third Plot Point / Doorway 2 | End Chapter 2 | Thin | The broadcast should make the final conflict unavoidable; its ethical cost is not yet dramatized. |
| Third Act Turning Point | Early Chapter 3 | Thin | The gathering crowd launches a final scene but also supplies convenient support. |
| Climactic Moment / Final Battle | Middle Chapter 3 | Thin | Han's postponement removes the opposition before Ning makes a costly decision. |
| Resolution / Transformation | Final Chapter 3 | Thin | Handing over failed hardware is insufficient proof of the stated transformation. |
| Inciting / Key / First Plot Point distinction | Chapters 1 | Flagged | The Inciting Event is distinct; Key Event and Doorway 1 collapse into one weak gesture. |
| Faux Climax check | Chapters 2–3 | Flagged | The broadcast looks climactic but leaves consent and demolition unresolved; Han's later reversal is the candidate climax and is unearned. |

## Language coverage

Coverage: full. This handwritten fixture represents all three English chapters and all 11 landmark checks, including the six signpost overlays, the Inciting/Key/First Plot Point distinction, and the Faux Climax check. It does not claim a real model run or real engine execution.

The envelope below is the sole machine-readable report in this Markdown file. Explanatory prose outside it has no contract authority.

```json
{
  "schema_version": "2.0.0",
  "report_id": "fixture-structure-en-001",
  "audit": "story-structure-audit",
  "stage": "structure",
  "created_at": "2026-01-17T18:00:00Z",
  "language": "en",
  "skill": {
    "name": "story-structure",
    "version": "unversioned"
  },
  "inputs": [
    {
      "path": "story-bible.md",
      "version": "fixture-v1",
      "version_type": "author"
    },
    {
      "path": "manuscript/chapter-01.md",
      "version": "fixture-v1",
      "version_type": "author"
    },
    {
      "path": "manuscript/chapter-02.md",
      "version": "fixture-v1",
      "version_type": "author"
    },
    {
      "path": "manuscript/chapter-03.md",
      "version": "fixture-v1",
      "version_type": "author"
    }
  ],
  "engine": {
    "name": "conversational",
    "version": "unknown",
    "degraded": true,
    "notes": "Handwritten fixture envelope; no engine or model was executed. Coverage: full - all three English chapters and all 11 landmark checks."
  },
  "findings": [
    {
      "id": "STRUCT-001",
      "audit": "story-structure-audit",
      "technique": "Weiland Midpoint and Bell Mirror Moment",
      "severity": "warning",
      "location": {
        "file": "manuscript/chapter-02.md",
        "scope": "chapter",
        "chapter": 2
      },
      "issue": "Mei reveals that she supported moving the collection, but Ning immediately returns to cataloging. The new truth does not produce a visible reaction-to-action pivot or force Ning to examine who she is becoming.",
      "recommendation": "Ask the author to choose a consequential midpoint action that contradicts Ning's Lie, then revise the surrounding scenes so that action changes the approach to the deadline.",
      "confidence": "judgment",
      "exemplar": "Ning could commit to a public decision about the recordings and immediately lose the private, controlled preservation she thought she wanted."
    },
    {
      "id": "STRUCT-002",
      "audit": "story-structure-audit",
      "technique": "Weiland Climactic Moment and Bell Final Battle",
      "severity": "warning",
      "location": {
        "file": "manuscript/chapter-03.md",
        "scope": "chapter",
        "chapter": 3
      },
      "issue": "Han requests a postponement after one public exchange, before Ning resolves consent, accepts a concrete loss, or chooses between competing claims. The external conflict ends without the protagonist causing the outcome.",
      "recommendation": "Make the final outcome depend on a costly choice by Ning, such as releasing control of the collection or allowing the building to close, and preserve meaningful opposition after that choice.",
      "confidence": "judgment"
    },
    {
      "id": "STRUCT-003",
      "audit": "story-structure-audit",
      "technique": "Bell Q Factor and causality check",
      "severity": "suggestion",
      "location": {
        "file": "manuscript/chapter-02.md",
        "scope": "passage",
        "chapter": 2,
        "quote": "Mr. Ke, the former caretaker, stood under the awning in carpet slippers."
      },
      "issue": "Mr. Ke arrives after the power failure with the exact key and generator knowledge required. Neither his availability nor the shared key function has been planted, so coincidence removes the obstacle.",
      "recommendation": "Plant Mr. Ke and the key before the failure, or replace his rescue with a solution that follows from Ning's earlier choices and worsens a later tradeoff.",
      "confidence": "judgment"
    },
    {
      "id": "STRUCT-004",
      "audit": "story-structure-audit",
      "technique": "Bell Doorway of No Return 1",
      "severity": "suggestion",
      "location": {
        "file": "manuscript/chapter-01.md",
        "scope": "chapter",
        "chapter": 1
      },
      "issue": "Ning locks Tao out and starts an impossible transfer, but she can unlock the door or accept Han's later offer without a material penalty. The First Plot Point lacks a no-return consequence.",
      "recommendation": "Attach a lasting cost or commitment to the solo choice so later cooperation requires repair rather than a simple reversal.",
      "confidence": "judgment"
    }
  ]
}
```
