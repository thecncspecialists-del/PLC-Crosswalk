export function formatGrade(value: string | number | null | undefined) {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const numericGrade = Number(text);
  if (!Number.isFinite(numericGrade)) {
    return text;
  }

  return Number.isInteger(numericGrade) ? numericGrade.toFixed(1) : text;
}

export function formatGradeDisplay(value: string | number | null | undefined) {
  return formatGrade(value) ?? "N/A";
}
