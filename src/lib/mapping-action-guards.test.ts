import { CourseDecisionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { isNoopDecisionUpdate } from "@/lib/mapping-action-guards";

describe("isNoopDecisionUpdate", () => {
  it("returns true for equivalent decision state", () => {
    const result = isNoopDecisionUpdate({
      current: {
        status: CourseDecisionStatus.NO_CREDIT,
        awardedCredits: null,
        rationale: "Insufficient overlap",
        selectionCount: 0,
        rationaleEvidence: "Insufficient overlap",
        evidenceNote: "Syllabus mismatch",
      },
      target: {
        status: CourseDecisionStatus.NO_CREDIT,
        awardedCredits: null,
        rationale: "Insufficient overlap",
        selectionCount: 0,
        rationaleEvidence: "Insufficient overlap",
        evidenceNote: "Syllabus mismatch",
      },
    });

    expect(result).toBe(true);
  });

  it("returns false when any meaningful field changed", () => {
    const result = isNoopDecisionUpdate({
      current: {
        status: CourseDecisionStatus.CREDIT_ONLY,
        awardedCredits: 5,
        rationale: null,
        selectionCount: 0,
        rationaleEvidence: "",
        evidenceNote: "",
      },
      target: {
        status: CourseDecisionStatus.CREDIT_ONLY,
        awardedCredits: 4,
        rationale: null,
        selectionCount: 0,
        rationaleEvidence: "",
        evidenceNote: "",
      },
    });

    expect(result).toBe(false);
  });
});
