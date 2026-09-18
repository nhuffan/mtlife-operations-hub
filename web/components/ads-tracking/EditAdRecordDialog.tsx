"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { DatePickerDMY } from "@/components/ui/date-picker-dmy";
import { getAdsTrackingStatus } from "@/lib/features/ads-tracking/adsTracking";

const infoFieldClass =
    "flex h-10 w-full min-w-0 items-center rounded-lg border border-input bg-muted/60 px-3 text-sm text-foreground";

const fieldClass =
    "!h-10 h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm shadow-none transition-colors hover:border-border focus-visible:ring-1 focus-visible:ring-ring";

const labelClass =
    "mb-2 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

type EditAdRecord = {
    id: string;
    customer_name: string;
    point_type_id: string;
    point_type_label: string;
    branch_name: string | null;
    start_date: string | null;
    end_date: string | null;
    note: string | null;
};

export default function EditAdRecordDialog({
    open,
    onOpenChange,
    record,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    record: EditAdRecord | null;
    onSaved: () => void | Promise<void>;
}) {
    if (!record) return null;

    return (
        <EditAdRecordDialogBody
            key={record.id}
            open={open}
            onOpenChange={onOpenChange}
            record={record}
            onSaved={onSaved}
        />
    );
}

function EditAdRecordDialogBody({
    open,
    onOpenChange,
    record,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    record: EditAdRecord;
    onSaved: () => void | Promise<void>;
}) {
    const [startDate, setStartDate] = useState(record.start_date ?? "");
    const { t } = useI18n();
    const [endDate, setEndDate] = useState(record.end_date ?? "");
    const [branchName, setBranchName] = useState(record.branch_name ?? "");
    const [note, setNote] = useState(record.note ?? "");
    const [saving, setSaving] = useState(false);
    const [shouldShowBranchName, setShouldShowBranchName] = useState(
        !!record.branch_name?.trim()
    );

    useEffect(() => {
        if (!open) return;

        let isCancelled = false;

        async function resolveBranchNameVisibility() {
            const hasExistingBranchName = !!record.branch_name?.trim();

            const { data, error } = await supabase
                .from("records")
                .select("id, branch_number")
                .eq("customer_name", record.customer_name)
                .eq("point_type_id", record.point_type_id);

            if (isCancelled) return;

            if (error) {
                setShouldShowBranchName(hasExistingBranchName);
                return;
            }

            const linkedRecords = (data ?? []) as Array<{
                id: string;
                branch_number: number | null;
            }>;

            const hasDuplicatePerformanceRecords = linkedRecords.length >= 2;
            const hasMultipleBranches = linkedRecords.some(
                (item) => Number(item.branch_number ?? 0) > 1
            );

            setShouldShowBranchName(
                hasExistingBranchName ||
                    hasDuplicatePerformanceRecords ||
                    hasMultipleBranches
            );
        }

        resolveBranchNameVisibility();

        return () => {
            isCancelled = true;
        };
    }, [open, record]);

    function renderStatusBadge() {
        if (!record.end_date) {
            return (
                <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    Not Started
                </span>
            );
        }

        const status = getAdsTrackingStatus(record.start_date, record.end_date);

        if (status === "not_started") {
            return (
                <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    Not Started
                </span>
            );
        }

        if (status === "active") {
            return (
                <span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Active
                </span>
            );
        }

        if (status === "expiring_soon") {
            return (
                <span className="inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    Expiring Soon
                </span>
            );
        }

        return (
            <span className="inline-flex rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                Expired
            </span>
        );
    }

    const normalizedInitialNote = (record.note ?? "").trim();
    const normalizedCurrentNote = note.trim();

    const normalizedInitialBranchName = (record.branch_name ?? "").trim();
    const normalizedCurrentBranchName = branchName.trim();

    const hasChanges =
        startDate !== (record.start_date ?? "") ||
        endDate !== (record.end_date ?? "") ||
        normalizedCurrentNote !== normalizedInitialNote ||
        (shouldShowBranchName &&
            normalizedCurrentBranchName !== normalizedInitialBranchName);

    const isDisabled = saving || !hasChanges;

    async function handleSave() {
        if (isDisabled) return;

        setSaving(true);

        const updatePayload: {
            start_date: string | null;
            end_date: string | null;
            note: string | null;
            updated_at: string;
            branch_name?: string | null;
        } = {
            start_date: startDate || null,
            end_date: endDate || null,
            note: normalizedCurrentNote || null,
            updated_at: new Date().toISOString(),
        };

        if (shouldShowBranchName) {
            updatePayload.branch_name = normalizedCurrentBranchName || null;
        }

        const { error } = await supabase
            .from("ad_tracking_records")
            .update(updatePayload)
            .eq("id", record.id);

        setSaving(false);

        if (error) {
            toast.error("Failed to update record.");
            return;
        }

        toast.success("Record updated successfully.");
        onOpenChange(false);
        await onSaved();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-2xl rounded-xl p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                        Edit Ad Record
                    </DialogTitle>

                    <div className="mt-1 flex items-center justify-between gap-3">
                        <DialogDescription className="m-0 text-sm text-muted-foreground">
                            Update ad record for {record.customer_name}.
                        </DialogDescription>

                        <div className="shrink-0">{renderStatusBadge()}</div>
                    </div>
                </DialogHeader>

                <div className="space-y-5 px-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className={labelClass}>Customer</label>
                            <div className={infoFieldClass}>
                                {record.customer_name}
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>Point Type</label>
                            <div className={infoFieldClass}>
                                {record.point_type_label}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className={labelClass}>Start Date</label>
                            <DatePickerDMY
                                value={startDate || undefined}
                                onChange={(iso) => setStartDate(iso ?? "")}
                                placeholder="Select start date"
                                className="!h-10 h-10"
                            />
                        </div>

                        <div>
                            <label className={labelClass}>End Date</label>
                            <DatePickerDMY
                                value={endDate || undefined}
                                onChange={(iso) => setEndDate(iso ?? "")}
                                placeholder="Select end date"
                                className="!h-10 h-10"
                            />
                        </div>
                    </div>

                    {shouldShowBranchName && (
                        <div>
                            <label className={labelClass}>Branch Name</label>
                            <input
                                value={branchName}
                                onChange={(e) => setBranchName(e.target.value)}
                                placeholder="Enter branch name..."
                                className={fieldClass}
                            />
                        </div>
                    )}

                    <div>
                        <label className={labelClass}>Note (optional)</label>
                        <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Add any notes for this ad record..."
                            rows={3}
                            className="min-h-[80px] max-h-[80px] resize-none overflow-y-auto whitespace-pre-wrap break-all"
                        />
                    </div>
                </div>

                <DialogFooter className="border-t px-6 py-4">
                    <div className="flex w-full justify-end gap-3">
                        <Button
                            type="button"
                            variant="ghost"
                            className="cursor-pointer"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                        >
                            {t("Cancel")}
                        </Button>

                        <Button
                            type="button"
                            className="cursor-pointer"
                            onClick={handleSave}
                            disabled={isDisabled}
                        >
                            {t(saving ? "Saving..." : "Save Changes")}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
