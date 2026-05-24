import { ParserStatus } from "@prisma/client";

export type ParsedCourse = {
  courseCode?: string;
  title: string;
  credits?: number;
  grade?: string;
  termLabel?: string;
  sourceSnippet?: string;
};

export type ParsedTranscript = {
  rawText: string;
  courses: ParsedCourse[];
  parserStatus: ParserStatus;
};

const gradePattern = /(?:^|\s)((?:A|B|C|D)(?:[+-])?|F|NP|P|S|U)(?=\s|$)/i;
const codePattern = /\b([A-Z]{2,5}\s?\d{2,4}[A-Z]?)\b/;
const trailingCreditsAndGradePattern =
  /(\d{1,2}(?:\.\d{1,2})?)\s+((?:A|B|C|D)(?:[+-])?|F|NP|P|S|U)(?=\s|$)/i;

function cleanTitle(rawTitle: string) {
  return rawTitle.replace(/\s+/g, " ").trim();
}

function extractCoursesFromText(rawText: string): ParsedCourse[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const courses: ParsedCourse[] = [];

  for (const line of lines) {
    const courseCodeMatch = line.match(codePattern);
    if (!courseCodeMatch) {
      continue;
    }

    const courseCode = courseCodeMatch[1]?.replace(/\s+/, " ").trim();
    const gradeMatch = line.match(gradePattern);
    const trailingCreditsAndGradeMatch = line.match(trailingCreditsAndGradePattern);
    const creditValue = trailingCreditsAndGradeMatch
      ? Number(trailingCreditsAndGradeMatch[1])
      : undefined;

    const codeIndex = courseCodeMatch.index ?? 0;
    const gradeIndex = gradeMatch?.index ?? line.length;
    const creditsIndex = trailingCreditsAndGradeMatch?.index ?? line.length;
    const titleEnd = Math.min(gradeIndex, creditsIndex, line.length);
    const titleStart = codeIndex + courseCodeMatch[0].length;
    const title = cleanTitle(line.slice(titleStart, titleEnd));

    if (title.length < 3) {
      continue;
    }

    courses.push({
      courseCode,
      title,
      credits: Number.isFinite(creditValue) ? creditValue : undefined,
      grade: (trailingCreditsAndGradeMatch?.[2] ?? gradeMatch?.[1])?.toUpperCase(),
      sourceSnippet: line.slice(0, 240),
    });
  }

  return courses;
}

async function parsePdfText(buffer: Buffer): Promise<string> {
  const [pdfModule, workerModule] = await Promise.all([
    import("pdf-parse"),
    import("pdf-parse/worker"),
  ]);

  const typedPdfModule = pdfModule as {
    PDFParse?: new (opts: unknown) => { getText: () => Promise<{ text?: string }> };
    default?: (input: Buffer) => Promise<{ text?: string }>;
  };
  const typedWorkerModule = workerModule as {
    CanvasFactory?: unknown;
  };

  if (typedPdfModule.PDFParse) {
    const parser = new typedPdfModule.PDFParse({
      data: buffer,
      CanvasFactory: typedWorkerModule.CanvasFactory,
    });
    const result = await parser.getText();
    return result.text ?? "";
  }

  if (typedPdfModule.default) {
    const result = await typedPdfModule.default(buffer);
    return result.text ?? "";
  }

  return "";
}

export async function parseTranscript(buffer: Buffer): Promise<ParsedTranscript> {
  try {
    const rawText = await parsePdfText(buffer);
    const courses = extractCoursesFromText(rawText);
    const parserStatus = courses.length > 0 ? ParserStatus.PARSED : ParserStatus.NEEDS_REVIEW;
    return { rawText, courses, parserStatus };
  } catch {
    return {
      rawText: "",
      courses: [],
      parserStatus: ParserStatus.FAILED,
    };
  }
}

export function parseTranscriptText(rawText: string) {
  return extractCoursesFromText(rawText);
}
