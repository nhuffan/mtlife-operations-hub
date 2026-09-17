"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerDMY } from "@/components/ui/date-picker-dmy";
import { useMasters, useMastersActive } from "@/lib/features/masters/useMasters";
import { extractDigits } from "@/lib/shared/number";

import { db } from "@/lib/features/performance/offlineDb";
import { syncPending } from "@/lib/features/performance/syncPending";
import { toast } from "sonner";
import type { RecordRow } from "@/lib/features/performance/types";
import { Loader2 } from "lucide-react";
import { fetchBdMonthlyLevels, getBdLevelsForMonth } from "@/lib/features/performance/bdMonthlyLevels";
import {
  CategoryPicker,
  FormField,
  OptionalDetails,
  RecordFormSection,
} from "./RecordFormUI";

function formatNumberInput(value: string) {
  if (!value) return "";
  const digitsOnly = extractDigits(value);
  if (!digitsOnly) return "";
  return Number(digitsOnly).toLocaleString("en-US");
}

function parseNumberInput(value: string): number | null {
  const digitsOnly = extractDigits(value);
  if (!digitsOnly) return null;
  return Number(digitsOnly);
}

export default function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => Promise<void> | void;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const bdList = useMastersActive("bd");
  const bdIds = bdList.map((item) => item.id);
  const bdIdsKey = bdIds.join(",");
  const { items: levelList } = useMasters("bd_level");
  const { items: customerTypes } = useMasters("customer_type");
  const { items: pointTypes } = useMasters("point_type");
  const [monthlyBdLevels, setMonthlyBdLevels] = useState<Record<string, string>>({});
  const [loadingBdLevels, setLoadingBdLevels] = useState(false);

  const [form, setForm] = useState<RecordRow>({
    id: "",
    event_date: today,
    bd_id: "",
    bd_level_id: "",
    customer_name: "",
    customer_type_id: "",
    point_type_id: "",
    category: "entertainment",
    points: 0,
    money: null,
    package_amount: null,
    branch_number: null,
    note: null,
  });

  const [pointsInput, setPointsInput] = useState("");
  const [moneyInput, setMoneyInput] = useState("");
  const [packageAmountInput, setPackageAmountInput] = useState("");
  const [branchNumberInput, setBranchNumberInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [bdLevelsRefreshTick, setBdLevelsRefreshTick] = useState(0);
  const selectedMonthKey = form.event_date.slice(0, 7);
  const selectedBdLevelLabel =
    levelList.find((item) => item.id === form.bd_level_id)?.label ?? "";

  const isSaveDisabled =
    !form.event_date ||
    !form.bd_id ||
    !form.bd_level_id ||
    !form.customer_name.trim() ||
    !form.customer_type_id ||
    !form.point_type_id ||
    !form.category ||
    loadingBdLevels;

  useEffect(() => {
    const handler = () => {
      setBdLevelsRefreshTick((prev) => prev + 1);
    };

    window.addEventListener("bd-monthly-levels-updated", handler);

    return () => {
      window.removeEventListener("bd-monthly-levels-updated", handler);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMonthlyBdLevels() {
      if (!selectedMonthKey || !form.bd_id) {
        if (!cancelled) {
          setMonthlyBdLevels({});
          setLoadingBdLevels(false);
        }
        return;
      }

      setLoadingBdLevels(true);

      try {
        const monthlyLevelMap = await fetchBdMonthlyLevels([selectedMonthKey]);
        const currentBdIds = bdIdsKey ? bdIdsKey.split(",").filter(Boolean) : [];

        if (!cancelled) {
          setMonthlyBdLevels(
            getBdLevelsForMonth(
              selectedMonthKey,
              currentBdIds,
              monthlyLevelMap
            )
          );
        }
      } catch (error) {
        console.error("Failed to fetch BD monthly levels:", error);
        if (!cancelled) {
          setMonthlyBdLevels({});
        }
      } finally {
        if (!cancelled) {
          setLoadingBdLevels(false);
        }
      }
    }

    void loadMonthlyBdLevels();

    return () => {
      cancelled = true;
    };
  }, [selectedMonthKey, form.bd_id, bdIdsKey, bdLevelsRefreshTick]);

  useEffect(() => {
    if (!form.bd_id) {
      setForm((prev) => (prev.bd_level_id ? { ...prev, bd_level_id: "" } : prev));
      return;
    }

    const mappedLevelId = monthlyBdLevels[form.bd_id] ?? "";

    setForm((prev) =>
      prev.bd_level_id === mappedLevelId ? prev : { ...prev, bd_level_id: mappedLevelId }
    );
  }, [form.bd_id, monthlyBdLevels]);

  async function submit() {
    if (isSaveDisabled || isLoading) return;

    setIsLoading(true);

    try {
      const id = crypto.randomUUID();
      const row: RecordRow = {
        ...form,
        id,
        customer_name: form.customer_name.trim(),
      };

      await db.records.put({
        ...row,
        sync_status: "pending",
        updated_at_local: Date.now(),
      });

      if (navigator.onLine) {
        await syncPending();
      }

      setForm({
        id: "",
        event_date: today,
        bd_id: "",
        bd_level_id: "",
        customer_name: "",
        customer_type_id: "",
        point_type_id: "",
        category: "entertainment",
        points: 0,
        money: null,
        package_amount: null,
        branch_number: null,
        note: null,
      });

      setPointsInput("");
      setMoneyInput("");
      setPackageAmountInput("");
      setBranchNumberInput("");

      onOpenChange(false);
      await onCreated();

      window.dispatchEvent(new Event("records-updated"));
      toast.success("Record created successfully.");
    } catch {
      toast.error("Failed to create record.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isLoading) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b bg-card px-5 py-4 pr-12 sm:px-6 sm:py-5">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Create performance record
          </DialogTitle>
          <DialogDescription>
            Complete the core details first, then add optional context if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto bg-muted/25 px-4 py-4 sm:px-6 sm:py-5">
          <RecordFormSection
            step={1}
            title="Record details"
            description="When the activity happened and who owns it."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField id="record-date" label="Date">
                <DatePickerDMY
                  value={form.event_date}
                  onChange={(iso) =>
                    setForm((f) => ({ ...f, event_date: iso ?? f.event_date }))
                  }
                  placeholder="Select date"
                  className="h-10"
                />
              </FormField>

              <FormField label="BD name">
                <Select
                  value={form.bd_id || undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, bd_id: v }))}
                >
                  <SelectTrigger className="h-10 w-full data-[size=default]:h-10">
                    <SelectValue placeholder="Select BD name" />
                  </SelectTrigger>
                  <SelectContent>
                    {bdList.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField
                label="BD level"
                hint={
                  !loadingBdLevels && form.bd_id && !form.bd_level_id
                    ? `No level set up to ${selectedMonthKey}.`
                    : undefined
                }
              >
                <div
                  className="flex h-10 items-center gap-2.5 rounded-lg bg-muted/60 px-3 text-sm"
                  aria-live="polite"
                >
                  {loadingBdLevels && (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  <span
                    className={
                      selectedBdLevelLabel
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {loadingBdLevels
                      ? "Finding BD level..."
                      : selectedBdLevelLabel ||
                        (form.bd_id ? "No level assigned" : "Available after selecting BD")}
                  </span>
                </div>
              </FormField>
            </div>
          </RecordFormSection>

          <RecordFormSection
            step={2}
            title="Customer"
            description="Identify the customer and how they are classified."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="customer-name" label="Customer name">
                <Input
                  id="customer-name"
                  className="h-10"
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customer_name: e.target.value }))
                  }
                  placeholder="Enter customer name"
                />
              </FormField>

              <FormField label="Customer type">
                <Select
                  value={form.customer_type_id || undefined}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, customer_type_id: v }))
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Select customer type" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </RecordFormSection>

          <RecordFormSection
            step={3}
            title="Performance"
            description="Choose the activity type and record the result."
          >
            <div className="space-y-4">
              <FormField label="Category">
                <CategoryPicker
                  value={form.category}
                  onChange={(category) => setForm((f) => ({ ...f, category }))}
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Point type">
                  <Select
                    value={form.point_type_id || undefined}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, point_type_id: v }))
                    }
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder="Select point type" />
                    </SelectTrigger>
                    <SelectContent>
                      {pointTypes.map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField id="record-points" label="Points">
                  <Input
                    id="record-points"
                    className="h-10"
                    inputMode="numeric"
                    value={pointsInput}
                    onChange={(e) => {
                      const formatted = formatNumberInput(e.target.value);
                      const parsed = parseNumberInput(e.target.value);
                      setPointsInput(formatted);
                      setForm((f) => ({ ...f, points: parsed ?? 0 }));
                    }}
                    placeholder="0"
                  />
                </FormField>
              </div>
            </div>
          </RecordFormSection>

          <OptionalDetails>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="branch-number" label="Branch number" optional>
                <Input
                  id="branch-number"
                  className="h-10"
                  inputMode="numeric"
                  value={branchNumberInput}
                  onChange={(e) => {
                    const formatted = formatNumberInput(e.target.value);
                    const parsed = parseNumberInput(e.target.value);
                    setBranchNumberInput(formatted);
                    setForm((f) => ({ ...f, branch_number: parsed }));
                  }}
                  placeholder="0"
                />
              </FormField>

              <FormField id="package-amount" label="Package amount" optional>
                <Input
                  id="package-amount"
                  className="h-10"
                  inputMode="numeric"
                  value={packageAmountInput}
                  onChange={(e) => {
                    const formatted = formatNumberInput(e.target.value);
                    const parsed = parseNumberInput(e.target.value);
                    setPackageAmountInput(formatted);
                    setForm((f) => ({ ...f, package_amount: parsed }));
                  }}
                  placeholder="0"
                />
              </FormField>

              <FormField id="record-bonus" label="Bonus" optional>
                <Input
                  id="record-bonus"
                  className="h-10"
                  inputMode="numeric"
                  value={moneyInput}
                  onChange={(e) => {
                    const formatted = formatNumberInput(e.target.value);
                    const parsed = parseNumberInput(e.target.value);
                    setMoneyInput(formatted);
                    setForm((f) => ({ ...f, money: parsed }));
                  }}
                  placeholder="0"
                />
              </FormField>

              <FormField id="record-note" label="Note" optional>
                <Input
                  id="record-note"
                  className="h-10"
                  value={form.note ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, note: e.target.value || null }))
                  }
                  placeholder="Add context for your team"
                />
              </FormField>
            </div>
          </OptionalDetails>
        </div>

        <DialogFooter className="border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
          <Button
            className="cursor-pointer sm:min-w-24"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            className="cursor-pointer sm:min-w-32"
            onClick={submit}
            disabled={isSaveDisabled || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Create record"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
