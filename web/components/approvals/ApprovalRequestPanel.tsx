"use client";

import { useEffect, useMemo, useState } from "react";
import {
    CheckCircle2,
    CircleX,
    Clock3,
    User,
    Store,
} from "lucide-react";
import { supabase } from "@/lib/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extractDigits } from "@/lib/shared/number";
import type { ApprovalRequest, ApprovalImage, ApprovalRequestVM } from "./utils/types";
import { AttachmentIcon, isImageFile } from "@/components/qa/utils/AttachmentIcon";
import {
    attachmentCardClass,
    interactiveCardClass,
    formatFileSize,
    truncateMiddleFileName,
} from "@/components/qa/utils/attachmentHelpers";

const labelClass =
    "mb-2 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

const sectionCardClass =
    "overflow-hidden rounded-xl border border-border bg-background";

const sectionHeaderClass =
    "bg-muted/50 px-5 py-3 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground";

const infoTileClass =
    "rounded-lg border border-border bg-background px-4 py-4";

function formatRequestCode(request?: ApprovalRequestVM | null) {
    if (!request?.request_code) return "REQ-82419";
    return request.request_code.replace(/^#?APR-?/i, "REQ-");
}

function formatSubmittedDate(value?: string | null) {
    if (!value) return "—";
    return new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getStatusChipClass(status?: string) {
    switch (status) {
        case "approved":
            return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300";
        case "rejected":
            return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300";
        case "pending":
        default:
            return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300";
    }
}

function getDecisionButtonClass(
    type: "approved" | "rejected",
    selected: boolean
) {
    const activeClass =
        type === "approved"
            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/35"
            : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/35";

    const hoverClass =
        type === "approved"
            ? "border-border bg-background hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/25"
            : "border-border bg-background hover:border-red-300 hover:bg-red-50 dark:hover:border-red-800 dark:hover:bg-red-950/25";

    return [
        "group flex min-h-[86px] flex-col items-center justify-center rounded-xl border px-4 text-center transition disabled:opacity-60 cursor-pointer",
        selected ? activeClass : hoverClass,
    ].join(" ");
}

function getAttachmentOpenUrl(item: ApprovalImage) {
    const baseUrl = item.secure_url || item.url || item.thumbnail_url || null;
    if (!baseUrl) return null;

    if (isImageFile(item.type || "")) {
        return baseUrl;
    }

    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}fl_attachment=${encodeURIComponent(item.name)}`;
}

function formatNumberInput(value: string) {
    const digits = extractDigits(value);
    if (!digits) return "";
    return Number(digits).toLocaleString("en-US");
}

function parseFormattedNumber(value: string) {
    const digits = extractDigits(value);
    return digits ? Number(digits) : 0;
}

export default function ApprovalRequestDetailPanel({
    request,
    isAdmin,
    bdMap,
    currentUserId,
    pendingCount,
    onSaved,
    onRequestChanged,
}: {
    request: ApprovalRequestVM | null;
    isAdmin: boolean;
    bdMap: Record<string, string>;
    currentUserId: string;
    pendingCount: number;
    onSaved: () => void;
    onRequestChanged: (request: ApprovalRequestVM) => void;
}) {
    const [adminNote, setAdminNote] = useState("");
    const [kpiPointAward, setKpiPointAward] = useState("");
    const [bonusAmount, setBonusAmount] = useState("");
    const [saving, setSaving] = useState(false);
    const [conflictMessage, setConflictMessage] = useState("");
    const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);

    useEffect(() => {
        if (!request) return;

        setAdminNote(request.admin_note ?? "");
        setKpiPointAward(
            request.kpi_point_award != null ? String(request.kpi_point_award) : ""
        );
        setBonusAmount(
            request.bonus_amount != null ? String(request.bonus_amount) : ""
        );
        setConflictMessage("");
    }, [request]);

    useEffect(() => {
        if (!request?.id) return;

        const channel = supabase
            .channel(`approval-request-row:${request.id}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "approval_requests",
                    filter: `id=eq.${request.id}`,
                },
                (payload) => {
                    const next = payload.new as ApprovalRequestVM;

                    const nextVm: ApprovalRequestVM = {
                        ...request,
                        ...next,
                        asked_by_name: bdMap[next.asked_by_bd_id] ?? "—",
                    };

                    onRequestChanged(nextVm);
                    setConflictMessage("");
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [request, bdMap, onRequestChanged]);

    useEffect(() => {
        if (!request) return;

        setAdminNote(request.admin_note ?? "");
        setKpiPointAward(
            request.kpi_point_award != null ? String(request.kpi_point_award) : ""
        );
        setBonusAmount(
            request.bonus_amount != null ? String(request.bonus_amount) : ""
        );
        setConflictMessage("");
        setDecision(null);
    }, [request]);

    const images = useMemo(() => request?.images ?? [], [request]);

    if (!request) {
        return (
            <div className="flex h-full flex-col items-center justify-center px-10 py-12 text-center">
                <h2 className="text-4xl font-bold tracking-tight text-foreground">
                    Select a request to begin review
                </h2>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold tracking-wide">
                    <span className="text-primary">
                        {pendingCount} items awaiting review
                    </span>
                </div>
            </div>
        );
    }

    const isPending = request.status === "pending";

    async function handleConfirmDecision() {
        if (!decision || saving) return;

        if (decision === "approved") {
            await handleApprove();
            return;
        }

        await handleReject();
    }

    async function handleReject() {
        const currentRequest = request;
        if (!currentRequest || !isAdmin || !isPending || saving) return;

        setSaving(true);
        try {
            const payload = {
                status: "rejected",
                admin_note: adminNote.trim() || null,
                rejected_by_user_id: currentUserId,
                reviewed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                version: (currentRequest.version ?? 1) + 1,
            };

            const { data, error } = await supabase
                .from("approval_requests")
                .update(payload)
                .eq("id", currentRequest.id)
                .eq("version", currentRequest.version ?? 1)
                .select("*");

            if (error) {
                toast.error("Failed to reject request.");
                return;
            }

            if (!data || data.length === 0) {
                toast.error("This request was updated by another admin. Please reload and try again.");
                return;
            }

            toast.success("Request rejected successfully.");
            onSaved();
        } finally {
            setSaving(false);
        }
    }

    async function handleApprove() {
        const currentRequest = request;
        if (!currentRequest || !isAdmin || !isPending || saving) return;

        if (!kpiPointAward.trim()) {
            toast.error("Please enter KPI Point Award.");
            return;
        }

        if (!bonusAmount.trim()) {
            toast.error("Please enter Bonus Amount.");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                status: "approved",
                admin_note: adminNote.trim() || null,
                approved_by_user_id: currentUserId,
                kpi_point_award: parseFormattedNumber(kpiPointAward),
                bonus_amount: parseFormattedNumber(bonusAmount),
                reviewed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                version: (currentRequest.version ?? 1) + 1,
            };

            const { data, error } = await supabase
                .from("approval_requests")
                .update(payload)
                .eq("id", currentRequest.id)
                .eq("version", currentRequest.version ?? 1)
                .select("*");

            if (error) {
                toast.error("Failed to approve request.");
                return;
            }

            if (!data || data.length === 0) {
                toast.error("This request was updated by another admin. Please reload and try again.");
                return;
            }

            toast.success("Request approved successfully.");
            onSaved();
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="h-full overflow-y-auto bg-primary/[0.03]">
            <div className="px-6 py-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                        <h1 className="truncate text-2xl font-extrabold tracking-tight text-foreground">
                            #{formatRequestCode(request)}
                        </h1>
                    </div>

                    <div className="flex flex-wrap items-center gap-7">
                        <div className="text-sm font-medium text-muted-foreground">
                            Submitted on {formatSubmittedDate(request.created_at)}
                        </div>

                        <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${getStatusChipClass(
                                request.status
                            )}`}
                        >
                            {request.status === "pending" ? "Pending Review" : request.status}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 px-6 pb-6 xl:grid-cols-[minmax(0,1fr)_400px]">
                <div className="space-y-6">
                    <section className={sectionCardClass}>
                        <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                Requester Details
                            </div>
                        </div>

                        <div className="grid gap-4 p-5 md:grid-cols-2">
                            <div className={infoTileClass}>
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                        <User className="h-5 w-5" />
                                    </div>

                                    <div className="min-w-0">
                                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                            BD Name
                                        </div>
                                        <div className="mt-1 font-semibold text-foreground">
                                            {bdMap[request.asked_by_bd_id] ?? "—"}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={infoTileClass}>
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                        <Store className="h-5 w-5" />
                                    </div>

                                    <div className="min-w-0">
                                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                            Store Name
                                        </div>
                                        <div className="mt-1 font-semibold text-foreground">
                                            {request.store_name}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className={sectionCardClass}>
                        <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                Submission Description
                            </div>
                        </div>

                        <div className="px-5 py-5">
                            <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">
                                {request.user_note?.trim() || "—"}
                            </div>
                        </div>
                    </section>

                    <section className={sectionCardClass}>
                        <div className="border-b bg-muted/30 px-5 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                Attachments ({images.length})
                            </div>
                        </div>

                        <div className="p-5">
                            {images.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No attachments uploaded.</div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    {images.map((item) => {
                                        const openUrl = getAttachmentOpenUrl(item);
                                        const isImage = isImageFile(item.type || "");

                                        if (!openUrl) return null;

                                        return (
                                            <div
                                                key={item.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => {
                                                    window.open(openUrl, "_blank", "noopener,noreferrer");
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        window.open(openUrl, "_blank", "noopener,noreferrer");
                                                    }
                                                }}
                                                className={`${attachmentCardClass} ${interactiveCardClass} text-left`}
                                                title={item.name}
                                            >
                                                {isImage ? (
                                                    <img
                                                        src={item.thumbnail_url || item.secure_url || item.url || openUrl}
                                                        alt={item.name}
                                                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                                                    />
                                                ) : (
                                                    <AttachmentIcon
                                                        type={item.type || ""}
                                                        name={item.name}
                                                        className="h-10 w-10 shrink-0"
                                                    />
                                                )}

                                                <div className="min-w-0 flex-1 overflow-hidden pr-1">
                                                    <div className="overflow-hidden text-sm font-medium text-foreground">
                                                        {truncateMiddleFileName(item.name)}
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {formatFileSize(item.size ?? 0)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <aside className="xl:sticky xl:top-6 xl:self-start">
                    <section className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
                        <div className="border-b px-5 py-4 bg-muted/30">
                            <h3 className="text-2xl font-bold tracking-tight text-foreground">
                                Review Action
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Make a final decision on this request.
                            </p>
                        </div>

                        <div className="space-y-5 p-5">
                            {conflictMessage && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
                                    {conflictMessage}
                                </div>
                            )}

                            {isAdmin && isPending ? (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setDecision("approved")}
                                            disabled={saving}
                                            className={getDecisionButtonClass(
                                                "approved",
                                                decision === "approved"
                                            )}
                                        >
                                            <CheckCircle2
                                                className={`mb-2 h-5 w-5 transition ${decision === "approved"
                                                    ? "text-emerald-600"
                                                    : "text-muted-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                                                    }`}
                                            />
                                            <span
                                                className={`text-sm font-bold uppercase tracking-wide transition ${decision === "approved"
                                                    ? "text-emerald-700"
                                                    : "text-foreground/80 group-hover:text-emerald-700 dark:group-hover:text-emerald-300"
                                                    }`}
                                            >
                                                Approve
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setDecision("rejected")}
                                            disabled={saving}
                                            className={getDecisionButtonClass(
                                                "rejected",
                                                decision === "rejected"
                                            )}
                                        >
                                            <CircleX
                                                className={`mb-2 h-5 w-5 transition ${decision === "rejected"
                                                    ? "text-red-600"
                                                    : "text-muted-foreground group-hover:text-red-600 dark:group-hover:text-red-400"
                                                    }`}
                                            />
                                            <span
                                                className={`text-sm font-bold uppercase tracking-wide transition ${decision === "rejected"
                                                    ? "text-red-700"
                                                    : "text-foreground/80 group-hover:text-red-700 dark:group-hover:text-red-300"
                                                    }`}
                                            >
                                                Reject
                                            </span>
                                        </button>
                                    </div>

                                    {decision === "approved" && (
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div>
                                                <label className={labelClass}>KPI Point Award</label>
                                                <Input
                                                    inputMode="numeric"
                                                    value={kpiPointAward}
                                                    onChange={(e) => setKpiPointAward(formatNumberInput(e.target.value))}
                                                    placeholder="0"
                                                    className="h-12 rounded-lg bg-background"
                                                />
                                            </div>

                                            <div>
                                                <label className={labelClass}>Bonus Amount</label>
                                                <div className="relative">
                                                    <Input
                                                        inputMode="numeric"
                                                        value={bonusAmount}
                                                        onChange={(e) => setBonusAmount(formatNumberInput(e.target.value))}
                                                        placeholder="0"
                                                        className="h-12 rounded-lg bg-background pr-14"
                                                    />
                                                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-medium text-muted-foreground">
                                                        VND
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className={labelClass}>Admin Remarks (optional)</label>
                                        <Textarea
                                            value={adminNote}
                                            onChange={(e) => setAdminNote(e.target.value)}
                                            placeholder="Enter internal feedback or rejection reason..."
                                            rows={4}
                                            className="h-[100px] min-h-[100px] max-h-[100px] resize-none overflow-y-auto rounded-xl"
                                        />
                                    </div>

                                    <Button
                                        className="h-12 w-full rounded-lg text-base font-semibold cursor-pointer"
                                        onClick={handleConfirmDecision}
                                        disabled={
                                            saving ||
                                            !decision ||
                                            (decision === "approved" &&
                                                (!kpiPointAward.trim() || !bonusAmount.trim()))
                                        }
                                    >
                                        Confirm Decision
                                    </Button>

                                    <div className="text-center text-[11px] leading-5 text-muted-foreground">
                                        Final decisions will trigger an automatic notification.
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <Clock3 className="h-4 w-4" />
                                        This request has already been reviewed.
                                    </div>
                                </div>
                            )}

                            {request.status === "approved" && (
                                <>
                                    <div>
                                        <label className={labelClass}>KPI Point Award</label>
                                        <div className="flex h-12 items-center rounded-lg border border-input bg-muted/60 px-4 text-sm text-foreground">
                                            {request.kpi_point_award ?? "0"}
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Bonus Amount</label>
                                        <div className="flex h-12 items-center rounded-lg border border-input bg-muted/60 px-4 text-sm text-foreground">
                                            {request.bonus_amount ?? "0"}
                                        </div>
                                    </div>
                                </>
                            )}

                            {!isPending && (
                                <div className="text-center text-xs leading-5 text-muted-foreground">
                                    Final decision has been submitted for this request.
                                </div>
                            )}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
