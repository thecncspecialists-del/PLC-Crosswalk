import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function requireAdminUser() {
  const session = await auth();
  if (!session?.user || session.user.role !== Role.ADMIN) {
    redirect("/sign-in");
  }
  return session.user;
}

export async function getAdminSessionUser() {
  const session = await auth();
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return null;
  }
  return session.user;
}
