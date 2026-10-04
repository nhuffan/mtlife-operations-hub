const DAY_MS = 86_400_000;

/** Date-only arithmetic in UTC avoids daylight-saving and timezone shifts. */
export function normalizePeriodDate(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[ T])/);
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:$|[ T])/);
  if (!iso && !dmy) return "";
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(dmy![3]), Number(dmy![2]), Number(dmy![1])];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return date.toISOString().slice(0, 10);
}

/** Both start and end dates belong to the statement period. */
export function periodDays(start: string, end: string): number | null {
  if (!start || !end || normalizePeriodDate(start) !== start || normalizePeriodDate(end) !== end || start > end) return null;
  return (Date.parse(end) - Date.parse(start)) / DAY_MS + 1;
}

export function periodStartDate(end: string, days: number): string {
  if (!normalizePeriodDate(end) || !Number.isInteger(days) || days < 1) return "";
  const date = new Date(Date.parse(end) - (days - 1) * DAY_MS);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1) return "";
  return date.toISOString().slice(0, 10);
}

export function defaultClientPeriod(days?: number | null, now = new Date()) {
  if (!days) return { periodStart: "", periodEnd: "" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  const periodEnd = `${part("year")}-${part("month")}-${part("day")}`;
  return { periodStart: periodStartDate(periodEnd, days), periodEnd };
}
