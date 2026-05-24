export const MI_HOURS_PER_CREDIT = 10;

export function hoursToMiCredits(hours: number | null | undefined) {
  if (typeof hours !== "number" || !Number.isFinite(hours)) {
    return null;
  }

  return hours / MI_HOURS_PER_CREDIT;
}

export function creditsToMiHours(credits: number | null | undefined) {
  if (typeof credits !== "number" || !Number.isFinite(credits)) {
    return null;
  }

  return credits * MI_HOURS_PER_CREDIT;
}

export function formatMiNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatMiHours(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${formatMiNumber(value)} hour${value === 1 ? "" : "s"}`;
}

export function formatMiCredits(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${formatMiNumber(value)} credit${value === 1 ? "" : "s"}`;
}

export function formatMiHoursWithCredits(hours: number | null | undefined) {
  if (typeof hours !== "number" || !Number.isFinite(hours)) {
    return "N/A";
  }

  const credits = hoursToMiCredits(hours);
  return `${formatMiHours(hours)} (${formatMiCredits(credits)})`;
}
