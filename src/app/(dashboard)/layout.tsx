import { signOut } from "@/auth";
import { DashboardNavLinks } from "@/components/layout/dashboard-nav-links";
import { requireAdminUser } from "@/lib/permissions";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminUser = await requireAdminUser();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">The Machinists Institute</p>
            <p className="text-xs text-slate-500">PLC Crosswalk</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <DashboardNavLinks />
            <span className="hidden text-slate-500 sm:block">{adminUser.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl min-w-0 overflow-x-hidden px-4 py-6">{children}</main>
    </div>
  );
}
