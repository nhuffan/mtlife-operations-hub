"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/features/performance/offlineDb";
import { syncPending } from "@/lib/features/performance/syncPending";
import { toast } from "sonner";
import type { RecordVM } from "../RecordsPage";
import type { LocalRecord } from "@/lib/features/performance/offlineDb";
import { Loader2 } from "lucide-react";
import { formatDMY } from "@/lib/shared/date";
import { extractDigits } from "@/lib/shared/number";
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

export default function EditRecordDialog({
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  record: RecordVM | null;
  onSaved: () => Promise<void> | void;
}) {
  const [category, setCategory] = useState<"entertainment" | "restaurant">(
    "restaurant"
  );
  const [pointsInput, setPointsInput] = useState("");
  const [moneyInput, setMoneyInput] = useState("");
  const [packageAmountInput, setPackageAmountInput] = useState("");
  const [branchNumberInput, setBranchNumberInput] = useState("");
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function resetFormFromRecord(target: RecordVM | null) {
    if (!target) {
      setCategory("entertainment");
      setPointsInput("");
      setMoneyInput("");
      setPackageAmountInput("");
      setBranchNumberInput("");
      setNote("");
      return;
    }

    setCategory(
      (target.category as "entertainment" | "restaurant" | undefined) ??
        "entertainment"
    );

    setPointsInput(
      target.points !== null && target.points !== undefined
        ? Number(target.points).toLocaleString("en-US")
        : ""
    );

    setMoneyInput(
      target.money !== null && target.money !== undefined
        ? Number(target.money).toLocaleString("en-US")
        : ""
    );

    setPackageAmountInput(
      target.package_amount !== null && target.package_amount !== undefined
        ? Number(target.package_amount).toLocaleString("en-US")
        : ""
    );

    setBranchNumberInput(
      target.branch_number !== null && target.branch_number !== undefined
        ? Number(target.branch_number).toLocaleString("en-US")
        : ""
    );

    setNote(target.note ?? "");
  }

  useEffect(() => {
    if (open) {
      resetFormFromRecord(record);
    }
  }, [open, record]);

  const parsedPoints = parseNumberInput(pointsInput) ?? 0;
  const parsedMoney = parseNumberInput(moneyInput);
  const parsedPackageAmount = parseNumberInput(packageAmountInput);
  const parsedBranchNumber = parseNumberInput(branchNumberInput);

  const originalCategory =
    (record?.category as "entertainment" | "restaurant" | undefined) ??
    "entertainment";
  const originalPoints = record?.points ?? 0;
  const originalMoney = record?.money ?? null;
  const originalPackageAmount = record?.package_amount ?? null;
  const originalBranchNumber = record?.branch_number ?? null;
  const originalNote = record?.note ?? "";

  const hasChanges =
    !!record &&
    (category !== originalCategory ||
      parsedPoints !== originalPoints ||
      parsedMoney !== originalMoney ||
      parsedPackageAmount !== originalPackageAmount ||
      parsedBranchNumber !== originalBranchNumber ||
      note !== originalNote);

  const isSaveDisabled =
    !record || !category || !hasChanges || isLoading;

  async function handleSave() {
    if (!record || isSaveDisabled) return;

    setIsLoading(true);

    try {
      const existing = await db.records.get(record.id);

      const baseRecord: LocalRecord = existing
        ? existing
        : {
            id: record.id,
            event_date: record.event_date,
            bd_id: record.bd_id,
            bd_level_id: record.bd_level_id,
            customer_name: record.customer_name,
            customer_type_id: record.customer_type_id,
            point_type_id: record.point_type_id,
            category: originalCategory,
            points: record.points,
            money: record.money,
            package_amount: record.package_amount,
            branch_number: record.branch_number ?? null,
            note: record.note,
            created_at: record.created_at,
            updated_at: record.updated_at,
            sync_status: "pending",
            updated_at_local: Date.now(),
          };

      const updatedRecord: LocalRecord = {
        ...baseRecord,
        category,
        points: parsedPoints,
        money: parsedMoney,
        package_amount: parsedPackageAmount,
        branch_number: parsedBranchNumber,
        note: note || null,
        sync_status: "pending",
        updated_at_local: Date.now(),
        last_error: undefined,
      };

      await db.records.put(updatedRecord);

      if (navigator.onLine) {
        await syncPending();
      }

      onOpenChange(false);
      await onSaved();

      window.dispatchEvent(new Event("records-updated"));
      toast.success("Record updated successfully.");
    } catch {
      toast.error("Failed to update record.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isLoading) return;

    if (!nextOpen) {
      resetFormFromRecord(record);
    }

    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b bg-card px-5 py-4 pr-12 sm:px-6 sm:py-5">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Edit performance record
          </DialogTitle>
          <DialogDescription>
            Update the result while keeping the original record context visible.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto bg-muted/25 px-4 py-4 sm:px-6 sm:py-5">
          {record && (
            <div className="grid gap-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {record.customer_name}
                </p>
              </div>
              <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {formatDMY(record.event_date)}
              </span>
            </div>
          )}

          <RecordFormSection
            step={1}
            title="Performance"
            description="Update the activity category and points earned."
          >
            <div className="space-y-4">
              <FormField label="Category">
                <CategoryPicker value={category} onChange={setCategory} />
              </FormField>
              <FormField id="edit-points" label="Points">
                <Input
                  id="edit-points"
                  className="h-10"
                  inputMode="numeric"
                  value={pointsInput}
                  onChange={(e) =>
                    setPointsInput(formatNumberInput(e.target.value))
                  }
                  placeholder="0"
                />
              </FormField>
            </div>
          </RecordFormSection>

          <OptionalDetails>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="edit-package-amount" label="Package amount" optional>
                <Input
                  id="edit-package-amount"
                  className="h-10"
                  inputMode="numeric"
                  value={packageAmountInput}
                  onChange={(e) =>
                    setPackageAmountInput(formatNumberInput(e.target.value))
                  }
                  placeholder="0"
                />
              </FormField>

              <FormField id="edit-branch-number" label="Branch number" optional>
                <Input
                  id="edit-branch-number"
                  className="h-10"
                  inputMode="numeric"
                  value={branchNumberInput}
                  onChange={(e) =>
                    setBranchNumberInput(formatNumberInput(e.target.value))
                  }
                  placeholder="Enter branch number"
                />
              </FormField>

              <FormField id="edit-bonus" label="Bonus" optional>
                <Input
                  id="edit-bonus"
                  className="h-10"
                  inputMode="numeric"
                  value={moneyInput}
                  onChange={(e) =>
                    setMoneyInput(formatNumberInput(e.target.value))
                  }
                  placeholder="0"
                />
              </FormField>

              <FormField id="edit-note" label="Note" optional>
                <Input
                  id="edit-note"
                  className="h-10"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add context for your team"
                />
              </FormField>
            </div>
          </OptionalDetails>
        </div>

        <DialogFooter className="border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
          <Button
            variant="secondary"
            className="cursor-pointer sm:min-w-24"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>

          <Button
            className="cursor-pointer sm:min-w-32"
            onClick={handleSave}
            disabled={isSaveDisabled}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
