"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";

import {
  type FormEvent,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Check, ChevronDown, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TransferFormSection } from "@/components/merchant-transfers/TransferFormUI";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createReconciliationClient,
  deleteReconciliationClient,
  updateReconciliationClient,
  type ReconciliationClient,
  type ReconciliationClientInput,
} from "@/lib/features/reconciliation/clients";
import { useVietnamBanks } from "@/lib/features/banks/useVietnamBanks";
import { extractDigits } from "@/lib/shared/number";

const bankSelectClass =
  "!h-10 h-10 w-full cursor-pointer appearance-none rounded-md border border-input bg-transparent px-3 py-2 pr-10 text-sm font-normal shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

const EMPTY_FORM: ReconciliationClientInput = {
  name: "",
  address: "",
  taxCode: "",
  tel: "",
  email: "",
  beneficiaryName: "",
  account: "",
  bankName: "",
};

function ClientFormField({
  id,
  label,
  optional = false,
  children,
  className = "",
}: {
  id: string;
  label: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional ? (
          <span className="text-[11px] font-medium text-muted-foreground">Optional</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function getClientBankSummary(client: ReconciliationClient) {
  return [client.beneficiaryName, client.account, client.bankName]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" · ");
}

interface ClientSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ReconciliationClient[];
  onChanged: (client?: ReconciliationClient) => Promise<void> | void;
  mode: "directory" | "create" | "edit";
  initialClient?: ReconciliationClient;
}

export default function ClientSourceDialog({
  open,
  onOpenChange,
  clients,
  onChanged,
  mode,
  initialClient,
}: ClientSourceDialogProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<ReconciliationClientInput>(EMPTY_FORM);
  const banks = useVietnamBanks();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bankSelection, setBankSelection] = useState("");
  const [customBankName, setCustomBankName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ReconciliationClient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const hasRequiredFields = [form.name, form.address, form.taxCode].every(
    (value) => Boolean(value.trim())
  );

  const filteredClients = useMemo(() => {
    const query = deferredSearchQuery.trim().toLocaleLowerCase("vi");
    if (!query) return clients;
    return clients.filter((client) =>
      [
        client.name,
        client.address,
        client.taxCode,
        client.tel,
        client.email,
        client.beneficiaryName,
        client.account,
        client.bankName,
      ].some((value) => value.toLocaleLowerCase("vi").includes(query))
    );
  }, [clients, deferredSearchQuery]);

  const hasEditChanges = useMemo(() => {
    if (!editingId) return false;
    const client = clients.find((item) => item.id === editingId);
    if (!client) return false;

    return (
      form.name.trim() !== client.name ||
      form.address.trim() !== client.address ||
      form.taxCode.trim() !== client.taxCode ||
      form.tel.trim() !== client.tel ||
      form.email.trim() !== client.email ||
      form.beneficiaryName.trim() !== client.beneficiaryName ||
      form.account.trim() !== client.account ||
      form.bankName.trim() !== client.bankName
    );
  }, [clients, editingId, form]);

  useEffect(() => {
    if (open) {
      setForm(initialClient && mode === "edit" ? initialClient : EMPTY_FORM);
      setEditingId(mode === "edit" ? initialClient?.id ?? null : null);
      setSearchQuery("");
      setBankSelection(mode === "edit" ? initialClient?.bankName ?? "" : "");
      setCustomBankName("");
    }
  }, [open, mode, initialClient]);

  function updateField(field: keyof ReconciliationClientInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(client: ReconciliationClient) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      address: client.address,
      taxCode: client.taxCode,
      tel: client.tel,
      email: client.email,
      beneficiaryName: client.beneficiaryName,
      account: client.account,
      bankName: client.bankName,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setBankSelection("");
    setCustomBankName("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasRequiredFields) {
      toast.error(t("Enter the client name, address, and tax code."));
      return;
    }

    if (editingId && !hasEditChanges) return;
    setSaving(true);
    try {
      const saved = editingId
        ? await updateReconciliationClient(editingId, form)
        : await createReconciliationClient(form);
      await onChanged(saved);
      toast.success(t(editingId ? "Client updated." : "Client added."));
      resetForm();
      if (mode !== "directory") onOpenChange(false);
    } catch (caught) {
      const error = caught as { code?: string; message?: string };
      toast.error(t(error.code === "23505"
        ? "A client with this name already exists."
        : "Could not save client details. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteReconciliationClient(deleteTarget.id);
      await onChanged();
      toast.success(t("Client deleted."));
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) resetForm();
    } catch {
      toast.error(t("Could not delete the client."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (saving) return;
          onOpenChange(nextOpen);
        }}
      >
        <DialogContent
          showCloseButton={mode !== "directory"}
          className={
            mode === "directory"
              ? "h-[520px] max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:w-[880px] sm:max-w-4xl"
              : "max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl"
          }
        >
          {mode !== "directory" ? (
            <DialogHeader className="border-b bg-card px-5 py-4 pr-12 sm:px-6 sm:py-5">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                {t(mode === "edit" ? "Edit client" : "Add client")}
              </DialogTitle>
              <DialogDescription>
                Add recipient details to the shared client source.
              </DialogDescription>
            </DialogHeader>
          ) : (
            <DialogHeader className="h-0 overflow-hidden p-0">
              <DialogTitle className="sr-only">Client directory</DialogTitle>
              <DialogDescription className="sr-only">
                Clients available when exporting an SOA.
              </DialogDescription>
            </DialogHeader>
          )}

          <div className="min-h-0 space-y-4 overflow-y-auto bg-muted/25 px-4 py-4 sm:px-6 sm:py-5">
            {mode !== "directory" ? (
              <form
                id="reconciliation-client-form"
                onSubmit={submit}
                className="space-y-4 p-1 sm:p-0"
              >
                <TransferFormSection
                  step={1}
                  title="Client information"
                  description="Enter the client's billing and contact details."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ClientFormField
                      id="reconciliation-client-name"
                      label="Client name"
                      className="sm:col-span-2"
                    >
                      <Input
                        id="reconciliation-client-name"
                        className="h-10"
                        value={form.name}
                        onChange={(event) => updateField("name", event.target.value)}
                        placeholder="Example: ABC Company"
                        required
                      />
                    </ClientFormField>
                    <ClientFormField
                      id="reconciliation-client-address"
                      label="Address"
                    >
                      <Input
                        id="reconciliation-client-address"
                        className="h-10"
                        value={form.address}
                        onChange={(event) => updateField("address", event.target.value)}
                        placeholder="Example: 123 Nguyen Hue Street, Ho Chi Minh City"
                        required
                      />
                    </ClientFormField>
                    <ClientFormField id="reconciliation-client-tax-code" label="Tax code">
                      <Input
                        id="reconciliation-client-tax-code"
                        className="h-10"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={form.taxCode}
                        onChange={(event) =>
                          updateField("taxCode", extractDigits(event.target.value))
                        }
                        placeholder="Example: 0312345678"
                        required
                      />
                    </ClientFormField>
                    <ClientFormField id="reconciliation-client-tel" label="Tel" optional>
                      <Input
                        id="reconciliation-client-tel"
                        className="h-10"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={form.tel}
                        onChange={(event) =>
                          updateField("tel", extractDigits(event.target.value))
                        }
                        placeholder="Example: 0901234567"
                      />
                    </ClientFormField>
                    <ClientFormField
                      id="reconciliation-client-email"
                      label="Email"
                      optional
                    >
                      <Input
                        id="reconciliation-client-email"
                        type="email"
                        className="h-10"
                        value={form.email}
                        onChange={(event) => updateField("email", event.target.value)}
                        placeholder="Example: billing@company.com"
                      />
                    </ClientFormField>
                  </div>
                </TransferFormSection>

                <TransferFormSection
                  step={2}
                  title="Bank information"
                  description="Add bank details when available."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ClientFormField
                      id="reconciliation-client-beneficiary-name"
                      label="Beneficiary name"
                      optional
                      className="sm:col-span-2"
                    >
                      <Input
                        id="reconciliation-client-beneficiary-name"
                        className="h-10"
                        value={form.beneficiaryName}
                        onChange={(event) => updateField("beneficiaryName", event.target.value)}
                        placeholder="Example: NGUYEN VAN A"
                      />
                    </ClientFormField>
                    <ClientFormField
                      id="reconciliation-client-bank-name"
                      label="Bank name"
                      optional
                    >
                      <div className="relative">
                        <select
                          id="reconciliation-client-bank-name"
                          value={bankSelection}
                          onChange={(event) => {
                            const nextBank = event.target.value;
                            setBankSelection(nextBank);
                            if (nextBank === "__other__") {
                              updateField("bankName", customBankName);
                            } else {
                              setCustomBankName("");
                              updateField("bankName", nextBank);
                            }
                          }}
                          className={bankSelectClass}
                        >
                          <option value="">No bank selected</option>
                          {bankSelection &&
                          bankSelection !== "__other__" &&
                          !banks.includes(bankSelection) ? (
                            <option value={bankSelection}>{bankSelection}</option>
                          ) : null}
                          {banks.map((bank) => (
                            <option key={bank} value={bank}>
                              {bank}
                            </option>
                          ))}
                          <option value="__other__">Other bank...</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" />
                      </div>
                      {bankSelection === "__other__" ? (
                        <Input
                          value={customBankName}
                          onChange={(event) => {
                            setCustomBankName(event.target.value);
                            updateField("bankName", event.target.value);
                          }}
                          placeholder="Enter bank name..."
                          className="mt-2 h-10"
                        />
                      ) : null}
                    </ClientFormField>
                    <ClientFormField
                      id="reconciliation-client-account"
                      label="Account number"
                      optional
                    >
                      <Input
                        id="reconciliation-client-account"
                        className="h-10"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={form.account}
                        onChange={(event) =>
                          updateField("account", extractDigits(event.target.value))
                        }
                        placeholder="Example: 63318886886"
                      />
                    </ClientFormField>
                  </div>
                </TransferFormSection>
              </form>
            ) : null}

            {mode === "directory" ? (
              <section className="flex h-full min-h-0 flex-col">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-semibold">{t("Clients")} ({clients.length})</h3>
                  <div className="relative sm:w-80">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.target.value);
                        if (editingId) resetForm();
                      }}
                      placeholder="Search client or bank details..."
                      className="h-10 pl-9"
                    />
                  </div>
                </div>
                {filteredClients.length ? (
                  <div
                    className={`min-h-0 flex-1 rounded-xl border ${
                      filteredClients.length > 3
                        ? "overflow-y-scroll [scrollbar-gutter:stable]"
                        : "overflow-y-auto"
                    }`}
                  >
                    {filteredClients.map((client) =>
                      editingId === client.id ? (
                        <form
                          key={client.id}
                          id={`edit-client-${client.id}`}
                          onSubmit={submit}
                          className="flex h-[118px] items-center gap-2 border-b bg-muted/30 p-2"
                        >
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex min-w-0 gap-2">
                              <Input
                                id="edit-client-name"
                                aria-label="Client name"
                                className="h-8 min-w-0 flex-1"
                                value={form.name}
                                onChange={(event) => updateField("name", event.target.value)}
                                placeholder="Client name"
                                required
                              />
                              <Input
                                id="edit-client-tax-code"
                                aria-label="Tax code"
                                className="h-8 w-36 shrink-0 font-mono sm:w-44"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={form.taxCode}
                                onChange={(event) =>
                                  updateField("taxCode", extractDigits(event.target.value))
                                }
                                placeholder="Tax code"
                                required
                              />
                            </div>
                            <div className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
                              <Input
                                id="edit-client-address"
                                aria-label="Address"
                                className="h-8 min-w-0"
                                value={form.address}
                                onChange={(event) => updateField("address", event.target.value)}
                                placeholder="Address"
                                required
                              />
                              <Input
                                id="edit-client-tel"
                                aria-label="Tel"
                                className="h-8 min-w-0"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={form.tel}
                                onChange={(event) =>
                                  updateField("tel", extractDigits(event.target.value))
                                }
                                placeholder="Phone number"
                              />
                              <Input
                                id="edit-client-email"
                                aria-label="Email"
                                type="email"
                                className="h-8 min-w-0"
                                value={form.email}
                                onChange={(event) => updateField("email", event.target.value)}
                                placeholder="Email"
                              />
                            </div>
                            <div className="grid min-w-0 grid-cols-3 gap-2">
                              <Input
                                id="edit-client-beneficiary-name"
                                aria-label="Beneficiary name"
                                className="h-8 min-w-0"
                                value={form.beneficiaryName}
                                onChange={(event) => updateField("beneficiaryName", event.target.value)}
                                placeholder="Beneficiary name"
                              />
                              <Input
                                id="edit-client-account"
                                aria-label="Account"
                                className="h-8 min-w-0"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={form.account}
                                onChange={(event) =>
                                  updateField("account", extractDigits(event.target.value))
                                }
                                placeholder="Account"
                              />
                              <Input
                                id="edit-client-bank-name"
                                aria-label="Bank name"
                                className="h-8 min-w-0"
                                value={form.bankName}
                                onChange={(event) => updateField("bankName", event.target.value)}
                                placeholder="Bank name"
                              />
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="cursor-pointer"
                              onClick={resetForm}
                              disabled={saving}
                            >
                              <X />
                              <span className="sr-only">Cancel editing</span>
                            </Button>
                            <Button
                              type="submit"
                              size="icon-sm"
                              className="cursor-pointer disabled:cursor-not-allowed"
                              disabled={saving || !hasRequiredFields || !hasEditChanges}
                            >
                              {saving ? <Loader2 className="animate-spin" /> : <Check />}
                              <span className="sr-only">Save changes</span>
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div
                          key={client.id}
                          className="flex items-center gap-3 border-b p-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <p
                                className="min-w-0 flex-1 truncate font-medium text-foreground"
                                title={client.name}
                              >
                                {client.name}
                              </p>
                              <span className="shrink-0 whitespace-nowrap rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                                Tax ID: {client.taxCode}
                              </span>
                            </div>
                            <p className="mt-2 truncate text-xs text-muted-foreground">
                              {[client.address, client.tel, client.email]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {getClientBankSummary(client) ? (
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {getClientBankSummary(client)}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center justify-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="cursor-pointer"
                              onClick={() => startEdit(client)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                              <span className="sr-only">Edit {client.name}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="cursor-pointer"
                              onClick={() => setDeleteTarget(client)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                              <span className="sr-only">Delete {client.name}</span>
                            </Button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {clients.length
                      ? "No matching clients found."
                      : "There are no clients in the source yet."}
                  </div>
                )}
              </section>
            ) : null}
          </div>

          <DialogFooter className="border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
            {mode !== "directory" ? (
              <Button
                type="submit"
                form="reconciliation-client-form"
                className="h-10 cursor-pointer rounded-lg px-6 disabled:cursor-not-allowed sm:min-w-36"
                disabled={saving || !hasRequiredFields || Boolean(editingId && !hasEditChanges)}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                {t(saving ? "Saving..." : mode === "edit" ? "Save changes" : "Add to source")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="h-10 cursor-pointer rounded-lg px-5 sm:min-w-24"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) setDeleteTarget(null);
        }}
        title="Delete client?"
        description={t("{{name}} will be removed from the client directory.", { name: deleteTarget?.name ?? t("This client") })}
        onConfirm={() => void confirmDelete()}
        loading={deleting}
      />
    </>
  );
}
