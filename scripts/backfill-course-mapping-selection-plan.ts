import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const selections = await prisma.courseMappingSelection.findMany({
    include: {
      decision: {
        select: {
          mappingPlanId: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  let relinked = 0;
  for (const selection of selections) {
    if (selection.mappingPlanId !== selection.decision.mappingPlanId) {
      await prisma.courseMappingSelection.update({
        where: { id: selection.id },
        data: {
          mappingPlanId: selection.decision.mappingPlanId,
        },
      });
      relinked += 1;
    }
  }

  const refreshedSelections = await prisma.courseMappingSelection.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const dedupeSeen = new Set<string>();
  const duplicateIdsToDelete: string[] = [];
  for (const selection of refreshedSelections) {
    const dedupeKey = `${selection.mappingPlanId}|${selection.programCourseId}`;
    if (dedupeSeen.has(dedupeKey)) {
      duplicateIdsToDelete.push(selection.id);
      continue;
    }
    dedupeSeen.add(dedupeKey);
  }

  if (duplicateIdsToDelete.length > 0) {
    await prisma.courseMappingSelection.deleteMany({
      where: {
        id: {
          in: duplicateIdsToDelete,
        },
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        relinked,
        duplicatesRemoved: duplicateIdsToDelete.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
