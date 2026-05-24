import path from "node:path";
import { existsSync } from "node:fs";

import { importDemgyTranscriptBatch } from "../src/lib/workbook-transcript-import";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      continue;
    }
    args.set(key.slice(2), value);
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workbookPath = args.get("workbook");
  const sourceDirectory = args.get("source");

  if (!workbookPath || !sourceDirectory) {
    console.error(
      [
        "Usage:",
        "npm run import:demgy -- --workbook \"C:\\\\Users\\\\thecn\\\\Codex_002\\\\Demgy - Apprentice Transcript Course Completion.xlsx\" --source \"C:\\\\Users\\\\thecn\\\\Codex_002\"",
      ].join("\n"),
    );
    process.exit(1);
  }

  const resolvedWorkbook = path.resolve(workbookPath);
  const resolvedSource = path.resolve(sourceDirectory);
  if (!existsSync(resolvedWorkbook)) {
    throw new Error(`Workbook does not exist: ${resolvedWorkbook}`);
  }
  if (!existsSync(resolvedSource)) {
    throw new Error(`Source directory does not exist: ${resolvedSource}`);
  }

  const summary = await importDemgyTranscriptBatch({
    workbookPath: resolvedWorkbook,
    sourceDirectory: resolvedSource,
  });

  console.log("Demgy transcript import complete.");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
