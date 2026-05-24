import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

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

function usage() {
  return 'Usage: npm run user:create-admin -- --email "coworker@machinists.institute" --name "Coworker Name" --temp-password "TempPassword123!"';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.get("email")?.trim().toLowerCase() ?? "";
  const name = args.get("name")?.trim() ?? "PLC Admin";
  const tempPassword = args.get("temp-password") ?? "";

  if (!email || !email.includes("@") || tempPassword.length < 8) {
    console.error(usage());
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        role: Role.ADMIN,
        passwordHash,
      },
      create: {
        email,
        name,
        role: Role.ADMIN,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
      },
    });

    console.log(`Admin user ready: ${user.email} (${user.id})`);
    console.log("Temporary password was set successfully. Share it through a secure channel.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
