export function extractDigits(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}
