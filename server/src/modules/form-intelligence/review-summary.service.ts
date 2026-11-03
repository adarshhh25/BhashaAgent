import type { FieldMappingResult, MappingSummary } from "./form-intelligence.types";

export function summarizeMappings(results: FieldMappingResult[]): MappingSummary {
  const summary = {
    totalFields: results.length,
    proposed: results.filter((result) => result.status === "proposed").length,
    alreadyApproved: results.filter((result) => result.status === "already_approved").length,
    missing: results.filter((result) => result.status === "missing").length,
    conflicts: results.filter((result) => result.status === "conflict").length,
    invalid: results.filter((result) => result.status === "invalid").length,
    manualReview: results.filter((result) => ["requires_manual_review", "unsupported"].includes(result.status)).length,
    requiresUserAttention: false,
  };
  summary.requiresUserAttention = summary.missing + summary.conflicts + summary.invalid + summary.manualReview > 0;
  return summary;
}
