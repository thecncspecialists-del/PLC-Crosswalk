import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { buildMappingSuggestions, ProgramCourseWithOutcomes } from "@/lib/matcher";

describe("buildMappingSuggestions", () => {
  it("suggests a program course when title/outcomes overlap", () => {
    const suggestions = buildMappingSuggestions(
      [
        {
          id: "ext1",
          title: "Blueprint Reading for Manufacturing",
          credits: 4,
          grade: "A",
          sourceSnippet: "BP 110 Blueprint Reading for Manufacturing 4.0 A",
        },
      ],
      [
        {
          id: "pc1",
          programId: "prog1",
          code: "MACH-120",
          title: "Blueprint Reading for Machinists",
          creditHours: new Prisma.Decimal(40),
          outcomes: [{ description: "Interpret geometric dimensioning and tolerancing callouts." }],
        },
      ] satisfies ProgramCourseWithOutcomes[],
    );

    expect(suggestions.length).toBe(1);
    expect(suggestions[0]?.programCourseId).toBe("pc1");
    expect(suggestions[0]?.confidence).toBeGreaterThan(0);
    expect(suggestions[0]?.rationale).toContain("Matched");
  });
});
