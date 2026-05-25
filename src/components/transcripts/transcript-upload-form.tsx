"use client";

import { useMemo, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

type ExistingRecordOption = {
  id: string;
  firstName: string;
  lastName: string;
  studentRef: string | null;
  latestInstitutionName: string;
};

type TranscriptUploadFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  existingRecords: ExistingRecordOption[];
};

function recordLabel(record: ExistingRecordOption) {
  const name = `${record.lastName}, ${record.firstName}`;
  return record.studentRef ? `${name} (${record.studentRef})` : name;
}

export function TranscriptUploadForm({ action, existingRecords }: TranscriptUploadFormProps) {
  const [uploadMode, setUploadMode] = useState<"existing" | "new">(
    existingRecords.length > 0 ? "existing" : "new",
  );
  const [recordSearch, setRecordSearch] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [studentRef, setStudentRef] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");

  const filteredRecords = useMemo(() => {
    const query = recordSearch.trim().toLowerCase();
    if (!query) {
      return existingRecords;
    }
    return existingRecords.filter((record) => {
      const haystack =
        `${record.firstName} ${record.lastName} ${record.studentRef ?? ""} ${record.latestInstitutionName}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [existingRecords, recordSearch]);

  const activeRecord = existingRecords.find((record) => record.id === selectedRecordId) ?? null;
  const visibleRecords =
    activeRecord && !filteredRecords.some((record) => record.id === activeRecord.id)
      ? [activeRecord, ...filteredRecords]
      : filteredRecords;

  const isExistingMode = uploadMode === "existing";
  const existingInstitutionName = activeRecord?.latestInstitutionName ?? "Unknown Institution";
  const needsExistingRecord = isExistingMode && !activeRecord;
  const submitHelpId = "transcript-upload-submit-help";

  return (
    <form action={action} className="grid gap-3 rounded border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Upload Transcript</h2>

      <div className="grid grid-cols-2 gap-2 rounded border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => {
            setUploadMode("existing");
            setSelectedRecordId("");
            setStudentFirstName("");
            setStudentLastName("");
            setStudentRef("");
            setInstitutionName("");
          }}
          disabled={existingRecords.length === 0}
          className={`h-8 rounded text-xs font-semibold ${
            isExistingMode ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/70"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Existing Record
        </button>
        <button
          type="button"
          onClick={() => {
            setUploadMode("new");
            setStudentFirstName("");
            setStudentLastName("");
            setStudentRef("");
            setInstitutionName("");
          }}
          className={`h-8 rounded text-xs font-semibold ${
            !isExistingMode ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/70"
          }`}
        >
          New Record
        </button>
      </div>

      <input type="hidden" name="uploadMode" value={uploadMode} />
      <input type="hidden" name="existingTranscriptId" value={isExistingMode ? activeRecord?.id ?? "" : ""} />

      <div className="grid min-h-[13.75rem] content-start gap-3">
        {isExistingMode ? (
          <>
          <div className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3">
            <input
              type="search"
              value={recordSearch}
              onChange={(event) => setRecordSearch(event.target.value)}
              aria-label="Search existing student records"
              placeholder="Search existing records..."
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <select
              required
              value={selectedRecordId}
              aria-label="Select existing student record"
              onChange={(event) => {
                const nextId = event.target.value;
                setSelectedRecordId(nextId);
                const nextRecord = existingRecords.find((record) => record.id === nextId);
                if (!nextRecord) {
                  setStudentFirstName("");
                  setStudentLastName("");
                  setStudentRef("");
                  setInstitutionName("");
                  return;
                }
                setStudentFirstName(nextRecord.firstName);
                setStudentLastName(nextRecord.lastName);
                setStudentRef(nextRecord.studentRef ?? "");
                setInstitutionName(nextRecord.latestInstitutionName ?? "");
              }}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select a student
              </option>
              {visibleRecords.length === 0 ? (
                <option value="__none" disabled>
                  No records match this search
                </option>
              ) : (
                visibleRecords.map((record) => (
                  <option key={record.id} value={record.id}>
                    {recordLabel(record)}
                  </option>
                ))
              )}
            </select>
            <p className="text-xs text-slate-600">
              Existing record upload repairs the stored PDF preview and keeps extracted courses unchanged.
            </p>
            {needsExistingRecord ? (
              <p id={submitHelpId} className="text-xs font-medium text-amber-700">
                Select an existing student record before updating.
              </p>
            ) : null}
          </div>
          <input type="hidden" name="studentFirstName" value={activeRecord?.firstName ?? ""} />
          <input type="hidden" name="studentLastName" value={activeRecord?.lastName ?? ""} />
          <input type="hidden" name="studentRef" value={activeRecord?.studentRef ?? ""} />
          <input type="hidden" name="institutionName" value={existingInstitutionName} />
          </>
        ) : (
          <>
          <input
            required
            name="studentFirstName"
            value={studentFirstName}
            onChange={(event) => setStudentFirstName(event.target.value)}
            aria-label="Student first name"
            placeholder="Student first name"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            name="studentLastName"
            value={studentLastName}
            onChange={(event) => setStudentLastName(event.target.value)}
            aria-label="Student last name"
            placeholder="Student last name"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="studentRef"
            value={studentRef}
            onChange={(event) => setStudentRef(event.target.value)}
            aria-label="Student reference"
            placeholder="Student reference (optional)"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            name="institutionName"
            value={institutionName}
            onChange={(event) => setInstitutionName(event.target.value)}
            aria-label="Institution name"
            placeholder="Institution name"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          </>
        )}
      </div>

      <div className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="transcript-upload-file"
            className="inline-flex h-9 cursor-pointer items-center rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Choose PDF
          </label>
          <span className="text-sm text-slate-700">{selectedFileName || "No file selected"}</span>
        </div>
        <input
          required
          id="transcript-upload-file"
          type="file"
          name="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")}
        />
      </div>

      <SubmitButton
        aria-describedby={needsExistingRecord ? submitHelpId : undefined}
        disabled={needsExistingRecord}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        title={needsExistingRecord ? "Select an existing student record before updating." : undefined}
      >
        {isExistingMode ? "Repair PDF" : "Upload"}
      </SubmitButton>
    </form>
  );
}
