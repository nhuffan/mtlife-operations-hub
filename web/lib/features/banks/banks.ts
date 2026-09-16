export const VIETQR_BANKS_URL = "https://api.vietqr.io/v2/banks";

export const FALLBACK_BANKS = [
  "MB Bank",
  "Vietcombank",
  "BIDV Bank",
  "Nam Á Bank",
  "TPbank",
  "Techcombank",
  "VPBank",
  "VietinBank",
  "ACB",
  "Sacombank",
  "VietABank",
  "HDBank",
  "VIB",
  "SHB",
  "MSB",
  "OCB",
  "LPBank",
  "Eximbank",
  "Agribank",
];

export type VietQrBank = {
  shortName?: unknown;
};

export function normalizeVietQrBanks(value: unknown) {
  if (!value || typeof value !== "object" || !("data" in value)) return [];

  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  return Array.from(
    new Set(
      data
        .map((item) => (item as VietQrBank)?.shortName)
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );
}
