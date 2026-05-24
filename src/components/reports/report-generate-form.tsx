import { SubmitButton } from "@/components/ui/submit-button";

type ReportGenerateFormProps = {
  transcriptId: string;
  format: "ADMIN" | "STUDENT";
  action: (formData: FormData) => void | Promise<void>;
};

export function ReportGenerateForm({ transcriptId, format, action }: ReportGenerateFormProps) {
  return (
    <form action={action}>
      <input type="hidden" name="transcriptId" value={transcriptId} />
      <input type="hidden" name="format" value={format} />
      <SubmitButton className="inline-flex h-10 items-center rounded border border-slate-400 bg-slate-50 px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100 disabled:opacity-50">
        Generate {format === "ADMIN" ? "Admin" : "Student"} Report
      </SubmitButton>
    </form>
  );
}
