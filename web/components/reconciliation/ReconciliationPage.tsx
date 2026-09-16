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
  FileCheck2,
  Loader2,
  Plus,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
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

const TEMPLATE_URL = "/templates/soa-mt-life-monthly.xlsx";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clients, setClients] = useState<ReconciliationClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSourceOpen, setClientSourceOpen] = useState(false);
  const [clientDialogMode, setClientDialogMode] = useState<"directory" | "create">("directory");

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  const refreshClients = useCallback(async (preferredClient?: ReconciliationClient) => {
    setClientsLoading(true);
    try {
      const nextClients = await listReconciliationClients();
      setClients(nextClients);
      setSelectedClientId((current) => {
        if (preferredClient && nextClients.some((client) => client.id === preferredClient.id)) {
          return preferredClient.id;
        }
        return nextClients.some((client) => client.id === current) ? current : "";
      });
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

  async function readFile(file: File) {
    if (!/\.xlsx?$/i.test(file.name)) {
      setData(null);
      setError("Please select an .xlsx or .xls Excel file.");
      return;
    }

    setReading(true);
    setError("");
    try {
      const parsed = parseReconciliationWorkbook(await file.arrayBuffer(), file.name);
      setData(parsed);
      const matchingClient = clients.find(
        (client) => client.name.trim().toLowerCase() === parsed.merchantName.trim().toLowerCase()
      );
      setSelectedClientId(matchingClient?.id ?? "");
      toast.success(`Loaded ${parsed.rows.length} reconciliation transactions.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not read the reconciliation file.";
      setData(null);
      setError(message);
      toast.error(message);
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void readFile(file);
  }

  async function exportSoa() {
    if (!data || exporting) return;
    if (!selectedClient) {
      toast.error("Please select a client before exporting the SOA.");
      return;
    }

    setExporting(true);
    try {
      const response = await fetch(TEMPLATE_URL);
      if (!response.ok) throw new Error("Could not load the MT LIFE SOA template.");
      const output = await createStatementOfAccount(
        await response.arrayBuffer(),
        data,
        selectedClient
      );
      const url = URL.createObjectURL(output.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = output.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("SOA exported using the MT LIFE template.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not export the SOA file.";
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }

  function reset() {
    setData(null);
    setError("");
    setSelectedClientId("");
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 text-[30px] font-extrabold tracking-tight text-foreground">
          <FileCheck2 className="h-7 w-7 text-primary" />
          Reconciliation Management
        </h1>

        <div className="flex flex-wrap gap-2">
          {!data ? (
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
          {data ? (
            <>
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={reset}
                disabled={exporting}
              >
                <RotateCcw />
                Choose another file
              </Button>
              <Button
                className="cursor-pointer"
                onClick={() => void exportSoa()}
                disabled={exporting || !selectedClient}
              >
                {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                {exporting ? "Exporting..." : "Export SOA"}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {!data ? (
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
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          {reading ? (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="mt-4 font-semibold">Reading reconciliation file...</p>
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-primary/10 p-4 text-primary">
                <UploadCloud className="h-10 w-10" />
              </div>
              <p className="mt-5 text-lg font-semibold text-foreground">
                Drag and drop the reconciliation file here
              </p>
              <p className="mt-1 text-sm text-muted-foreground">or click to select an Excel file</p>
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
                <p className="font-semibold">Data is valid and ready to export</p>
                <p className="mt-1 truncate text-sm opacity-90">{data.sourceFileName}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Transactions" value={data.rows.length.toLocaleString("en-US")} />
            <SummaryCard label="Total combo price" value={formatVnd(data.totals.comboPrice)} />
            <SummaryCard
              label={`Service fee${data.serviceFeeRate === null ? "" : ` (${data.serviceFeeRate}%)`}`}
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
                                setSelectedClientId(client.id);
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
                  Period {data.monthLabel}
                  {data.statementId ? ` · Bill ID ${data.statementId}` : ""}
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
            <p className="font-semibold">Could not read the file</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      <ClientSourceDialog
        open={clientSourceOpen}
        onOpenChange={setClientSourceOpen}
        clients={clients}
        onChanged={refreshClients}
        mode={clientDialogMode}
      />
    </div>
  );
}
