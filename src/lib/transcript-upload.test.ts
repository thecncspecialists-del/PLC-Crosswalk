import { describe, expect, it } from "vitest";

import { validateTranscriptUploadFile } from "@/lib/transcript-upload";

function fileFromText(contents: string, name: string, type = "application/pdf") {
  return new File([contents], name, { type });
}

describe("validateTranscriptUploadFile", () => {
  it("accepts a PDF file with a PDF header", async () => {
    const result = await validateTranscriptUploadFile(fileFromText("%PDF-1.4\nfixture", "transcript.pdf"));

    expect(result.ok).toBe(true);
  });

  it("rejects missing files", async () => {
    const result = await validateTranscriptUploadFile(null);

    expect(result).toEqual({
      ok: false,
      notice: "upload_missing_file",
    });
  });

  it("rejects non-PDF files by name and type", async () => {
    const result = await validateTranscriptUploadFile(fileFromText("plain text", "transcript.txt", "text/plain"));

    expect(result).toEqual({
      ok: false,
      notice: "upload_invalid_file_type",
    });
  });

  it("rejects renamed files without a PDF header", async () => {
    const result = await validateTranscriptUploadFile(fileFromText("plain text", "transcript.pdf"));

    expect(result).toEqual({
      ok: false,
      notice: "upload_invalid_file_type",
    });
  });
});
