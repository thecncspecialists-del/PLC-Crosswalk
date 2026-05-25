import { describe, expect, it } from "vitest";

import { deleteStoredFile, readStoredFile } from "@/lib/storage";

describe("inline storage references", () => {
  it("reads base64 inline file references", async () => {
    const fileBuffer = await readStoredFile("data:application/pdf;base64,JVBERi0xLjQK");

    expect(fileBuffer.toString("utf8")).toBe("%PDF-1.4\n");
  });

  it("ignores deletes for inline file references", async () => {
    await expect(deleteStoredFile("data:text/plain;base64,SGVsbG8=")).resolves.toBeUndefined();
  });
});
