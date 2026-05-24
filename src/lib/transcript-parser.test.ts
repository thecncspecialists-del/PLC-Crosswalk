import { describe, expect, it } from "vitest";

import { parseTranscriptText } from "@/lib/transcript-parser";

describe("parseTranscriptText", () => {
  it("extracts courses from transcript-style lines", () => {
    const rawText = `
      MACH101 Intro to Precision Measurement 3.0 A
      MATH 147 Technical Math 4.0 B+
      ENGL099 Communication Fundamentals 2.0 P
    `;

    const courses = parseTranscriptText(rawText);
    expect(courses.length).toBe(3);
    expect(courses[0]?.courseCode).toContain("MACH101");
    expect(courses[0]?.title).toContain("Precision Measurement");
    expect(courses[0]?.credits).toBe(3);
    expect(courses[1]?.grade).toBe("B+");
  });
});
