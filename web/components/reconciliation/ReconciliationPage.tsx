"use client";

import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookUser,
  Building2,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Download,
  ChevronDown,
  FileCheck2,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ClientSourceDialog from "@/components/reconciliation/ClientSourceDialog";
import {
  listReconciliationClients,
  type ReconciliationClient,
} from "@/lib/features/reconciliation/clients";
import {
  createStatementOfAccount,
  parseReconciliationWorkbook,
  type ReconciliationData,
} from "@/lib/features/reconciliation/reconciliation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TEMPLATE_URL = "/templates/soa-mt-life-monthly.xlsx";

type ReconciliationBatchItem = {
  id: string;
  data: ReconciliationData;
  clientId: string;
};

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function uniqueFileName(fileName: string, usedNames: Set<string>) {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";
  let suffix = 2;
  let candidate = `${base}_${suffix}${extension}`;
  while (usedNames.has(candidate)) candidate = `${base}_${++suffix}${extension}`;
  usedNames.add(candidate);
  return candidate;
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

export default function ReconciliationPage() {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<ReconciliationBatchItem[]>([]);
  const [activeItemId, setActiveItemId] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clients, setClients] = useState<ReconciliationClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSourceOpen, setClientSourceOpen] = useState(false);
  const [clientDialogMode, setClientDialogMode] = useState<"directory" | "create">("directory");

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeItemId) ?? items[0] ?? null,
    [activeItemId, items]
  );
  const data = activeItem?.data ?? null;
  const selectedClientId = activeItem?.clientId ?? "";
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );
  const incompleteCount = items.filter(
    (item) => !clients.some((client) => client.id === item.clientId)
  ).length;

  const refreshClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const nextClients = await listReconciliationClients();
      setClients(nextClients);
      setItems((current) =>
        current.map((item) =>
          nextClients.some((client) => client.id === item.clientId)
            ? item
            : { ...item, clientId: "" }
        )
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load the client source.";
      toast.error(message);
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshClients();
  }, [refreshClients]);

  function openClientDialog(mode: "directory" | "create") {
    setClientDialogMode(mode);
    setClientSourceOpen(true);
  }

  async function readFiles(files: File[]) {
    if (!files.length || reading) return;
    setReading(true);
    setError("");
    const existingIds = new Set(items.map((item) => item.id));
    const nextItems: ReconciliationBatchItem[] = [];
    const failures: string[] = [];
    try {
      for (const file of files) {
        const id = fileKey(file);
        if (existingIds.has(id)) {
          failures.push(`${file.name}: ${t("This file has already been added.")}`);
          continue;
        }
        existingIds.add(id);
        if (!/\.xlsx?$/i.test(file.name)) {
          failures.push(`${file.name}: ${t("Please select an .xlsx or .xls Excel file.")}`);
          continue;
        }
        try {
          const parsed = parseReconciliationWorkbook(await file.arrayBuffer(), file.name);
          const merchantName = parsed.merchantName.trim().toLowerCase();
          const matchingClient = clients.find(
            (client) => client.name.trim().toLowerCase() === merchantName
          );
          nextItems.push({ id, data: parsed, clientId: matchingClient?.id ?? "" });
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Could not read the reconciliation file.";
          failures.push(`${file.name}: ${t(message)}`);
        }
      }
      if (nextItems.length) {
        setItems((current) => [...current, ...nextItems]);
        setActiveItemId(nextItems[0].id);
        toast.success(t("Loaded {{count}} reconciliation files.", { count: nextItems.length }));
      }
      if (failures.length) {
        setError(failures.join("\n"));
        toast.error(t("Could not add {{count}} files.", { count: failures.length }));
      }
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void readFiles(Array.from(event.dataTransfer.files));
  }

  function assignClient(itemId: string, clientId: string) {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, clientId } : item))
    );
  }

  function removeItem(itemId: string) {
    setItems((current) => {
      const removedIndex = current.findIndex((item) => item.id === itemId);
      const next = current.filter((item) => item.id !== itemId);
      if (itemId === activeItemId) {
        setActiveItemId(next[Math.min(Math.max(removedIndex, 0), next.length - 1)]?.id ?? "");
      }
      return next;
    });
    setClientPickerOpen(false);
  }

  async function exportSoas(format: "excel" | "pdf") {
    if (!items.length || exporting) return;
    if (incompleteCount) {
      toast.error(t("Please select a client for every reconciliation file before exporting."));
      return;
    }

    setExporting(true);
    try {
      const response = await fetch(TEMPLATE_URL);
      if (!response.ok) throw new Error("Could not load the MT LIFE SOA template.");
      const templateBuffer = await response.arrayBuffer();
      const usedNames = new Set<string>();
      // Render one workbook at a time to limit browser memory during batch exports.
      for (const item of items) {
        const client = clients.find((candidate) => candidate.id === item.clientId);
        if (!client) throw new Error(`No client selected for ${item.data.sourceFileName}.`);
        const workbook = await createStatementOfAccount(templateBuffer.slice(0), item.data, client);
        const output = format === "pdf"
          ? await (await import("@/lib/features/reconciliation/statementPdf")).createStatementPdf(workbook)
          : workbook;
        downloadBlob(output.blob, uniqueFileName(output.fileName, usedNames));
        if (items.length > 1) await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
      toast.success(t("Requested download of {{count}} SOA files.", { count: items.length }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not export the SOA file.";
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }

  function reset() {
    setItems([]);
    setActiveItemId("");
    setError("");
    setClientPickerOpen(false);
  }

  return (
    <div className="w-full space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        className="hidden"
        onChange={(event) => void readFiles(Array.from(event.target.files ?? []))}
      />
      <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 text-[30px] font-extrabold tracking-tight text-foreground">
          <FileCheck2 className="h-7 w-7 text-primary" />
          Reconciliation Management
        </h1>

        <div className="flex flex-wrap gap-2">
          {!items.length ? (
            <>
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => openClientDialog("directory")}
              >
                <BookUser />
                Client directory
              </Button>
              <Button
                className="cursor-pointer"
                onClick={() => openClientDialog("create")}
              >
                <Plus className="h-4 w-4" />
                Add client
              </Button>
            </>
          ) : null}
          {items.length ? (
            <>
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => inputRef.current?.click()}
                disabled={exporting || reading}
              >
                {reading ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                Add files
              </Button>
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={reset}
                disabled={exporting || reading}
              >
                <RotateCcw />
                Clear all
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="cursor-pointer"
                    disabled={exporting || reading || incompleteCount > 0}
                  >
                    {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                    {exporting
                      ? "Exporting..."
                      : items.length === 1
                        ? "Export SOA"
                        : "Export all SOAs"}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void exportSoas("excel")}>Excel (.xlsx)</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportSoas("pdf")}>PDF (.pdf)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </div>
      </div>

      {!items.length ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition-colors ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-border bg-card hover:border-primary/60 hover:bg-muted/30"
          }`}
        >
          {reading ? (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="mt-4 font-semibold">Reading reconciliation files...</p>
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-primary/10 p-4 text-primary">
                <UploadCloud className="h-10 w-10" />
              </div>
              <p className="mt-5 text-lg font-semibold text-foreground">
                Drag and drop reconciliation files here
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                or click to select one or more Excel files
              </p>
              <span className="mt-4 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                Supports .xlsx and .xls
              </span>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold">Reconciliation files loaded successfully</p>
                <p className="mt-1 text-sm opacity-90">
                  {t("{{count}} files · {{assigned}}/{{count}} recipients assigned", { count: items.length, assigned: items.length - incompleteCount })}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold text-foreground">
                <span>Imported files</span> ({items.length})
              </h2>
              <p className="text-sm text-muted-foreground">
                Select a file to review and assign its SOA recipient.
              </p>
            </div>
            <div className="divide-y">
              {items.map((item) => {
                const itemClient = clients.find((client) => client.id === item.clientId);
                const isActive = item.id === activeItem?.id;
                return (
                  <div
                    key={item.id}
                    className={`flex w-full items-center gap-2 border-l-4 pr-3 transition-colors ${isActive ? "border-l-primary bg-primary/10 ring-1 ring-inset ring-primary/25" : "border-l-transparent hover:bg-muted/50"}`}
                  >
                    <button
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        setActiveItemId(item.id);
                        setClientPickerOpen(false);
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-4 pl-4 pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      <FileCheck2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {isActive ? <p className="mb-1 text-xs font-semibold text-primary">Currently reviewing</p> : null}
                      <p title={item.data.sourceFileName} className={`truncate ${isActive ? "font-semibold text-primary" : "font-medium text-foreground"}`}>{item.data.sourceFileName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.data.merchantName || t("Unknown merchant")} · {item.data.monthLabel} · {t("{{count}} transactions", { count: item.data.rows.length })}
                      </p>
                    </div>
                    <span className={`max-w-[35%] truncate rounded-full px-2.5 py-1 text-xs font-medium ${itemClient ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                      {itemClient?.name ?? "Needs client"}
                    </span>
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Remove file"
                      className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeItem(item.id);
                      }}
                      disabled={exporting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Transactions" value={data.rows.length.toLocaleString("en-US")} />
            <SummaryCard label="Total combo price" value={formatVnd(data.totals.comboPrice)} />
            <SummaryCard
              label={`${t("Service fee")}${data.serviceFeeRate === null ? "" : ` (${data.serviceFeeRate}%)`}`}
              value={formatVnd(data.totals.serviceFee)}
            />
            <SummaryCard label="Reconciliation amount" value={formatVnd(data.totals.reconciliationAmount)} />
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold text-foreground">SOA recipient</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select the client whose details should appear in the exported SOA.
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientPickerOpen}
                      className="w-full cursor-pointer justify-between font-normal sm:min-w-[280px] lg:w-[320px]"
                      disabled={clientsLoading || !clients.length}
                    >
                      <span className="truncate">
                        {selectedClient?.name ??
                          (clientsLoading ? "Loading clients..." : "Select a client to export")}
                      </span>
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                  >
                    <Command>
                      <CommandInput placeholder="Search clients..." />
                      <CommandList>
                        <CommandEmpty>No clients found.</CommandEmpty>
                        <CommandGroup>
                          {clients.map((client) => (
                            <CommandItem
                              key={client.id}
                              value={[
                                client.id,
                                client.name,
                                client.taxCode,
                                client.address,
                                client.tel,
                                client.email,
                                client.beneficiaryName,
                                client.account,
                                client.bankName,
                              ].join(" ")}
                              onSelect={() => {
                                if (activeItem) assignClient(activeItem.id, client.id);
                                setClientPickerOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={selectedClientId === client.id ? "opacity-100" : "opacity-0"}
                              />
                              <div className="min-w-0">
                                <p className="truncate font-medium">{client.name}</p>
                                {client.taxCode ? (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {client.taxCode}
                                  </p>
                                ) : null}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  className="shrink-0 cursor-pointer"
                  onClick={() => openClientDialog("directory")}
                >
                  <BookUser />
                  Client directory
                </Button>
                <Button
                  className="shrink-0 cursor-pointer"
                  onClick={() => openClientDialog("create")}
                >
                  <Plus className="h-4 w-4" />
                  Add client
                </Button>
              </div>
            </div>

            {selectedClient ? (
              <dl className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">To</dt>
                  <dd
                    className="mt-1 truncate font-medium text-foreground"
                    title={selectedClient.name}
                  >
                    {selectedClient.name}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">Address</dt>
                  <dd
                    className="mt-1 line-clamp-2 break-words text-foreground"
                    title={selectedClient.address}
                  >
                    {selectedClient.address}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Tax code</dt>
                  <dd className="mt-1 text-foreground">{selectedClient.taxCode}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Tel</dt>
                  <dd className="mt-1 text-foreground">{selectedClient.tel || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                  <dd className="mt-1 break-all text-foreground">{selectedClient.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Beneficiary name</dt>
                  <dd className="mt-1 text-foreground">{selectedClient.beneficiaryName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Account</dt>
                  <dd className="mt-1 text-foreground">{selectedClient.account || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Bank name</dt>
                  <dd className="mt-1 text-foreground">{selectedClient.bankName || "—"}</dd>
                </div>
              </dl>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {clients.length
                  ? "Select a client before exporting the SOA."
                  : "No clients yet. Click Add client to create the first profile."}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b px-5 py-4">
              <div>
                <h2 className="font-semibold text-foreground">Data to be added to the SOA</h2>
                <p className="text-sm text-muted-foreground">
                  {t("Period")}: {data.monthLabel}
                  {data.statementId ? ` · ${t("Bill ID")}: ${data.statementId}` : ""}
                  {data.merchantName ? ` · ${data.merchantName}` : ""}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">No.</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Order ID</th>
                    <th className="px-4 py-3">Product ID</th>
                    <th className="px-4 py-3">Product name</th>
                    <th className="px-4 py-3 text-left">Combo price</th>
                    <th className="px-4 py-3 text-left">Service fee</th>
                    <th className="px-4 py-3 text-right">Reconciliation amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => (
                    <tr key={`${row.orderId}-${row.productId}-${index}`} className="border-t">
                      <td className="px-4 py-3 text-left text-muted-foreground">{index + 1}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.reconciledAt}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{row.orderId}</td>
                      <td className="whitespace-nowrap px-4 py-3">{row.productId}</td>
                      <td className="max-w-[280px] px-4 py-3">{row.productName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-left tabular-nums">
                        {formatVnd(row.comboPrice)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-left tabular-nums">
                        {formatVnd(row.serviceFee)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
                        {formatVnd(row.reconciliationAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 bg-amber-50 font-semibold text-amber-950 dark:bg-amber-950/30 dark:text-amber-200">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right">Total</td>
                    <td className="whitespace-nowrap px-4 py-3 text-left tabular-nums">
                      {formatVnd(data.totals.comboPrice)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-left tabular-nums">
                      {formatVnd(data.totals.serviceFee)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {formatVnd(data.totals.reconciliationAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Some files could not be added</p>
            <p className="mt-1 whitespace-pre-line">{error}</p>
          </div>
        </div>
      ) : null}

      <ClientSourceDialog
        open={clientSourceOpen}
        onOpenChange={setClientSourceOpen}
        clients={clients}
        onChanged={async (client) => {
          await refreshClients();
          if (client && activeItem) assignClient(activeItem.id, client.id);
        }}
        mode={clientDialogMode}
      />
    </div>
  );
}
