import { supabase } from "@/lib/integrations/supabase/client";

export interface ReconciliationClient {
  id: string;
  name: string;
  address: string;
  taxCode: string;
  tel: string;
  email: string;
  beneficiaryName: string;
  account: string;
  bankName: string;
  periodDays: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationClientInput {
  name: string;
  address: string;
  taxCode: string;
  tel: string;
  email: string;
  beneficiaryName: string;
  account: string;
  bankName: string;
}

interface ReconciliationClientRow {
  id: string;
  name: string;
  address: string;
  tax_code: string;
  tel: string | null;
  email: string | null;
  beneficiary_name: string | null;
  account: string | null;
  bank_name: string | null;
  period_days: number | null;
  created_at: string;
  updated_at: string;
}

function mapClient(row: ReconciliationClientRow): ReconciliationClient {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    taxCode: row.tax_code,
    tel: row.tel ?? "",
    email: row.email ?? "",
    beneficiaryName: row.beneficiary_name ?? "",
    account: row.account ?? "",
    bankName: row.bank_name ?? "",
    periodDays: row.period_days ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanInput(input: ReconciliationClientInput) {
  return {
    name: input.name.trim(),
    address: input.address.trim(),
    tax_code: input.taxCode.trim(),
    tel: input.tel.trim(),
    email: input.email.trim(),
    beneficiary_name: input.beneficiaryName.trim(),
    account: input.account.trim(),
    bank_name: input.bankName.trim(),
  };
}

const CLIENT_COLUMNS =
  "id, name, address, tax_code, tel, email, beneficiary_name, account, bank_name, period_days, created_at, updated_at";

export async function listReconciliationClients() {
  const { data, error } = await supabase
    .from("reconciliation_clients")
    .select(CLIENT_COLUMNS)
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as ReconciliationClientRow[]).map(mapClient);
}

export async function createReconciliationClient(input: ReconciliationClientInput) {
  const { data, error } = await supabase
    .from("reconciliation_clients")
    .insert(cleanInput(input))
    .select(CLIENT_COLUMNS)
    .single();

  if (error) throw error;
  return mapClient(data as ReconciliationClientRow);
}

export async function updateReconciliationClient(
  id: string,
  input: ReconciliationClientInput
) {
  const { data, error } = await supabase
    .from("reconciliation_clients")
    .update({ ...cleanInput(input), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(CLIENT_COLUMNS)
    .single();

  if (error) throw error;
  return mapClient(data as ReconciliationClientRow);
}

export async function deleteReconciliationClient(id: string) {
  const { error } = await supabase.from("reconciliation_clients").delete().eq("id", id);
  if (error) throw error;
}

export async function saveReconciliationClientPeriod(id: string, days: number) {
  if (!Number.isInteger(days) || days < 1) throw new Error("Invalid SOA period.");
  const { data, error } = await supabase
    .from("reconciliation_clients")
    .update({ period_days: days, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(CLIENT_COLUMNS)
    .single();
  if (error) throw error;
  return mapClient(data as ReconciliationClientRow);
}
