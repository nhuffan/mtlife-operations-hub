export type MerchantTransferStatus = "not_transferred" | "ready" | "transferred";

export type MerchantTransferRow = {
  id: string;
  sequence_no: number;
  merchant: string;
  amount: number;
  account_number: string;
  account_holder: string;
  bank_name: string;
  branch: string | null;
  status: MerchantTransferStatus;
  transaction_date: string;
  completion_date: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string | null;
  version: number;
};

export const TRANSFER_STATUS_LABEL: Record<MerchantTransferStatus, string> = {
  not_transferred: "Not transferred",
  ready: "Ready to transfer",
  transferred: "Transferred",
};

export function formatTransferDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

export function getMonthKey(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(monthKey: string) {
  if (!monthKey || monthKey === "__all__") return "All";
  const [year, month] = monthKey.split("-");
  if (!year || !month) return monthKey;
  return `Month ${month}/${year}`;
}

export function parseMoneyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function formatMoneyInput(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(digits));
}

export function getNextAvailableSequenceNo(items: Pick<MerchantTransferRow, "sequence_no">[]) {
  const used = new Set(items.map((item) => Number(item.sequence_no)).filter(Number.isFinite));
  let sequenceNo = 1;

  while (used.has(sequenceNo)) {
    sequenceNo += 1;
  }

  return sequenceNo;
}
