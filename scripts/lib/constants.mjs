export const STAGES = Object.freeze([
  "intake",
  "story-bible",
  "structure",
  "characters",
  "revision-plan",
  "chapter-revision",
  "prose",
  "ai-cleanup",
  "final-review",
]);

export const V3_SCHEMA_VERSIONS = new Set(["3.0.0", "3.1.0", "3.2.0"]);

export const ACTIVE_STATUSES = Object.freeze(["in_progress", "awaiting_author"]);
