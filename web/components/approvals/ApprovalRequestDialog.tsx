"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UploadCloud, Trash2 } from "lucide-react";
import { supabase } from "@/lib/integrations/supabase/client";
import { deleteCloudinaryAssets } from "@/lib/integrations/cloudinary/delete-assets";
import { useMastersActive } from "@/lib/features/masters/useMasters";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { extractDigits } from "@/lib/shared/number";
import { AttachmentIcon, isImageFile } from "@/components/qa/utils/AttachmentIcon";
import {
  attachmentCardClass,
  interactiveCardClass,
  formatFileSize,
  truncateMiddleFileName,
  MAX_ATTACHMENTS,
  preprocessAttachmentFiles,
  getOversizedFiles,
} from "@/components/qa/utils/attachmentHelpers";
import AttachmentLoadingIndicator from "@/components/qa/utils/AttachmentLoadingIndicator";
import type { ApprovalImage, ApprovalRequestVM } from "./utils/types";

const fieldClass =
  "!h-11 h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm shadow-none";

const infoFieldClass =
  "flex h-11 w-full min-w-0 items-center rounded-lg border border-input bg-muted/60 px-3 text-sm text-foreground";

const readonlyTextAreaClass =
  "min-h-[100px] rounded-lg border border-input bg-muted/60 px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-all";

const labelClass =
  "mb-2 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

type LocalAttachment = ApprovalImage & {
  file?: File;
  local_preview_url?: string | null;
  upload_status?: "idle" | "uploading" | "uploaded" | "error";
};

function getLocalAttachmentOpenUrl(item: LocalAttachment) {
  return item.local_preview_url || item.secure_url || item.url || null;
}

