import Link from "next/link";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [transcripts, students, programCourses, reports] = await db.$transaction([
    db.transcript.count(),
    db.student.count(),
    db.programCourse.count(),
    db.report.count(),
  ]);

  return (
    <section className="grid gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Admin Dashboard</h1>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Transcripts</p>
          <p className="mt-1 text-2xl font-semibold">{transcripts}</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Students</p>
          <p className="mt-1 text-2xl font-semibold">{students}</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Program Courses</p>
          <p className="mt-1 text-2xl font-semibold">{programCourses}</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Reports</p>
          <p className="mt-1 text-2xl font-semibold">{reports}</p>
        </div>
      </div>
      <div className="rounded border border-slate-200 bg-white p-4 text-sm">
        <p className="text-slate-700">Jump directly to transcript mapping workflows.</p>
        <Link href="/transcripts" className="mt-3 inline-block rounded bg-slate-900 px-3 py-2 text-white">
          Open Transcript Queue
        </Link>
      </div>
    </section>
  );
}
