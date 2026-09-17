"use client";

import { useMemo, useState } from "react";
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
import { useMastersActive } from "@/lib/features/masters/useMasters";
import { supabase } from "@/lib/integrations/supabase/client";
import { extractDigits } from "@/lib/shared/number";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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

export default function CreateTrackingDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const bdList = useMastersActive("bd");

  const [form, setForm] = useState({
    event_date: today,
    customer_name: "",
    branch: 0,
    in_hot_list: 0,
    bd_id: "",
    combo_voucher: false,
    offer_ads: false,
    note: null as string | null,
    info: null as string | null,
  });

  const [branchInput, setBranchInput] = useState("0");
  const [hotListInput, setHotListInput] = useState("0");
  const [isLoading, setIsLoading] = useState(false);

  const isSaveDisabled =
    !form.event_date || !form.customer_name.trim() || !form.bd_id || isLoading;

  async function submit() {
    if (isSaveDisabled) return;

    setIsLoading(true);

    try {
      const { error } = await supabase.from("customer_tracking").insert({
        event_date: form.event_date,
        customer_name: form.customer_name.trim(),
        branch: form.branch,
        in_hot_list: form.in_hot_list,
        bd_id: form.bd_id,
        combo_voucher: form.combo_voucher,
        offer_ads: form.offer_ads,
        note: form.note,
        info: form.info,
      });

      if (error) {
        toast.error("Failed to create customer.");
        return;
      }

      window.dispatchEvent(new Event("customer-tracking-updated"));
      onOpenChange(false);
      onCreated();

      setForm({
        event_date: today,
        customer_name: "",
        branch: 0,
        in_hot_list: 0,
        bd_id: "",
        combo_voucher: false,
        offer_ads: false,
        note: null,
        info: null,
      });
      setBranchInput("0");
      setHotListInput("0");
      toast.success("Customer created successfully.");
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
      <DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b bg-card px-5 py-4 pr-12 sm:px-6 sm:py-5">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Create customer
          </DialogTitle>
          <DialogDescription>
            Add the customer owner, footprint and offer details.
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
              </CustomerFormField>
            </div>
          </CustomerFormSection>

          <CustomerFormSection
            step={2}
            title="Customer"
            description="Identify the customer and capture their current footprint."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <CustomerFormField id="customer-tracking-name" label="Customer name">
                <Input
                  id="customer-tracking-name"
                  className="h-10"
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customer_name: e.target.value }))
                  }
                  placeholder="Enter customer name"
                />
              </CustomerFormField>

              <CustomerFormField id="customer-branches" label="Branches">
                <Input
                  id="customer-branches"
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

              <CustomerFormField id="customer-hot-list" label="In hot list">
                <Input
                  id="customer-hot-list"
                  className="h-10"
                  inputMode="numeric"
                  value={hotListInput}
                  onChange={(e) => {
                    const formatted = formatNumberInput(e.target.value);
                    const parsed = parseNumberInput(e.target.value) ?? 0;
                    setHotListInput(formatted);
                    setForm((f) => ({ ...f, in_hot_list: parsed }));
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
              <CustomerFormField id="customer-note" label="Note" optional>
                <Input
                  id="customer-note"
                  className="h-10"
                  value={form.note ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, note: e.target.value || null }))
                  }
                  placeholder="Enter note"
                />
              </CustomerFormField>

              <CustomerFormField id="customer-info" label="Information" optional>
                <Input
                  id="customer-info"
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
            disabled={isSaveDisabled}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Create customer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
