import { supabase } from "@/lib/integrations/supabase/client";

export type ExportAsset = {
  secure_url: string;
  public_id: string;
  resource_type: string;
};

export type ReconciliationExport = {
  id: string;
  created_at: string;
  created_by: string | null;
  client_id: string | null;
  client_name: string;
  period_label: string;
  source_file_name: string;
  file_name: string;
  file_size: number;
  file_format: "excel" | "pdf";
  asset: ExportAsset;
};

export type PendingExport = Omit<ReconciliationExport, "asset" | "created_by"> & {
  blob: Blob;
  asset?: ExportAsset;
};

export const EXPORT_PAGE_SIZE = 20;

export async function listReconciliationExports(page: number, clientId: string | null) {
  let query = supabase
    .from("reconciliation_exports")
    .select("*", { count: "exact" });
  query = clientId === null ? query.is("client_id", null) : query.eq("client_id", clientId);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * EXPORT_PAGE_SIZE, (page + 1) * EXPORT_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as ReconciliationExport[], count: count ?? 0 };
}

export async function archiveReconciliationExport(item: PendingExport) {
  // Keep the asset on the pending item so a metadata retry does not upload twice.
  if (!item.asset) {
    const body = new FormData();
    body.append("folder", `reconciliation_exports/${item.client_id ?? "unassigned"}`);
    body.append("files", new File([item.blob], item.file_name, { type: item.blob.type }));
    const response = await fetch("/api/cloudinary/upload", { method: "POST", body });
    if (!response.ok) throw new Error("Could not archive the exported file.");
    const result = await response.json();
    const asset = result.files?.[0] as ExportAsset | undefined;
    if (!asset?.secure_url || !asset.public_id) throw new Error("Could not archive the exported file.");
    item.asset = asset;
  }
  const record = {
    id: item.id, created_at: item.created_at, client_id: item.client_id, client_name: item.client_name,
    period_label: item.period_label, source_file_name: item.source_file_name,
    file_name: item.file_name, file_size: item.file_size,
    file_format: item.file_format, asset: item.asset,
  };
  // Stable IDs make retries safe even when a successful insert response was lost.
  const { error } = await supabase.from("reconciliation_exports")
    .upsert(record, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function deleteReconciliationExport(id: string) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("Please sign in again to delete this file.");
  const response = await fetch("/api/reconciliation/exports/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    if (response.status === 401) throw new Error("Please sign in again to delete this file.");
    if (response.status === 403) throw new Error("You can only delete files you exported.");
    throw new Error(result?.error === "Could not finish deleting the file. Please retry."
      ? result.error : "Could not delete the file. Please try again.");
  }
}
