import { describe, expect, it } from "vitest";

import {
  normalizeBeekeeperLaunchUrl,
  normalizeSettingsPortalQuery,
  parseDatabaseConnectionInfo,
  truncateForPortal,
} from "@/lib/settings-db-tools";

describe("normalizeSettingsPortalQuery", () => {
  it("keeps valid values", () => {
    const normalized = normalizeSettingsPortalQuery({
      table: "reports",
      page: "3",
      pageSize: "50",
      sort: "asc",
      filter: "report",
    });

    expect(normalized).toMatchObject({
      table: "reports",
      page: 3,
      pageSize: 50,
      sort: "asc",
      filter: "report",
      issues: [],
    });
  });

  it("normalizes invalid values to safe defaults and reports issues", () => {
    const normalized = normalizeSettingsPortalQuery({
      table: "DROP TABLE users",
      page: "0",
      pageSize: "999",
      sort: "sideways",
    });

    expect(normalized.table).toBe("transcripts");
    expect(normalized.page).toBe(1);
    expect(normalized.pageSize).toBe(25);
    expect(normalized.sort).toBe("default");
    expect(normalized.issues).toEqual(["invalid_table", "invalid_page", "invalid_page_size", "invalid_sort"]);
  });
});

describe("parseDatabaseConnectionInfo", () => {
  it("parses non-secret connection fields", () => {
    const parsed = parseDatabaseConnectionInfo(
      "postgresql://admin:super-secret@db.example.com:5433/machinists?sslmode=require",
    );

    expect(parsed).toMatchObject({
      protocol: "postgresql",
      host: "db.example.com",
      port: "5433",
      database: "machinists",
      username: "admin",
      sslMode: "require",
    });
    expect(JSON.stringify(parsed)).not.toContain("super-secret");
  });

  it("returns null for unparseable values", () => {
    expect(parseDatabaseConnectionInfo("not-a-url")).toBeNull();
  });

  it("decodes prisma+postgres local urls into real postgres connection info", () => {
    const apiPayload = {
      databaseUrl: "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
    };
    const encoded = Buffer.from(JSON.stringify(apiPayload), "utf8").toString("base64url");
    const parsed = parseDatabaseConnectionInfo(`prisma+postgres://localhost:51217/?api_key=${encoded}`);

    expect(parsed).toMatchObject({
      protocol: "postgres",
      host: "localhost",
      port: "51214",
      database: "template1",
      username: "postgres",
      sslMode: "disable",
    });
  });
});

describe("truncateForPortal", () => {
  it("truncates long values for safe display", () => {
    const longValue = "x".repeat(500);
    const preview = truncateForPortal(longValue, 80);

    expect(preview).toHaveLength(83);
    expect(preview.endsWith("...")).toBe(true);
  });

  it("serializes object values safely", () => {
    const preview = truncateForPortal({
      rawText: "A".repeat(200),
      nested: {
        flag: true,
      },
    });

    expect(preview).toContain("rawText");
    expect(preview.length).toBeLessThanOrEqual(123);
  });
});

describe("normalizeBeekeeperLaunchUrl", () => {
  it("converts Windows absolute paths to file URIs", () => {
    const normalized = normalizeBeekeeperLaunchUrl(
      "C:\\Users\\thecn\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Beekeeper Studio.lnk",
    );

    expect(normalized).toBe(
      "file:///C:/Users/thecn/AppData/Roaming/Microsoft/Windows/Start%20Menu/Programs/Beekeeper%20Studio.lnk",
    );
  });

  it("passes through standard URIs unchanged", () => {
    expect(normalizeBeekeeperLaunchUrl("beekeeper://open")).toBe("beekeeper://open");
  });
});
