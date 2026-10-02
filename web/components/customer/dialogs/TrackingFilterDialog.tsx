"use client";

import { useState } from "react";
import BdNameFilter from "@/components/shared/BdNameFilter";
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
import type { TrackingFilters } from "../types";
import { useMastersActive } from "@/lib/features/masters/useMasters";

export default function TrackingFilterDialog({
  open,
  onOpenChange,
  filters,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: TrackingFilters;
  onApply: (filters: TrackingFilters) => void;
}) {
  const [draft, setDraft] = useState<TrackingFilters>(filters);
  const bdList = useMastersActive("bd");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Filter Customer
          </DialogTitle>
          <DialogDescription className="sr-only">
            Choose filters for customer records, then apply your selection.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">From</p>
            <Input
              type="date"
              value={draft.from ?? ""}
              onChange={(e) =>
                setDraft((f) => ({ ...f, from: e.target.value || undefined }))
              }
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">To</p>
            <Input
              type="date"
              value={draft.to ?? ""}
              onChange={(e) =>
                setDraft((f) => ({ ...f, to: e.target.value || undefined }))
              }
            />
          </div>

          <div className="col-span-2">
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Customer Name
            </p>
            <Input
              value={draft.customer_name ?? ""}
              onChange={(e) =>
                setDraft((f) => ({
                  ...f,
                  customer_name: e.target.value || undefined,
                }))
              }
              placeholder="Enter customer name"
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">BD Name</p>
            <BdNameFilter
              options={bdList}
              value={draft.bd_ids}
              onChange={(bd_ids) => setDraft((current) => ({ ...current, bd_ids }))}
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Combo/Voucher
            </p>
            <Select
              value={draft.combo_voucher ?? "all"}
              onValueChange={(v) =>
                setDraft((f) => ({
                  ...f,
                  combo_voucher: v as "all" | "yes" | "none",
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select combo/voucher" />
              </SelectTrigger>
              <SelectContent>   
                <SelectItem value="all">All</SelectItem>
                <SelectItem
                  value="yes"
                  className="font-semibold text-green-700 focus:bg-green-50 focus:text-green-700"
                >
                  <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                    YES
                  </span>
                </SelectItem>
                <SelectItem value="none">—</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Advertising
            </p>
            <Select
              value={draft.offer_ads ?? "all"}
              onValueChange={(v) =>
                setDraft((f) => ({
                  ...f,
                  offer_ads: v as "all" | "yes" | "none",
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select advertising" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem
                  value="yes"
                  className="font-semibold text-green-700 focus:bg-green-50 focus:text-green-700"
                >
                  <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                    YES
                  </span>
                </SelectItem>
                <SelectItem value="none">—</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            className="cursor-pointer"
            onClick={() => {
              onApply({});
              onOpenChange(false);
            }}
          >
            Reset
          </Button>

          <Button
            className="cursor-pointer"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
