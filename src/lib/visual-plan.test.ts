import { describe, expect, it } from "vitest";

import { buildVisualPlanData } from "@/lib/visual-plan";

describe("buildVisualPlanData", () => {
  it("creates edges for mapped decisions only", () => {
    const visualPlan = buildVisualPlanData({
      planStatus: "APPROVED",
      programName: "MACH - Machinist",
      externalCourses: [
        {
          id: "ext-1",
          courseCode: "EXT 101",
          title: "Blueprint",
          credits: 5,
          status: "MAPPED",
          selections: [{ programCourseId: "pc-1", awardedCredits: 20 }, { programCourseId: "pc-2" }],
        },
        {
          id: "ext-2",
          courseCode: "EXT 102",
          title: "Dropped Course",
          credits: 5,
          status: "NO_CREDIT",
          selections: [{ programCourseId: "pc-3" }],
        },
        {
          id: "ext-3",
          courseCode: "EXT 103",
          title: "Pending Course",
          credits: 5,
          status: "UNREVIEWED",
          selections: [{ programCourseId: "pc-4" }],
        },
      ],
      catalogCourses: [
        { id: "pc-1", code: "MACH 100", title: "Safety", creditHours: 20 },
        { id: "pc-2", code: "MACH 101", title: "Math", creditHours: 10 },
        { id: "pc-3", code: "MACH 102", title: "Materials", creditHours: 20 },
        { id: "pc-5", code: "MACH 103", title: "Manual Mill", creditHours: 10 },
      ],
      journeyGroups: [
        { id: "grp-sp25", label: "SP25", sortOrder: 0 },
        { id: "grp-wi26", label: "WI26", sortOrder: 1 },
      ],
      journeyAssignments: [
        { programCourseId: "pc-2", groupId: "grp-sp25", sortOrder: 0 },
        { programCourseId: "pc-3", groupId: "grp-wi26", sortOrder: 0 },
      ],
      awardedMappedCourseIds: ["pc-1", "pc-2"],
    });

    expect(visualPlan.edges).toEqual([
      { id: "ext-1:pc-1", externalCourseId: "ext-1", programCourseId: "pc-1", awardedHours: 20 },
      { id: "ext-1:pc-2", externalCourseId: "ext-1", programCourseId: "pc-2", awardedHours: 10 },
    ]);
    expect(visualPlan.catalogNodes.filter((node) => node.isMapped).map((node) => node.id)).toEqual(["pc-1", "pc-2"]);
    expect(visualPlan.catalogNodes.map((node) => node.id)).toEqual(["pc-1", "pc-2", "pc-3", "pc-5"]);
    expect(visualPlan.summary).toEqual({
      transcriptCreditsTotal: 15,
      transcriptHoursTotal: 150,
      mappedTranscriptCredits: 5,
      creditOnlyTranscriptCredits: 0,
      noCreditTranscriptCredits: 5,
      unreviewedTranscriptCredits: 5,
      transcriptCreditsNotAwarded: 10,
      transcriptHoursNotAwarded: 100,
      programHoursTotal: 60,
      programCreditsTotal: 6,
      awardedProgramHours: 50,
      awardedProgramCredits: 5,
      journeyProgramHours: 30,
      journeyProgramCredits: 3,
      totalEarnedProgramHours: 80,
      totalEarnedProgramCredits: 8,
      completedProgramHours: 50,
      completedProgramCredits: 5,
      remainingProgramHours: 10,
      remainingProgramCredits: 1,
    });
  });

  it("keeps catalog courses present when no mappings exist", () => {
    const visualPlan = buildVisualPlanData({
      planStatus: "DRAFT",
      programName: "MACH - Machinist",
      externalCourses: [
        {
          id: "ext-1",
          courseCode: null,
          title: "Unclear Course",
          credits: null,
          status: "UNREVIEWED",
          selections: [],
        },
      ],
      catalogCourses: [{ id: "pc-1", code: "MACH 100", title: "Safety", creditHours: 20 }],
      journeyGroups: [],
      journeyAssignments: [],
    });

    expect(visualPlan.edges).toHaveLength(0);
    expect(visualPlan.catalogNodes).toEqual([
      {
        id: "pc-1",
        code: "MACH 100",
        title: "Safety",
        description: null,
        creditHours: 20,
        isMapped: false,
        isJourneySelected: false,
        isAwardedMapped: false,
        journeyGroupId: null,
        journeyGroupLabel: null,
        journeySortOrder: null,
      },
    ]);
    expect(visualPlan.externalNodes[0]?.code).toBe("Unclear Course");
  });
});
