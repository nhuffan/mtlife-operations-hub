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
import { useMasters } from "@/lib/features/masters/useMasters";
import { supabase } from "@/lib/integrations/supabase/client";
import { extractDigits } from "@/lib/shared/number";
import { toast } from "sonner";
import type { TrackingRecordVM } from "../types";
import { Loader2 } from "lucide-react";
import { DatePickerDMY } from "@/components/ui/date-picker-dmy";
import {
    CustomerFormField,
    CustomerFormSection,
    AdvertisingPicker,
    VoucherPicker,
} from "./CustomerFormUI";

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

export default function EditTrackingDialog({
    open,
    onOpenChange,
    record,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    record: TrackingRecordVM | null;
    onSaved: () => Promise<void> | void;
}) {
    const { items: allBdList } = useMasters("bd");
    const bdList = useMemo(
        () => allBdList.filter((item) => item.is_active),
        [allBdList]
    );

    const [form, setForm] = useState({
        event_date: "",
        customer_name: "",
        branch: 0,
        bd_id: "",
        combo_voucher: false,
        offer_ads: false,
        note: null as string | null,
        info: null as string | null,
    });

    const [branchInput, setBranchInput] = useState("0");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!open || !record) return;

        setForm({
            event_date: record.event_date ?? "",
            customer_name: record.customer_name ?? "",
            branch: record.branch ?? 0,
            bd_id: record.bd_id ?? "",
            combo_voucher: record.combo_voucher ?? false,
            offer_ads: record.offer_ads ?? false,
            note: record.note ?? null,
            info: record.info ?? null,
        });

        setBranchInput(
            record.branch !== null && record.branch !== undefined
                ? Number(record.branch).toLocaleString("en-US")
                : "0"
        );
    }, [open, record]);

    if (!record) return null;

    const currentRecord = record;

    const normalizedCustomerName = form.customer_name.trim();
    const normalizedNote = (form.note ?? "").trim();
    const normalizedInfo = (form.info ?? "").trim();

    const originalCustomerName = (currentRecord.customer_name ?? "").trim();
    const originalBranch = currentRecord.branch ?? 0;
    const originalBdId = currentRecord.bd_id ?? "";
    const originalComboVoucher = currentRecord.combo_voucher ?? false;
    const originalOfferAds = currentRecord.offer_ads ?? false;
    const originalNote = (currentRecord.note ?? "").trim();
    const originalInfo = (currentRecord.info ?? "").trim();
    const originalEventDate = currentRecord.event_date ?? "";
    const selectedBdLabel =
        allBdList.find((item) => item.id === form.bd_id)?.label ?? "Unknown BD";

    const hasChanges =
        normalizedCustomerName !== originalCustomerName ||
        form.event_date !== originalEventDate ||
        form.branch !== originalBranch ||
        form.bd_id !== originalBdId ||
        form.combo_voucher !== originalComboVoucher ||
        form.offer_ads !== originalOfferAds ||
        normalizedNote !== originalNote ||
        normalizedInfo !== originalInfo;

    const isSaveDisabled =
        !normalizedCustomerName || !form.bd_id || !hasChanges || isLoading;

    async function handleSave() {
        if (isSaveDisabled) return;

        setIsLoading(true);

        try {
            const { error } = await supabase
                .from("customer_tracking")
                .update({
                    event_date: form.event_date,
                    customer_name: normalizedCustomerName,
                    branch: form.branch,
                    bd_id: form.bd_id,
                    combo_voucher: form.combo_voucher,
                    offer_ads: form.offer_ads,
                    note: normalizedNote || null,
                    info: normalizedInfo || null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", currentRecord.id);

            if (error) {
                toast.error("Failed to update record.");
                return;
            }

            window.dispatchEvent(new Event("customer-tracking-updated"));
            onOpenChange(false);
            await onSaved();
            toast.success("Record updated successfully.");
        } finally {
            setIsLoading(false);
        }
    }

    function handleDialogOpenChange(nextOpen: boolean) {
        if (isLoading) return;
        onOpenChange(nextOpen);
    }

    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogContent
                className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogHeader className="border-b bg-card px-5 py-4 pr-12 sm:px-6 sm:py-5">
                    <DialogTitle className="text-xl font-semibold tracking-tight">
                        Edit customer
                    </DialogTitle>
                    <DialogDescription>
                        Update the customer owner, footprint and offer details.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 space-y-4 overflow-y-auto bg-muted/25 px-4 py-4 sm:px-6 sm:py-5">
                    <CustomerFormSection
                        step={1}
                        title="Record details"
                        description="When the customer was added and who owns the relationship."
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <CustomerFormField label="Date">
                                <DatePickerDMY
                                    value={form.event_date}
                                    onChange={(iso) =>
                                        setForm((f) => ({ ...f, event_date: iso ?? f.event_date }))
                                    }
                                    placeholder="Select date"
                                    className="h-10"
                                />
                            </CustomerFormField>

                            <CustomerFormField label="BD name">
                                <Select
                                    value={form.bd_id || undefined}
                                    onValueChange={(v) =>
                                        setForm((f) => ({ ...f, bd_id: v }))
                                    }
                                >
                                    <SelectTrigger className="h-10 w-full data-[size=default]:h-10">
                                        <SelectValue placeholder="Select BD name">
                                            {selectedBdLabel}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {bdList.map((x) => (
                                            <SelectItem key={x.id} value={x.id}>
                                                {x.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </CustomerFormField>
                        </div>
                    </CustomerFormSection>

                    <CustomerFormSection
                        step={2}
                        title="Customer"
                        description="Identify the customer and capture their current footprint."
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <CustomerFormField id="edit-customer-name" label="Customer name">
                                <Input
                                    id="edit-customer-name"
                                    className="h-10"
                                    value={form.customer_name}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, customer_name: e.target.value }))
                                    }
                                    placeholder="Enter customer name"
                                />
                            </CustomerFormField>

                            <CustomerFormField id="edit-customer-branches" label="Branches">
                                <Input
                                    id="edit-customer-branches"
                                    className="h-10"
                                    inputMode="numeric"
                                    value={branchInput}
                                    onChange={(e) => {
                                        const formatted = formatNumberInput(e.target.value);
                                        const parsed = parseNumberInput(e.target.value) ?? 0;
                                        setBranchInput(formatted);
                                        setForm((f) => ({ ...f, branch: parsed }));
                                    }}
                                    placeholder="0"
                                />
                            </CustomerFormField>
                        </div>
                    </CustomerFormSection>

                    <CustomerFormSection
                        step={3}
                        title="Offer"
                        description="Indicate whether this customer uses a combo, voucher or advertising."
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <CustomerFormField label="Combo/Voucher">
                                <VoucherPicker
                                    value={form.combo_voucher}
                                    onChange={(comboVoucher) =>
                                        setForm((f) => ({ ...f, combo_voucher: comboVoucher }))
                                    }
                                />
                            </CustomerFormField>

                            <CustomerFormField label="Advertising">
                                <AdvertisingPicker
                                    value={form.offer_ads}
                                    onChange={(offerAds) =>
                                        setForm((f) => ({ ...f, offer_ads: offerAds }))
                                    }
                                />
                            </CustomerFormField>
                        </div>
                    </CustomerFormSection>

                    <CustomerFormSection
                        step={4}
                        title="Optional details"
                        description="Add any context that will help the team follow up."
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <CustomerFormField id="edit-customer-note" label="Note" optional>
                                <Input
                                    id="edit-customer-note"
                                    className="h-10"
                                    value={form.note ?? ""}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, note: e.target.value || null }))
                                    }
                                    placeholder="Enter note"
                                />
                            </CustomerFormField>

                            <CustomerFormField
                                id="edit-customer-info"
                                label="Information"
                                optional
                            >
                                <Input
                                    id="edit-customer-info"
                                    className="h-10"
                                    value={form.info ?? ""}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, info: e.target.value || null }))
                                    }
                                    placeholder="Enter information"
                                />
                            </CustomerFormField>
                        </div>
                    </CustomerFormSection>
                </div>

                <DialogFooter className="border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
                    <Button
                        variant="secondary"
                        className="cursor-pointer sm:min-w-24"
                        onClick={() => handleDialogOpenChange(false)}
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
