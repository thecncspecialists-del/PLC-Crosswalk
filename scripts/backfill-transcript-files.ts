import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const transcripts = await prisma.transcript.findMany({
    include: {
      files: {
        orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
        },
      },
      externalCourses: {
        where: {
          transcriptFileId: null,
        },
        select: {
          id: true,
        },
      },
    },
  });

  let filesCreated = 0;
  let coursesLinked = 0;

  for (const transcript of transcripts) {
    let fileId = transcript.files[0]?.id ?? null;

    if (!fileId) {
      const file = await prisma.transcriptFile.create({
        data: {
          transcriptId: transcript.id,
          fileName: transcript.fileName,
          fileUrl: transcript.fileUrl,
          parserStatus: transcript.parserStatus,
          rawText: transcript.rawText,
          uploadedAt: transcript.uploadedAt,
        },
        select: {
          id: true,
        },
      });
      fileId = file.id;
      filesCreated += 1;
    }

    if (transcript.externalCourses.length > 0) {
      const result = await prisma.externalCourse.updateMany({
        where: {
          id: {
            in: transcript.externalCourses.map((course) => course.id),
          },
        },
        data: {
          transcriptFileId: fileId,
        },
      });
      coursesLinked += result.count;
    }
  }

  console.log(`Backfilled ${filesCreated} transcript files and linked ${coursesLinked} courses.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
