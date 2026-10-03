"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, X, Search, Pencil, Trash2, FileText, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/integrations/supabase/client";
import { toast } from "sonner";
import { deleteReconciliationClient, updateReconciliationClient, type ReconciliationClient, type ReconciliationClientInput } from "@/lib/features/reconciliation/clients";
import { attachmentCardClass, interactiveCardClass, formatFileSize } from "@/components/qa/utils/attachmentHelpers";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { deleteReconciliationExport, listReconciliationExports, type ReconciliationExport } from "@/lib/features/reconciliation/exports";

const CLIENT_PLACEHOLDERS: Record<keyof ReconciliationClientInput, string> = {
  name: "Example: ABC Company",
  address: "Example: 123 Nguyen Hue Street, Ho Chi Minh City",
  taxCode: "Example: 0312345678", tel: "Example: 0901234567",
  email: "Example: billing@company.com", beneficiaryName: "Example: NGUYEN VAN A",
  account: "Example: 63318886886", bankName: "Enter bank name...",
};

export default function ExportHistory({ revision, open, onOpenChange, clients, onClientsChanged }: {
  clients: ReconciliationClient[];
  onClientsChanged: () => Promise<void>;
  revision: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => { if (active) setUserId(data.user?.id ?? null); });
    return () => { active = false; };
  }, [open]);
  const [rows, setRows] = useState<ReconciliationExport[]>([]);
  const [selection, setSelection] = useState<{ clientId: string | null; page: number } | null>(null);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ id: string; form: ReconciliationClientInput } | null>(null);
  const [saving, setSaving] = useState(false);

  const originalClient = clients.find((client) => client.id === editor?.id);
  const hasClientChanges = Boolean(editor && originalClient &&
    (Object.keys(editor.form) as (keyof ReconciliationClientInput)[]).some(
      (field) => editor.form[field].trim() !== originalClient[field].trim()
    ));

  async function saveClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || saving || !hasClientChanges) return;
    setSaving(true);
    try {
      await updateReconciliationClient(editor.id, editor.form);
      await onClientsChanged();
      setEditor(null);
      toast.success(t("Client updated."));
    } catch (error) {
      toast.error(t((error as { code?: string })?.code === "23505" ? "A client with this name already exists." : "Could not save client details. Please try again."));
    } finally {
      setSaving(false);
    }
  }
  const [deleteTarget, setDeleteTarget] = useState<ReconciliationClient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [fileDeleteTarget, setFileDeleteTarget] = useState<ReconciliationExport | null>(null);
  const [deletingFile, setDeletingFile] = useState(false);

  async function removeFile() {
    if (!fileDeleteTarget || deletingFile) return;
    setDeletingFile(true);
    try {
      await deleteReconciliationExport(fileDeleteTarget.id);
      setFileDeleteTarget(null);
      toast.success(t("File deleted."));
      await refresh();
    } catch (error) {
      const message = error instanceof Error && [
        "Please sign in again to delete this file.", "You can only delete files you exported.",
        "Could not finish deleting the file. Please retry.",
      ].includes(error.message) ? error.message : "Could not delete the file. Please try again.";
      toast.error(t(message));
    } finally {
      setDeletingFile(false);
    }
  }

  async function removeClient() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteReconciliationClient(deleteTarget.id);
      await onClientsChanged();
      setSelection(null);
      setDeleteTarget(null);
      toast.success(t("Client deleted."));
    } catch {
      toast.error(t("Could not delete the client."));
    } finally {
      setDeleting(false);
    }
  }
  const clientId = clients.find((client) => client.id === selection?.clientId)?.id ?? clients[0]?.id ?? null;
  const selectedClient = clients.find((client) => client.id === clientId);
  const visibleClients = clients.filter((client) =>
    `${client.name} ${client.taxCode}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );
  function selectClient(id: string | null) {
    if (saving || id === clientId) return;
    setEditor(null);
    setLoading(true);
    setSelection({ clientId: id, page: 0 });
  }
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const request = useRef(0);
  const scrollRoot = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const nextPage = useRef(1);
  const moreLock = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const refresh = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    setFailed(false);
    setMoreFailed(false);
    setLoadingMore(false);
    moreLock.current = false;
    nextPage.current = 1;
    scrollRoot.current?.scrollTo({ top: 0 });
    try {
      const result = clientId ? await listReconciliationExports(0, clientId) : { rows: [], count: 0 };
      if (version !== request.current) return;
      setRows(result.rows);
      setCount(result.count);
    } catch {
      if (version === request.current) setFailed(true);
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [clientId]);
  useEffect(() => {
    if (!open) return;
    void refresh();
    const version = request.current;
    return () => { request.current = version + 1; };
  }, [refresh, revision, open]);

  const loadMore = useCallback(async () => {
    if (!clientId || moreLock.current || loading || failed || rows.length >= count) return;
    moreLock.current = true;
    const version = request.current;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const result = await listReconciliationExports(nextPage.current, clientId);
      if (version !== request.current) return;
      nextPage.current++;
      setRows((current) => [...current, ...result.rows.filter((row) => !current.some((existing) => existing.id === row.id))]);
      setCount(result.rows.length ? result.count : rows.length);
    } catch {
      if (version === request.current) setMoreFailed(true);
    } finally {
      if (version === request.current) {
        moreLock.current = false;
        setLoadingMore(false);
      }
    }
  }, [clientId, loading, failed, rows, count]);

  useEffect(() => {
    if (!open || loading || loadingMore || moreFailed || !sentinel.current || !scrollRoot.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadMore();
    }, { root: scrollRoot.current, rootMargin: "120px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [open, loading, loadingMore, moreFailed, loadMore]);

  async function download(item: ReconciliationExport) {
    setDownloading(item.id);
    try {
      const response = await fetch(item.asset.secure_url);
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = item.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error(t("Could not download the file. Please try again."));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving && !deletingFile) { setEditor(null); onOpenChange(nextOpen); } }}>
      <DialogContent showCloseButton={false} className="h-[720px] max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-5xl [&_button:not(:disabled)]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <DialogHeader className="text-left">
          <DialogTitle>{t("Client directory")}</DialogTitle>
          <DialogDescription>{t("View client details and SOA files.")}</DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 items-center gap-2">
        <DialogClose asChild>
          <Button variant="ghost" size="icon" aria-label={t("Close")}><X /></Button>
        </DialogClose>
        </div>
      </div>
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:grid-rows-1">
        <aside className="flex min-h-0 flex-col border-b bg-muted/20 sm:border-b-0 sm:border-r">
          <div className="space-y-3 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search clients...")} aria-label={t("Search clients...")} />
            </div>
          </div>
          <nav aria-label={t("Client folders")} className="flex max-h-36 gap-1 overflow-auto px-3 pb-3 sm:max-h-none sm:flex-1 sm:flex-col">
            {visibleClients.map((client) => (
              <button key={client.id} type="button" disabled={saving} onClick={() => selectClient(client.id)} aria-pressed={clientId === client.id}
                className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-lg p-3 text-left text-sm sm:shrink ${clientId === client.id ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20" : "hover:bg-muted"}`}>
                <span className="min-w-0 w-full"><span className="line-clamp-2 break-words font-medium">{client.name}</span><span className="block truncate text-xs text-muted-foreground">{client.taxCode}</span></span>
              </button>
            ))}
            {!visibleClients.length && <p className="p-2 text-sm text-muted-foreground">{t("No clients found.")}</p>}
          </nav>
        </aside>
        <div ref={scrollRoot} className="min-h-0 min-w-0 overflow-y-auto overscroll-contain">
            <div className="border-b bg-muted/10 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-primary">{t("Client information")}</p>

                </div>
                {selectedClient && !editor && <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditor({ id: selectedClient.id, form: { name: selectedClient.name, address: selectedClient.address, taxCode: selectedClient.taxCode, tel: selectedClient.tel, email: selectedClient.email, beneficiaryName: selectedClient.beneficiaryName, account: selectedClient.account, bankName: selectedClient.bankName } })}><Pencil />{t("Edit client")}</Button>
                  <Button size="icon" variant="ghost" className="text-destructive" aria-label={t("Delete client?")} onClick={() => setDeleteTarget(selectedClient)}><Trash2 /></Button>
                </div>}
              </div>
                  {editor ? <Input className="mt-3 w-full shadow-none" form="client-inline-edit" aria-label={t("Client name")} placeholder={t(CLIENT_PLACEHOLDERS.name)} required disabled={saving}
                    value={editor.form.name} onChange={(event) => setEditor({ ...editor, form: { ...editor.form, name: event.target.value } })} />
                    : <h3 className="mt-3 w-full break-words text-lg font-semibold text-foreground">{selectedClient?.name ?? t("No clients found.")}</h3>}
              {selectedClient ? (
                <form id="client-inline-edit" onSubmit={saveClient} className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    {([
                      ["address", "Address"], ["taxCode", "Tax code"],
                      ["tel", "Tel"], ["email", "Email"],
                      ["beneficiaryName", "Beneficiary name"],
                      ["account", "Account"], ["bankName", "Bank name"],
                    ] as const).map(([field, label]) => (
                      <div key={field} className={`min-w-0 ${field === "beneficiaryName" ? "col-span-full w-full" : ""}`}>
                        <label htmlFor={editor ? `client-info-${field}` : undefined} className="block text-xs font-medium text-muted-foreground">{t(label)}</label>
                        {editor ? <Input id={`client-info-${field}`} className="mt-1 shadow-none" placeholder={t(CLIENT_PLACEHOLDERS[field])} value={editor.form[field]} disabled={saving}
                          required={field === "address" || field === "taxCode"}
                          type={field === "email" ? "email" : "text"}
                          onChange={(event) => setEditor({ ...editor, form: { ...editor.form, [field]: event.target.value } })} />
                          : <p className="mt-1 break-words text-sm text-foreground">{selectedClient[field] || "—"}</p>}
                      </div>
                    ))}
                  </div>
                  {editor && <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" disabled={saving} onClick={() => setEditor(null)}>{t("Cancel")}</Button>
                    <Button type="submit" disabled={saving || !hasClientChanges || ![editor.form.name, editor.form.address, editor.form.taxCode].every((value) => value.trim())}>
                      {saving && <Loader2 className="animate-spin" />}{t(saving ? "Saving..." : "Save changes")}
                    </Button>
                  </div>}
                </form>
              ) : <p className="mt-2 text-sm text-muted-foreground">{t("Select a client to view their exported SOAs.")}</p>}
            </div>
            <div className="shrink-0 border-b px-5 py-3"><h3 className="text-sm font-semibold">{t("Exported files")}{!loading && !failed ? ` (${count})` : ""}</h3></div>
      <div>
      {loading ? <div role="status" aria-label={t("Loading exported files...")} className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : failed ? <div role="alert" className="space-y-2 p-5 text-sm text-destructive"><p>{t("Could not load exported files.")}</p><Button variant="outline" onClick={() => void refresh()}>{t("Retry loading files")}</Button></div>
        : !rows.length ? <p className="p-5 text-sm text-muted-foreground">{t("No exported files yet.")}</p>
        : <div className="space-y-3 p-5">{rows.map((item) => (
          <div key={item.id} className="relative">
          <button type="button"
            className={`${attachmentCardClass} ${interactiveCardClass} !pr-20 dark:bg-muted/10 dark:hover:bg-muted/30 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60`}
            onClick={() => void download(item)} disabled={downloading !== null || deletingFile}
            aria-label={t("Download {{name}}", { name: item.file_name })}
            aria-busy={downloading === item.id} title={item.file_name}>
            <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg ${item.file_format === "pdf" ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"}`}>
              {item.file_format === "pdf" ? <FileText className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}
              <span className="text-[9px] font-bold leading-none">{item.file_format === "pdf" ? "PDF" : "XLSX"}</span>
            </span>
            <span className="min-w-0 flex-1 overflow-hidden">
              <span className="block truncate text-sm font-medium text-foreground">{item.file_name}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{item.period_label} · {formatFileSize(item.file_size)} · {new Date(item.created_at).toLocaleString(locale)}</span>
            </span>
            <span aria-hidden="true" className="absolute right-12 top-1/2 -translate-y-1/2 text-muted-foreground group-hover:text-foreground">
              {downloading === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </span>
          </button>
          {userId && item.created_by === userId && <button type="button" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            disabled={deletingFile || downloading !== null} onClick={() => setFileDeleteTarget(item)}
            aria-label={t("Delete {{name}}", { name: item.file_name })} title={t("Delete {{name}}", { name: item.file_name })}>
            <Trash2 className="h-4 w-4" />
          </button>}
          </div>
        ))}</div>}
        {!loading && !failed && rows.length < count && (
          <div ref={sentinel} className="flex min-h-10 items-center justify-center px-5 pb-4">
            {loadingMore ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t("Loading exported files...")} /> : moreFailed ? (
              <Button variant="ghost" onClick={() => void loadMore()}>{t("Retry loading files")}</Button>
            ) : null}
          </div>
        )}
      </div>
        </div>
      </div>
    </DialogContent>
    <ConfirmDialog open={fileDeleteTarget !== null} onOpenChange={(nextOpen) => { if (!nextOpen && !deletingFile) setFileDeleteTarget(null); }}
      title={t("Delete file?")}
      description={t("{{name}} will be permanently deleted. This cannot be undone.", { name: fileDeleteTarget?.file_name ?? "" })}
      loading={deletingFile} onConfirm={() => void removeFile()} />
    <ConfirmDialog open={deleteTarget !== null} onOpenChange={(nextOpen) => { if (!nextOpen && !deleting) setDeleteTarget(null); }}
      title={t("Delete client?")} description={t("Delete this client? Their exported files will no longer appear in this directory.")}
      loading={deleting} onConfirm={() => void removeClient()} />
    </Dialog>
  );
}
