import { NextResponse } from "next/server";
import { ActionHistoryStatus } from "@prisma/client";

import { recordActionHistory } from "@/lib/action-history";
import { importCatalogRows } from "@/lib/catalog-import";
import { parseCatalogWorkbook } from "@/lib/catalog-parser";
import { getAdminSessionUser } from "@/lib/permissions";

export async function POST(request: Request) {
  const adminUser = await getAdminSessionUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const replaceExisting = String(formData.get("replaceExisting") ?? "true") === "true";

  if (!(file instanceof File)) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "catalog_import",
      description: "Catalog API import was rejected because no workbook file was submitted.",
      area: "catalog",
      affectedType: "program_catalog",
      status: ActionHistoryStatus.WARNING,
    });
    return NextResponse.json({ error: "Workbook file is required." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsedCatalog: ReturnType<typeof parseCatalogWorkbook>;
  try {
    parsedCatalog = parseCatalogWorkbook(buffer);
  } catch (error) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "catalog_import",
      description: "Catalog API import failed while parsing the workbook.",
      area: "catalog",
      affectedType: "program_catalog",
      status: ActionHistoryStatus.ERROR,
      metadata: {
        fileName: file.name,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });
    return NextResponse.json({ error: "Unable to parse workbook." }, { status: 400 });
  }
  const rows = parsedCatalog.rows;

  if (rows.length === 0) {
    await recordActionHistory({
      actor: adminUser,
      actionType: "catalog_import",
      description: "Catalog API import found no curriculum rows.",
      area: "catalog",
      affectedType: "program_catalog",
      status: ActionHistoryStatus.WARNING,
      metadata: {
        fileName: file.name,
        parserSummary: parsedCatalog.summary,
      },
    });
    return NextResponse.json(
      { error: "No curriculum rows were detected. Check workbook headers." },
      { status: 400 },
    );
  }

  const importSummary = await importCatalogRows({
    rows,
    replaceExisting,
    resetMappings: replaceExisting,
  });

  await recordActionHistory({
    actor: adminUser,
    actionType: "catalog_import",
    description: "Imported curriculum catalog workbook through the API.",
    area: "catalog",
    affectedType: "program_catalog",
    status: ActionHistoryStatus.SUCCESS,
    metadata: {
      fileName: file.name,
      replaceExisting,
      importedRows: importSummary.importedRows,
      programs: importSummary.programs,
      courses: importSummary.courses,
      outcomes: importSummary.outcomes,
      resetDecisionCount: importSummary.resetDecisionCount,
      resetPlanCount: importSummary.resetPlanCount,
      parserSummary: parsedCatalog.summary,
    },
  });

  return NextResponse.json({
    ok: true,
    importedRows: importSummary.importedRows,
    programs: importSummary.programs,
    programCourses: importSummary.courses,
    outcomes: importSummary.outcomes,
    resetDecisionCount: importSummary.resetDecisionCount,
    resetPlanCount: importSummary.resetPlanCount,
    parserSummary: parsedCatalog.summary,
  });
}
