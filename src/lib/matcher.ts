import { MappingStatus, ProgramCourse } from "@prisma/client";

import { hoursToMiCredits } from "@/lib/mi-hours";

export type ProgramCourseWithOutcomes = ProgramCourse & {
  outcomes: { description: string }[];
};

export type ExternalCourseLite = {
  id: string;
  title: string;
  credits: number | null;
  grade: string | null;
  sourceSnippet: string | null;
};

export type MappingSuggestion = {
  externalCourseId: string;
  programCourseId: string;
  status: MappingStatus;
  confidence: number;
  rationale: string;
  plcCreditsGranted: number | null;
  evidence: {
    transcriptSnippet: string;
    catalogSnippet: string;
  };
};

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function overlapScore(a: string, b: string) {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(tokensA.size, tokensB.size);
}

function buildRationale(
  externalCourse: ExternalCourseLite,
  programCourse: ProgramCourseWithOutcomes,
  score: number,
) {
  const outcomesText = programCourse.outcomes.map((item) => item.description).join("; ");
  const titleSimilarity = overlapScore(externalCourse.title, programCourse.title);
  const outcomeSimilarity = overlapScore(externalCourse.title, outcomesText);
  const summary = [
    `Matched "${externalCourse.title}" to "${programCourse.code} ${programCourse.title}".`,
    `Title similarity: ${Math.round(titleSimilarity * 100)}%.`,
    `Outcome similarity: ${Math.round(outcomeSimilarity * 100)}%.`,
    `Composite confidence: ${Math.round(score * 100)}%.`,
  ];

  return summary.join(" ");
}

function scoreCourse(externalCourse: ExternalCourseLite, programCourse: ProgramCourseWithOutcomes) {
  const outcomesText = programCourse.outcomes.map((item) => item.description).join(" ");
  const titleSimilarity = overlapScore(externalCourse.title, programCourse.title);
  const outcomeSimilarity = overlapScore(externalCourse.title, outcomesText);
  const programCourseCredits = hoursToMiCredits(
    programCourse.creditHours == null ? null : Number(programCourse.creditHours),
  );
  const creditSimilarity =
    externalCourse.credits && programCourseCredits
      ? Math.max(0, 1 - Math.abs(programCourseCredits - Number(externalCourse.credits)))
      : 0.2;

  const gradePenalty = externalCourse.grade === "F" ? 0.4 : 0;
  return Math.max(0, titleSimilarity * 0.5 + outcomeSimilarity * 0.35 + creditSimilarity * 0.15 - gradePenalty);
}

export function buildMappingSuggestions(
  externalCourses: ExternalCourseLite[],
  programCourses: ProgramCourseWithOutcomes[],
) {
  const suggestions: MappingSuggestion[] = [];

  for (const externalCourse of externalCourses) {
    let bestMatch: ProgramCourseWithOutcomes | null = null;
    let bestScore = 0;

    for (const programCourse of programCourses) {
      const score = scoreCourse(externalCourse, programCourse);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = programCourse;
      }
    }

    if (!bestMatch || bestScore < 0.15) {
      continue;
    }

    const awardedHours = bestMatch.creditHours ? Number(bestMatch.creditHours) : externalCourse.credits == null ? null : externalCourse.credits * 10;
    suggestions.push({
      externalCourseId: externalCourse.id,
      programCourseId: bestMatch.id,
      status: MappingStatus.SUGGESTED,
      confidence: Math.round(bestScore * 100),
      rationale: buildRationale(externalCourse, bestMatch, bestScore),
      plcCreditsGranted: awardedHours ?? null,
      evidence: {
        transcriptSnippet: externalCourse.sourceSnippet ?? externalCourse.title,
        catalogSnippet: bestMatch.outcomes[0]?.description ?? bestMatch.title,
      },
    });
  }

  return suggestions;
}
