import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminEmail.includes("@")) {
    throw new Error("ADMIN_EMAIL must be set to a valid email address before running db:seed.");
  }

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must be set and at least 12 characters before running db:seed.");
  }

  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
  const defaultProgramName = process.env.DEFAULT_PROGRAM_NAME ?? "Machining Core";

  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {
      role: Role.ADMIN,
      passwordHash: adminPasswordHash,
      name: "PLC Admin",
    },
    create: {
      email: adminEmail.toLowerCase(),
      name: "PLC Admin",
      role: Role.ADMIN,
      passwordHash: adminPasswordHash,
    },
  });

  const program = await prisma.program.upsert({
    where: { name: defaultProgramName },
    update: {},
    create: {
      name: defaultProgramName,
    },
  });

  const catalogSeed = [
    {
      code: "MACH-101",
      title: "Intro to Precision Measurement",
      creditHours: 3,
      outcomes: [
        "Interpret micrometer and caliper readings to thousandths accuracy.",
        "Apply tolerance and fit principles for common machining tasks.",
      ],
    },
    {
      code: "MACH-120",
      title: "Blueprint Reading for Machinists",
      creditHours: 4,
      outcomes: [
        "Interpret geometric dimensioning and tolerancing callouts.",
        "Extract manufacturing process requirements from blueprint packages.",
      ],
    },
    {
      code: "MACH-210",
      title: "Lathe and Mill Operations",
      creditHours: 5,
      outcomes: [
        "Set up and operate manual lathe and mill equipment safely.",
        "Produce components to specified finish and tolerance requirements.",
      ],
    },
  ];

  for (const course of catalogSeed) {
    const record = await prisma.programCourse.upsert({
      where: {
        programId_code: {
          programId: program.id,
          code: course.code,
        },
      },
      update: {
        title: course.title,
        creditHours: course.creditHours,
      },
      create: {
        programId: program.id,
        code: course.code,
        title: course.title,
        creditHours: course.creditHours,
      },
    });

    for (const outcome of course.outcomes) {
      const existing = await prisma.programOutcome.findFirst({
        where: {
          programCourseId: record.id,
          description: outcome,
        },
      });

      if (!existing) {
        await prisma.programOutcome.create({
          data: {
            programCourseId: record.id,
            description: outcome,
          },
        });
      }
    }
  }

  console.log(`Seed complete. Admin: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
