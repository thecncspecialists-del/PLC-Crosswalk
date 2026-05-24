import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

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
  return 'Usage: npm run user:reset-password -- --email "coworker@machinists.institute" --temp-password "TempPassword123!"';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.get("email")?.trim().toLowerCase() ?? "";
  const tempPassword = args.get("temp-password") ?? "";

  if (!email || !email.includes("@") || tempPassword.length < 8) {
    console.error(usage());
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!existingUser) {
      throw new Error(`User not found: ${email}`);
    }

    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
      },
    });

    console.log(`Password reset complete for ${existingUser.email}.`);
    console.log("Temporary password was set successfully. Share it through a secure channel.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
