import { CourseDecisionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  computeCompletionStats,
  computeLockedCatalogCourseMetadata,
  ensureAllocationsForSelections,
} from "@/lib/mapping-plan";

describe("computeCompletionStats", () => {
  it("tracks mapped/no-credit/unreviewed counts", () => {
    const stats = computeCompletionStats([
      CourseDecisionStatus.MAPPED,
      CourseDecisionStatus.NO_CREDIT,
      CourseDecisionStatus.CREDIT_ONLY,
      CourseDecisionStatus.UNREVIEWED,
      CourseDecisionStatus.MAPPED,
    ]);

    expect(stats.total).toBe(5);
    expect(stats.mapped).toBe(2);
    expect(stats.noCredit).toBe(1);
    expect(stats.creditOnly).toBe(1);
    expect(stats.unreviewed).toBe(1);
    expect(stats.decided).toBe(4);
  });
});

describe("ensureAllocationsForSelections", () => {
  it("returns true when all selected courses have non-negative numeric credits", () => {
    const isValid = ensureAllocationsForSelections(["a", "b"], {
      a: 2,
      b: 1.5,
    });

    expect(isValid).toBe(true);
  });

  it("returns false when a selected course has missing or invalid credit", () => {
    const missing = ensureAllocationsForSelections(["a", "b"], { a: 2, b: null });
    const negative = ensureAllocationsForSelections(["a"], { a: -1 });

    expect(missing).toBe(false);
    expect(negative).toBe(false);
  });
});

describe("computeLockedCatalogCourseMetadata", () => {
  it("locks only selections mapped by other extracted courses", () => {
    const result = computeLockedCatalogCourseMetadata(
      [
        {
          externalCourseId: "ext-1",
          externalCourseLabel: "EXT 101 Intro",
          selectedProgramCourseIds: ["pc-1", "pc-2"],
        },
        {
          externalCourseId: "ext-2",
          externalCourseLabel: "EXT 102 Blueprint",
          selectedProgramCourseIds: ["pc-3"],
        },
      ],
      "ext-1",
    );

    expect(result.lockedCatalogCourseIds.sort()).toEqual(["pc-3"]);
    expect(result.lockedReasonByCourseId["pc-3"]).toContain("EXT 102 Blueprint");
    expect(result.lockedReasonByCourseId["pc-1"]).toBeUndefined();
  });

  it("deduplicates lock entries when a course appears multiple times", () => {
    const result = computeLockedCatalogCourseMetadata(
      [
        {
          externalCourseId: "ext-2",
          externalCourseLabel: "EXT 102 Blueprint",
          selectedProgramCourseIds: ["pc-3", "pc-3"],
        },
      ],
      "ext-1",
    );

    expect(result.lockedCatalogCourseIds).toEqual(["pc-3"]);
  });
});