function formatCreatedDate(value?: string | Date | null) {
  if (!value) return "—";

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapRemoteAttachments(items?: ApprovalImage[] | null): LocalAttachment[] {
  return (items ?? []).map((item) => ({
    ...item,
    file: undefined,
    local_preview_url: null,
    upload_status: "uploaded",
  }));
}

function getAttachmentKey(item: {
  public_id?: string | null;
  name: string;
  size: number;
  type: string;
}) {
  return item.public_id || `${item.name}-${item.size}-${item.type}`;
}

function formatNumberInput(value: string) {
  const digits = extractDigits(value);
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

function parseFormattedNumber(value: string) {
  const digits = extractDigits(value);
  return digits ? Number(digits) : null;
}

function getStatusLabel(status?: ApprovalRequestVM["status"] | null) {
  if (!status) return "—";
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return status;
}

function getStatusFieldClass(status?: ApprovalRequestVM["status"] | null) {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-border bg-slate-100 text-foreground";
}

export default function CreateApprovalRequestDialog({
  open,
  onOpenChange,
  onSaved,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
  request?: ApprovalRequestVM | null;
}) {
  const bdList = useMastersActive("bd");

  const isEditMode = !!request;

  const [askedByBdId, setAskedByBdId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [description, setDescription] = useState("");
  const [adminRemark, setAdminRemark] = useState("");
  const [kpiAwarded, setKpiAwarded] = useState("");
  const [bonusAmount, setBonusAmount] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitStage, setSubmitStage] = useState<
    "idle" | "uploading_attachments" | "creating_request" | "updating_request"
  >("idle");
  const [dragging, setDragging] = useState(false);
  const [createdAtText, setCreatedAtText] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const bdOptions = useMemo(() => {
    return [...bdList].sort((a, b) => a.label.localeCompare(b.label));
  }, [bdList]);

  const selectedBdLabel = useMemo(() => {
    if (!askedByBdId) return "—";
    return bdOptions.find((item) => item.id === askedByBdId)?.label ?? "—";
  }, [askedByBdId, bdOptions]);

  const attachmentChanged = useMemo(() => {
    if (!isEditMode || !request) return false;

    const currentAttachmentKeys = attachments.map(getAttachmentKey).sort();
    const originalAttachmentKeys = (request.images ?? []).map(getAttachmentKey).sort();

    return (
      currentAttachmentKeys.length !== originalAttachmentKeys.length ||
      currentAttachmentKeys.some((key, index) => key !== originalAttachmentKeys[index])
    );
  }, [attachments, isEditMode, request]);

  const hasChanges = useMemo(() => {
    if (!isEditMode || !request) {
      return !!askedByBdId && !!storeName.trim();
    }

    const originalStoreName = request.store_name ?? "";
    const originalUserNote = request.user_note ?? "";
    const originalAdminNote = request.admin_note ?? "";
    const originalKpiAwarded =
      request.kpi_point_award != null ? String(request.kpi_point_award) : "";
    const originalBonusAmount =
      request.bonus_amount != null ? String(request.bonus_amount) : "";

    const normalizedCurrentKpi = extractDigits(kpiAwarded);
    const normalizedCurrentBonus = extractDigits(bonusAmount);

    const infoChanged =
      storeName.trim() !== originalStoreName ||
      description !== originalUserNote ||
      adminRemark !== originalAdminNote ||
      normalizedCurrentKpi !== originalKpiAwarded ||
      normalizedCurrentBonus !== originalBonusAmount;

    return infoChanged || attachmentChanged;
  }, [
    isEditMode,
    request,
    askedByBdId,
    storeName,
    description,
    adminRemark,
    kpiAwarded,
    bonusAmount,
    attachmentChanged,
  ]);

  const isDisabled =
    saving ||
    !storeName.trim() ||
    (!isEditMode && !askedByBdId) ||
    (isEditMode && !hasChanges);

  async function mergeFiles(fileList: FileList | File[]) {
    const rawFiles = Array.from(fileList);

    const processedFiles = await preprocessAttachmentFiles(rawFiles, isImageFile);

    const oversizedFiles = getOversizedFiles(rawFiles);
    if (oversizedFiles.length > 0) {
      toast.error(
        oversizedFiles.map((file) => `${file.name} exceeds the 10MB limit.`).join("\n")
      );
    }

    setAttachments((prev) => {
      const existing = new Set(
        prev.map((item) => `${item.name}-${item.size}-${item.type}`)
      );

      const remain = MAX_ATTACHMENTS - prev.length;
      if (remain <= 0) return prev;

      const next: LocalAttachment[] = processedFiles
        .filter((file) => {
          const key = `${file.name}-${file.size}-${file.type}`;
          return !existing.has(key);
        })
        .slice(0, remain)
        .map((file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          resource_type: "raw",
          public_id: "",
          url: "",
          secure_url: "",
          format: null,
          version: null,
          thumbnail_url: null,
          local_preview_url: URL.createObjectURL(file),
          file,
          upload_status: "idle",
        }));

      return [...prev, ...next];
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    await mergeFiles(e.target.files);
    e.target.value = "";
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.local_preview_url) {
        URL.revokeObjectURL(target.local_preview_url);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  useEffect(() => {
    if (!open) return;

    if (request) {
      setAskedByBdId(request.asked_by_bd_id ?? "");
      setStoreName(request.store_name ?? "");
      setDescription(request.user_note ?? "");
      setAdminRemark(request.admin_note ?? "");
      setKpiAwarded(
        typeof request.kpi_point_award === "number"
          ? Number(request.kpi_point_award).toLocaleString("en-US")
          : ""
      );
      setBonusAmount(
        typeof request.bonus_amount === "number"
          ? Number(request.bonus_amount).toLocaleString("en-US")
          : ""
      );
      setAttachments(mapRemoteAttachments(request.images));
      setCreatedAtText(formatCreatedDate(request.created_at));
      setDragging(false);
      setSaving(false);
      setSubmitStage("idle");
      return;
    }

    setAskedByBdId("");
    setStoreName("");
    setDescription("");
    setAdminRemark("");
    setKpiAwarded("");
    setBonusAmount("");
    setAttachments([]);
    setCreatedAtText(formatCreatedDate(new Date()));
    setDragging(false);
    setSaving(false);
    setSubmitStage("idle");
  }, [open, request]);

  useEffect(() => {
    if (open) return;

    setAttachments((current) => {
      current.forEach((item) => {
        if (item.local_preview_url) URL.revokeObjectURL(item.local_preview_url);
      });
      return current.length === 0 ? current : [];
    });

    setAskedByBdId("");
    setStoreName("");
    setDescription("");
    setAdminRemark("");
    setKpiAwarded("");
    setBonusAmount("");
    setDragging(false);
    setSaving(false);
    setSubmitStage("idle");
    setCreatedAtText("");
  }, [open]);

  async function uploadAttachments(files: LocalAttachment[]) {
    const fileItems = files.filter((item) => item.file);

    if (fileItems.length === 0) return [];

    const formData = new FormData();

    fileItems.forEach((item) => {
      if (item.file) {
        formData.append("files", item.file);
      }
    });

    formData.append("folder", "approval_requests");

    const res = await fetch("/api/cloudinary/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error("Failed to upload attachments");
    }

    const data = await res.json();
    return data.files as ApprovalImage[];
  }

  async function handleSave() {
    if (isDisabled) return;

    setSaving(true);
    setSubmitStage("idle");

    try {
      const existingAttachments = attachments
        .filter((item) => !item.file)
        .map<ApprovalImage>((item) => ({
          id: item.id,
          name: item.name,
          size: item.size,
          type: item.type,
          resource_type: item.resource_type,
          public_id: item.public_id,
          url: item.url,
          secure_url: item.secure_url,
          format: item.format,
          version: item.version,
          thumbnail_url: item.thumbnail_url,
        }));

      const newLocalAttachments = attachments.filter((item) => !!item.file);
      const removedExistingAttachments =
        isEditMode && request
          ? (request.images ?? []).filter(
              (oldItem) =>
                !attachments.some(
                  (current) =>
                    !current.file && getAttachmentKey(current) === getAttachmentKey(oldItem)
                )
            )
          : [];

      let uploadedAttachments: ApprovalImage[] = [];

      if (newLocalAttachments.length > 0) {
        setSubmitStage("uploading_attachments");
        uploadedAttachments = await uploadAttachments(newLocalAttachments);
      }

      const mergedAttachments = [...existingAttachments, ...uploadedAttachments];

      if (isEditMode && request?.id) {
        setSubmitStage("updating_request");

        const payload = {
          store_name: storeName.trim(),
          user_note: description.trim() || null,
          admin_note: adminRemark.trim() || null,
          kpi_point_award: parseFormattedNumber(kpiAwarded),
          bonus_amount: parseFormattedNumber(bonusAmount),
          images: mergedAttachments,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("approval_requests")
          .update(payload)
          .eq("id", request.id);

        if (error) {
          toast.error("Failed to update request.");
          return;
        }

        if (removedExistingAttachments.length > 0) {
          try {
            await deleteCloudinaryAssets(removedExistingAttachments);
          } catch (error) {
            console.error("Failed to delete cloudinary files:", error);
          }
        }

        toast.success("Request updated successfully.");
      } else {
        setSubmitStage("creating_request");

        const payload = {
          asked_by_bd_id: askedByBdId,
          store_name: storeName.trim(),
          user_note: description.trim() || null,
          admin_note: null,
          kpi_point_award: null,
          bonus_amount: null,
          images: mergedAttachments,
          status: "pending",
        };

        const { error } = await supabase.from("approval_requests").insert(payload);

        if (error) {
          toast.error("Failed to create request.");
          return;
        }
        toast.success("Request created successfully.");
      }

      attachments.forEach((item) => {
        if (item.local_preview_url) {
          URL.revokeObjectURL(item.local_preview_url);
        }
      });

      onOpenChange(false);
      await onSaved();
    } finally {
      setSaving(false);
      setSubmitStage("idle");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-[66vw] max-w-none min-w-[900px] flex-col overflow-hidden rounded-xl border bg-background p-0 shadow-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
            {isEditMode ? "Edit Approval Request" : "Create Approval Request"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            {isEditMode
              ? "Update request information and attachments."
              : "Submit store visit evidence for admin review."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6">
          <div>
            <label className={labelClass}>Store Name</label>
            <Input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Enter store name"
              className={fieldClass}
            />
          </div>

          <div
            className={[
              "grid grid-cols-1 gap-4",
              isEditMode ? "md:grid-cols-3" : "md:grid-cols-2",
            ].join(" ")}
          >
            <div className="w-full min-w-0">
              <label className={labelClass}>BD Name</label>

              {isEditMode ? (
                <div className={infoFieldClass}>{selectedBdLabel}</div>
              ) : (
                <Select value={askedByBdId} onValueChange={setAskedByBdId}>
                  <SelectTrigger className={fieldClass}>
                    <SelectValue placeholder="Select BD" />
                  </SelectTrigger>
                  <SelectContent>
                    {bdOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="w-full min-w-0">
              <label className={labelClass}>Created At</label>
              <div className={infoFieldClass}>{createdAtText || "—"}</div>
            </div>

            {isEditMode && (
              <div className="w-full min-w-0">
                <label className={labelClass}>Result</label>
                <div
                  className={[
                    "flex h-11 w-full min-w-0 items-center rounded-lg border px-3 text-sm font-medium",
                    getStatusFieldClass(request?.status),
                  ].join(" ")}
                >
                  {getStatusLabel(request?.status)}
                </div>
              </div>
            )}
          </div>

          {isEditMode ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="w-full min-w-0">
                  <label className={labelClass}>User Description</label>
                  <div className={readonlyTextAreaClass}>
                    {description?.trim() || "—"}
                  </div>
                </div>

                <div className="w-full min-w-0">
                  <label className={labelClass}>Admin Remarks</label>
                  <Textarea
                    value={adminRemark}
                    onChange={(e) => setAdminRemark(e.target.value)}
                    placeholder="Add admin remarks..."
                    rows={4}
                    className="h-[100px] min-h-[100px] max-h-[100px] resize-none overflow-y-auto whitespace-pre-wrap break-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="w-full min-w-0">
                  <label className={labelClass}>KPI Awarded</label>
                  <Input
                    value={kpiAwarded}
                    onChange={(e) => setKpiAwarded(formatNumberInput(e.target.value))}
                    placeholder="Enter KPI awarded"
                    inputMode="numeric"
                    className={fieldClass}
                  />
                </div>

                <div className="w-full min-w-0">
                  <label className={labelClass}>Bonus</label>
                  <Input
                    value={bonusAmount}
                    onChange={(e) => setBonusAmount(formatNumberInput(e.target.value))}
                    placeholder="Enter bonus amount"
                    inputMode="numeric"
                    className={fieldClass}
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className={labelClass}>Description (optional)</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add request details for admin..."
                className="min-h-[100px] whitespace-pre-wrap break-all"
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Attachments (optional)</label>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="
                image/*,
                video/*,
                .mp4,.mov,.webm,.m4v,
                .pdf,
                .txt,
                .doc,.docx,
                .xls,.xlsx,
                .ppt,.pptx,
                application/msword,
                application/vnd.openxmlformats-officedocument.wordprocessingml.document,
                application/vnd.ms-excel,
                application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
                application/vnd.ms-powerpoint,
                application/vnd.openxmlformats-officedocument.presentationml.presentation,
                video/mp4,
                video/quicktime,
                video/webm,
                video/x-m4v
              "
              className="hidden"
              onChange={handleFileChange}
            />

            {attachments.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (e.dataTransfer.files?.length) {
                    await mergeFiles(e.dataTransfer.files);
                  }
                }}
                style={{
                  border: dragging
                    ? "1.5px dashed var(--primary)"
                    : "1.5px dashed color-mix(in oklab, var(--primary) 22%, transparent)",
                  borderRadius: "10px",
                }}
                className={`flex min-h-[60px] w-full flex-col items-center justify-center px-5 py-5 text-center ${interactiveCardClass}`}
              >
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UploadCloud className="h-5 w-5" />
                </div>

                <div className="text-sm font-semibold text-foreground">
                  Click to upload or drag and drop
                </div>

                <div className="mt-1 text-xs text-muted-foreground">
                  Up to {MAX_ATTACHMENTS} attachments · Max. 10MB each
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {attachments.map((item) => {
                  const isPreviewImage =
                    isImageFile(item.type) &&
                    !!(
                      item.local_preview_url ||
                      item.thumbnail_url ||
                      item.secure_url ||
                      item.url
                    );

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const targetUrl = getLocalAttachmentOpenUrl(item);
                        if (targetUrl) {
                          window.open(targetUrl, "_blank", "noopener,noreferrer");
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          const targetUrl = getLocalAttachmentOpenUrl(item);
                          if (targetUrl) {
                            window.open(targetUrl, "_blank", "noopener,noreferrer");
                          }
                        }
                      }}
                      className={`${attachmentCardClass} ${interactiveCardClass} text-left`}
                      title={item.name}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveAttachment(item.id);
                        }}
                        className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      {isPreviewImage ? (
                        <img
                          src={
                            item.local_preview_url ||
                            item.thumbnail_url ||
                            item.secure_url ||
                            item.url
                          }
                          alt={item.name}
                          className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <AttachmentIcon
                          type={item.type}
                          name={item.name}
                          className="h-10 w-10 shrink-0"
                        />
                      )}

                      <div className="min-w-0 flex-1 overflow-hidden pr-1">
                        <div className="overflow-hidden text-sm font-medium text-foreground">
                          {truncateMiddleFileName(item.name)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatFileSize(item.size)}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {attachments.length < MAX_ATTACHMENTS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: dragging
                        ? "1.5px dashed var(--primary)"
                        : "1.5px dashed color-mix(in oklab, var(--primary) 22%, transparent)",
                      borderRadius: "10px",
                    }}
                    className={`flex h-[72px] min-h-[72px] w-full items-center justify-center rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-muted-foreground ${interactiveCardClass}`}
                  >
                    + Add more
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <div className="flex h-11 flex-1 items-center">
            <div className="flex min-h-[44px] flex-1 items-center">
              {saving && (
                <AttachmentLoadingIndicator
                  text={
                    submitStage === "uploading_attachments"
                      ? `Uploading ${attachments.filter((item) => item.file).length} file${attachments.filter((item) => item.file).length > 1 ? "s" : ""
                      }...`
                      : isEditMode
                        ? "Updating request..."
                        : "Submitting request..."
                  }
                />
              )}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                className="h-11 cursor-pointer rounded-lg px-5"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>

              <Button
                type="button"
                className="h-11 cursor-pointer rounded-lg px-6"
                onClick={handleSave}
                disabled={isDisabled}
              >
                {isEditMode ? "Save Changes" : "Submit Request"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
