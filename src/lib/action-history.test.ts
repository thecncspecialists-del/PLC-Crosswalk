import { describe, expect, it } from "vitest";

import { sanitizeActionMetadata } from "@/lib/action-history";

describe("sanitizeActionMetadata", () => {
  it("redacts sensitive fields and truncates long strings", () => {
    const metadata = sanitizeActionMetadata({
      fileName: "transcript.pdf",
      rawText: "student transcript content",
      nested: {
        accessToken: "secret-token",
      },
      longValue: "x".repeat(260),
    });

    expect(metadata).toMatchObject({
      fileName: "transcript.pdf",
      rawText: "[redacted]",
      nested: {
        accessToken: "[redacted]",
      },
    });
    expect(String(metadata?.longValue)).toHaveLength(243);
  });

  it("drops undefined values and limits arrays", () => {
    const metadata = sanitizeActionMetadata({
      ignored: undefined,
      values: Array.from({ length: 30 }, (_, index) => index),
    });

    expect(metadata).not.toHaveProperty("ignored");
    expect(metadata?.values).toHaveLength(25);
  });
});
