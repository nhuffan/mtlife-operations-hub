"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, Loader2 } from "lucide-react";
import type { TrackingRecordVM } from "./types";
import { formatDMY } from "@/lib/shared/date";
import { TooltipProvider } from "@/components/ui/tooltip";
import EditTrackingDialog from "./dialogs/EditTrackingDialog";
import { supabase } from "@/lib/integrations/supabase/client";
import { toast } from "sonner";

export default function CustomerTrackingTable({
    rows,
    loading,
    onChanged,
    isAdmin,
    search,
    onSearchChange,
    onRefresh,
    bdMap,
    stats,
}: {
    rows: TrackingRecordVM[];
    loading: boolean;
    onChanged: () => Promise<void> | void;
    onRefresh: () => Promise<void> | void;
    isAdmin: boolean;
    search: string;
    onSearchChange: (value: string) => void;
    bdMap: Record<string, string>;
    stats: {
        totalCustomers: number;
        totalBranches: number;
    };
}) {
    const [selectionMode, setSelectionMode] = useState(false);
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [editing, setEditing] = useState<TrackingRecordVM | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const selectedIds = Object.keys(selected).filter((id) => selected[id]);
    const isBusy = loading || deleting;

    function toggleRowSelection(id: string) {
        if (!selectionMode || isBusy) return;

        setSelected((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    }

    function openEditDialog(record: TrackingRecordVM) {
        if (!isAdmin || selectionMode || isBusy) return;
        setEditing(record);
        setEditOpen(true);
    }

    async function handleDelete() {
        if (isBusy) return;

        if (!selectionMode) {
            setSelectionMode(true);
            return;
        }

        if (selectedIds.length === 0) {
            setSelectionMode(false);
            setSelected({});
            return;
        }

        setDeleting(true);

        try {
            const { error } = await supabase
                .from("customer_tracking")
                .delete()
                .in("id", selectedIds);

            if (error) {
                toast.error("Failed to delete records.");
                return;
            }

            window.dispatchEvent(new Event("customer-tracking-updated"));
            setSelected({});
            setSelectionMode(false);

            await onChanged();
            toast.success(
                selectedIds.length === 1
                    ? "Record deleted successfully."
                    : `${selectedIds.length} records deleted successfully.`
            );
        } finally {
            setDeleting(false);
        }
    }

    return (
        <TooltipProvider>
            <>
                <div className="relative overflow-hidden rounded-xl border">
                    {isBusy && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/55 backdrop-blur-[1px]">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    <div className="flex items-center gap-3 border-b p-2">
                        <div className="relative w-[280px]">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search customer, BD, note or info..."
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="h-9 pl-8"
                                disabled={isBusy}
                            />
                        </div>

                        <div className="flex-1" />

                        <div className="flex items-center gap-2">
                            <Button
                                className="cursor-pointer"
                                variant="ghost"
                                onClick={onRefresh}
                                disabled={isBusy}
                            >
                                <RefreshCw className="h-4 w-4" />
                                Refresh
                            </Button>

                            {isAdmin && (
                                <div className="flex items-center gap-2">
                                    {selectionMode && (
                                        <Button
                                            className="cursor-pointer"
                                            variant="ghost"
                                            onClick={() => {
                                                if (isBusy) return;
                                                setSelectionMode(false);
                                                setSelected({});
                                            }}
                                            disabled={isBusy}
                                        >
                                            Cancel
                                        </Button>
                                    )}

                                    <Button
                                        className="cursor-pointer"
                                        variant={selectionMode ? "destructive" : "secondary"}
                                        onClick={handleDelete}
                                        disabled={isBusy}
                                    >
                                        {deleting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Deleting...
                                            </>
                                        ) : selectionMode ? (
                                            `Delete (${selectedIds.length})`
                                        ) : (
                                            "Delete"
                                        )}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-full overflow-x-auto">
                        <table className="w-full min-w-[1220px] table-fixed text-center text-sm">
                            <thead className="sticky top-0 z-10 border-b bg-muted/90 shadow-sm backdrop-blur">
                                <tr>
                                    <th className="w-[120px] p-2 pl-5 text-left">Date</th>

                                    <th className="w-[240px] p-2">
                                        Customers
                                        <span className="ml-2 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                            {stats.totalCustomers.toLocaleString("en-US")}
                                        </span>
                                    </th>

                                    <th className="w-[120px] p-2">
                                        Branches
                                        <span className="ml-2 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                            {stats.totalBranches.toLocaleString("en-US")}
                                        </span>
                                    </th>

                                    <th className="w-[120px] p-2">BD Name</th>
                                    <th className="w-[140px] p-2">Combo/Voucher</th>
                                    <th className="w-[140px] p-2">Advertising</th>
                                    <th className="w-[140px] p-2">Note</th>
                                    <th className="w-[140px] p-2">Information</th>

                                    {selectionMode && (
                                        <th className="w-[60px] p-2 text-right"></th>
                                    )}
                                </tr>
                            </thead>

                            <tbody>
                                {rows.map((r) => {
                                    const isSelected = !!selected[r.id];

                                    return (
                                        <tr
                                            key={r.id}
                                            className={`border-t ${selectionMode ? "cursor-pointer" : "cursor-default"
                                                } ${isSelected ? "bg-muted/40" : ""}`}
                                            onClick={() => toggleRowSelection(r.id)}
                                            onDoubleClick={() => openEditDialog(r)}
                                        >
                                            <td className="p-2 pl-5 text-left">
                                                <div className="flex items-center justify-start gap-2">
                                                    <span>{formatDMY(r.event_date)}</span>
                                                    {r._sync_status === "pending" && (
                                                        <Badge variant="secondary">Pending</Badge>
                                                    )}
                                                    {r._sync_status === "failed" && (
                                                        <Badge variant="destructive">Failed</Badge>
                                                    )}
                                                </div>
                                            </td>

                                            <td
                                                className="overflow-hidden whitespace-nowrap p-2 text-ellipsis"
                                                title={r.customer_name}
                                            >
                                                {r.customer_name}
                                            </td>

                                            <td className="p-2">
                                                {r.branch != null
                                                    ? r.branch.toLocaleString("en-US")
                                                    : "—"}
                                            </td>

                                            <td
                                                className="overflow-hidden whitespace-nowrap p-2 text-ellipsis"
                                                title={bdMap[r.bd_id ?? ""] ?? ""}
                                            >
                                                {bdMap[r.bd_id ?? ""] ?? "—"}
                                            </td>

                                            <td className="p-2">
                                                {r.combo_voucher ? (
                                                    <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                        YES
                                                    </span>
                                                ) : (
                                                    "—"
                                                )}
                                            </td>

                                            <td className="p-2">
                                                {r.offer_ads ? (
                                                    <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                        YES
                                                    </span>
                                                ) : (
                                                    "—"
                                                )}
                                            </td>

                                            <td
                                                className="overflow-hidden whitespace-nowrap p-2 text-ellipsis"
                                                title={r.note ?? ""}
                                            >
                                                {r.note ?? "—"}
                                            </td>

                                            <td
                                                className="overflow-hidden whitespace-nowrap p-2 text-ellipsis"
                                                title={r.info ?? ""}
                                            >
                                                {r.info ?? "—"}
                                            </td>

                                            {selectionMode && (
                                                <td
                                                    className="p-2 text-right"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onCheckedChange={(v) =>
                                                            setSelected((s) => ({
                                                                ...s,
                                                                [r.id]: Boolean(v),
                                                            }))
                                                        }
                                                        disabled={isBusy}
                                                    />
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {rows.length === 0 && !isBusy && (
                            <div className="p-4 text-sm text-muted-foreground">
                                No records found
                            </div>
                        )}
                    </div>
                </div>

                {isAdmin && (
                    <EditTrackingDialog
                        open={editOpen}
                        onOpenChange={setEditOpen}
                        record={editing}
                        onSaved={onChanged}
                    />
                )}
            </>
        </TooltipProvider>
    );
}
