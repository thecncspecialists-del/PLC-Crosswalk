import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { SubmitButton } from "@/components/ui/submit-button";

type SignInPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  if (session?.user) {
    redirect("/transcripts");
  }

  const params = await searchParams;
  const isDev = process.env.NODE_ENV !== "production";
  const devEmail = process.env.ADMIN_EMAIL;
  const devPassword = process.env.ADMIN_PASSWORD;

  async function signInAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      await signIn("credentials", {
        email,
        password,
        redirectTo: "/transcripts",
      });
    } catch (error) {
      if (error instanceof AuthError) {
        const causeMessage =
          error.cause && typeof error.cause === "object" && "err" in error.cause
            ? String((error.cause as { err?: { message?: string } }).err?.message ?? "")
            : "";
        const dbUnavailable =
          causeMessage.includes("Cannot fetch data from service") ||
          causeMessage.includes("P1001") ||
          causeMessage.includes("fetch failed");

        if (dbUnavailable) {
          redirect("/sign-in?error=ServiceUnavailable");
        }
        redirect("/sign-in?error=CredentialsSignin");
      }
      throw error;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full rounded border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">The Machinists Institute</h1>
        <p className="mt-1 text-sm text-slate-600">PLC Crosswalk Admin Login</p>
        <p className="mt-1 text-xs text-slate-500">
          Admin accounts are provisioned by your system admin. If you were issued a temporary password, sign in and
          rotate it immediately.
        </p>
        <form action={signInAction} className="mt-6 grid gap-3">
          <input
            required
            type="email"
            name="email"
            placeholder="admin@machinists.institute"
            defaultValue={isDev ? devEmail : undefined}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            type="password"
            name="password"
            placeholder="Password"
            defaultValue={isDev ? devPassword : undefined}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <SubmitButton className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Sign In
          </SubmitButton>
          {params.error === "ServiceUnavailable" ? (
            <p className="text-sm text-rose-600">
              Sign-in is temporarily unavailable because the local database service is offline. Start Prisma dev and
              try again.
            </p>
          ) : null}
          {params.error && params.error !== "ServiceUnavailable" ? (
            <p className="text-sm text-rose-600">Sign-in failed. Check your credentials and try again.</p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
