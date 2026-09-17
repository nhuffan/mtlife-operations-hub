"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ClipboardList,
  ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extractDigits } from "@/lib/shared/number";
import AttachmentLoadingIndicator from "@/components/qa/utils/AttachmentLoadingIndicator";
import {
  compressImageFiles,
  formatFileSize,
  getOversizedFiles,
  truncateMiddleFileName,
} from "@/components/qa/utils/attachmentHelpers";
import {
  calculatePreVat,
  getMissingInvoiceFields,
  resolveInvoiceStatus,
} from "@/lib/features/merchant-invoices/invoices";
import type {
  MerchantInvoiceFormValues,
  MerchantInvoiceImage,
  MerchantInvoiceRow,
} from "./utils/types";
import MoneyText from "./MoneyText";
import { useI18n } from "@/lib/i18n/I18nProvider";

type LocalProofImage = MerchantInvoiceImage & {
  file?: File;
  local_preview_url?: string | null;
  upload_status?: "idle" | "uploading" | "uploaded" | "error";
};

const MAX_PROOF_IMAGES = 2;

const fieldClass =
  "!h-11 h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm shadow-none placeholder:font-medium placeholder:text-muted-foreground/65";

const labelClass =
  "mb-2 block text-xs font-bold text-muted-foreground";

const initialProofImage = (file: File): LocalProofImage => ({
  id: crypto.randomUUID(),
  name: file.name,
  size: file.size,
  type: file.type || "image/*",
  resource_type: "image",
  public_id: "",
  url: "",
  secure_url: "",
  format: null,
  version: null,
  thumbnail_url: null,
  local_preview_url: URL.createObjectURL(file),
  file,
  upload_status: "idle",
});

function mapRemoteProofImages(items?: MerchantInvoiceImage[] | null): LocalProofImage[] {
  return (items ?? []).map((item) => ({
    ...item,
    file: undefined,
    local_preview_url: null,
    upload_status: "uploaded",
  }));
}

function getImageUrl(item?: LocalProofImage | null) {
  return item?.local_preview_url || item?.secure_url || item?.url || "";
}

function formatAmountInput(value: string | number) {
  const digits = extractDigits(value);
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(digits));
}

function normalizeAmountInput(value: string) {
  return extractDigits(value);
}

export default function InvoiceDialog({
  open,
  onOpenChange,
  onSaved,
  onBusyChange,
  invoice,
  existingInvoices,
  nextSequenceNo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  invoice?: MerchantInvoiceRow | null;
  existingInvoices: MerchantInvoiceRow[];
  nextSequenceNo: number;
}) {
  const { t } = useI18n();
  const isEditMode = !!invoice;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const merchantInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextMerchantChangeRef = useRef(false);

  const [sequenceNo, setSequenceNo] = useState(nextSequenceNo);
  const [merchant, setMerchant] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [vatRate, setVatRate] = useState(10);
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [note, setNote] = useState("");
  const [proofImages, setProofImages] = useState<LocalProofImage[]>([]);
  const [issuedLocked, setIssuedLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitStage, setSubmitStage] = useState<"idle" | "uploading_images" | "saving_invoice">("idle");
  const [autoFillNotice, setAutoFillNotice] = useState<{
    merchant: string;
    source: "merchant" | "tax_code";
  } | null>(null);
  const [imageInputMode, setImageInputMode] = useState<"FILE" | "PASTE">("FILE");
  const [showMerchantSuggestions, setShowMerchantSuggestions] = useState(false);
  const [autoFilledLookup, setAutoFilledLookup] = useState<{
    merchant: string;
    taxCode: string;
  } | null>(null);

  const knownTaxRows = useMemo(() => {
    const byTaxCode = new Map<string, MerchantInvoiceRow>();

    existingInvoices.forEach((item) => {
      const key = item.tax_code?.trim();
      if (key && !byTaxCode.has(key)) {
        byTaxCode.set(key, item);
      }
    });

    return Array.from(byTaxCode.values());
  }, [existingInvoices]);

  const getMerchantLookupRows = useCallback((keywordValue: string) => {
    const keyword = keywordValue.trim().toLowerCase();
    if (!keyword) return [];

    return knownTaxRows
      .filter((row) => row.merchant?.trim())
      .filter((row) => {
        const values = [
          row.merchant,
          row.company_name,
          row.tax_code,
          row.invoice_email ?? "",
        ];

        return values.some((value) => value.toLowerCase().includes(keyword));
      })
      .slice(0, 5);
  }, [knownTaxRows]);

  const deferredMerchant = useDeferredValue(merchant);
  const merchantLookupRows = useMemo(
    () => getMerchantLookupRows(deferredMerchant),
    [deferredMerchant, getMerchantLookupRows]
  );

  const numericInvoiceAmount = Number(normalizeAmountInput(invoiceAmount)) || 0;
  const vatBreakdown = calculatePreVat(numericInvoiceAmount, vatRate);
  const currentStatus = resolveInvoiceStatus({
    merchant,
    contract_number: contractNumber,
    company_name: companyName,
    company_address: companyAddress,
    tax_code: taxCode,
    invoice_email: invoiceEmail,
    invoice_amount: numericInvoiceAmount,
    status: issuedLocked ? "issued" : undefined,
  });
  const missingFields = getMissingInvoiceFields({
    merchant,
    contract_number: contractNumber,
    company_name: companyName,
    company_address: companyAddress,
    tax_code: taxCode,
    invoice_email: invoiceEmail,
    invoice_amount: numericInvoiceAmount,
  });

  useEffect(() => {
    if (!open) return;

    if (invoice) {
      setSequenceNo(invoice.sequence_no);
      setMerchant(invoice.merchant ?? "");
      setContractNumber(invoice.contract_number ?? "");
      setInvoiceAmount(invoice.invoice_amount ? formatAmountInput(invoice.invoice_amount) : "");
      setVatRate(Number(invoice.vat_rate ?? 10));
      setCompanyName(invoice.company_name ?? "");
      setCompanyAddress(invoice.company_address ?? "");
      setTaxCode(invoice.tax_code ?? "");
      setInvoiceEmail(invoice.invoice_email ?? "");
      setNote(invoice.note ?? "");
      setProofImages(mapRemoteProofImages(invoice.proof_images));
      setIssuedLocked(invoice.status === "issued");
      setAutoFillNotice(null);
      setImageInputMode("FILE");
      setShowMerchantSuggestions(false);
      setAutoFilledLookup(null);
      setSubmitStage("idle");
      setSaving(false);
      return;
    }

    setSequenceNo(nextSequenceNo);
    setMerchant("");
    setContractNumber("");
    setInvoiceAmount("");
    setVatRate(10);
    setCompanyName("");
    setCompanyAddress("");
    setTaxCode("");
    setInvoiceEmail("");
    setNote("");
    setProofImages([]);
    setIssuedLocked(false);
    setAutoFillNotice(null);
    setImageInputMode("FILE");
    setShowMerchantSuggestions(false);
    setAutoFilledLookup(null);
    setSubmitStage("idle");
    setSaving(false);
  }, [open, invoice, nextSequenceNo]);

  useEffect(() => {
    if (open) return;

    proofImages.forEach((item) => {
      if (item.local_preview_url) URL.revokeObjectURL(item.local_preview_url);
    });
  }, [open, proofImages]);

  function clearAutoFilledInvoiceInfo({
    merchantValue = "",
    taxCodeValue = "",
  }: {
    merchantValue?: string;
    taxCodeValue?: string;
  } = {}) {
    setMerchant(merchantValue);
    setCompanyName("");
    setCompanyAddress("");
    setTaxCode(taxCodeValue);
    setInvoiceEmail("");
    setVatRate(10);
    setAutoFillNotice(null);
    setAutoFilledLookup(null);
    setShowMerchantSuggestions(Boolean(merchantValue.trim()));
  }

  function handleMerchantChange(value: string) {
    if (skipNextMerchantChangeRef.current) {
      skipNextMerchantChangeRef.current = false;
      return;
    }

    if (autoFilledLookup && value !== autoFilledLookup.merchant) {
      clearAutoFilledInvoiceInfo({ merchantValue: value });
      return;
    }

    setMerchant(value);
    setShowMerchantSuggestions(true);
  }

  function handleTaxCodeChange(value: string) {
    if (autoFilledLookup && value !== autoFilledLookup.taxCode) {
      clearAutoFilledInvoiceInfo({ taxCodeValue: value });
      return;
    }

    applyTaxCodeLookup(value);
  }

  function selectFirstMerchantSuggestion(value: string) {
    const firstSuggestion = getMerchantLookupRows(value)[0];
    if (!firstSuggestion) return false;

    replaceWithMerchantLookup(firstSuggestion);
    return true;
  }

  function replaceWithMerchantLookup(row: MerchantInvoiceRow) {
    if (!row.merchant?.trim()) return;

    skipNextMerchantChangeRef.current = true;
    if (merchantInputRef.current) {
      merchantInputRef.current.value = row.merchant;
    }

    applyMerchantLookup(row);
    window.setTimeout(() => {
      skipNextMerchantChangeRef.current = false;
    }, 0);
  }

  function applyTaxCodeLookup(value: string) {
    setTaxCode(value);

    const normalized = value.trim().toLowerCase();
    if (normalized.length < 6) {
      setAutoFillNotice(null);
      setAutoFilledLookup(null);
      return;
    }

    const match = existingInvoices.find(
      (item) => item.tax_code?.trim().toLowerCase() === normalized
    );

    if (!match) {
      setAutoFillNotice(null);
      setAutoFilledLookup(null);
      return;
    }

    setMerchant(match.merchant ?? "");
    setCompanyName(match.company_name ?? "");
    setCompanyAddress(match.company_address ?? "");
    setInvoiceEmail(match.invoice_email ?? "");
    setVatRate(Number(match.vat_rate ?? 10));
    setAutoFilledLookup({
      merchant: match.merchant ?? "",
      taxCode: match.tax_code ?? "",
    });
    setAutoFillNotice({ merchant: match.merchant, source: "tax_code" });
  }

  function applyMerchantLookup(row: MerchantInvoiceRow) {
    if (!row.merchant?.trim()) return;

    setMerchant(row.merchant);
    setCompanyName(row.company_name ?? "");
    setCompanyAddress(row.company_address ?? "");
    setTaxCode(row.tax_code ?? "");
    setInvoiceEmail(row.invoice_email ?? "");
    setVatRate(Number(row.vat_rate ?? 10));
    setShowMerchantSuggestions(false);
    setAutoFilledLookup({
      merchant: row.merchant,
      taxCode: row.tax_code ?? "",
    });
    setAutoFillNotice({ merchant: row.merchant, source: "merchant" });
  }

  const mergeProofImages = useCallback(async (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (!rawFiles.length) return;

    const remainingSlots = MAX_PROOF_IMAGES - proofImages.length;
    if (remainingSlots <= 0) {
      toast.error(`You can upload up to ${MAX_PROOF_IMAGES} proof images.`);
      return;
    }

    const compressedFiles = await compressImageFiles(
      rawFiles.slice(0, remainingSlots)
    );
    const oversizedFiles = getOversizedFiles(compressedFiles);
    if (oversizedFiles.length > 0) {
      toast.error(
        oversizedFiles.map((file) => `${file.name} is still larger than 10 MB after compression.`).join("\n")
      );
    }

    const validFiles = compressedFiles.filter((file) => file.size <= 10 * 1024 * 1024);
    if (!validFiles.length) return;

    setProofImages((prev) => {
      const existing = new Set(prev.map((item) => `${item.name}-${item.size}-${item.type}`));
      const remain = MAX_PROOF_IMAGES - prev.length;
      const next = validFiles
        .filter((file) => !existing.has(`${file.name}-${file.size}-${file.type}`))
        .slice(0, remain)
        .map(initialProofImage);

      return [...prev, ...next];
    });
    toast.success(`Added ${validFiles.length} proof images.`);
  }, [proofImages.length]);

  useEffect(() => {
    if (!open) return;

    function handlePaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((entry) => entry.type.startsWith("image/"))
        .map((entry) => entry.getAsFile())
        .filter((file): file is File => Boolean(file));

      if (!files.length) return;

      void mergeProofImages(files);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open, mergeProofImages]);

  function removeImage(id: string) {
    setProofImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.local_preview_url) URL.revokeObjectURL(target.local_preview_url);
      return prev.filter((item) => item.id !== id);
    });
  }

  async function uploadProofImages(items: LocalProofImage[]) {
    const localItems = items.filter((item) => item.file);
    const uploadedImages: MerchantInvoiceImage[] = [];

    for (const item of localItems) {
      if (!item.file) continue;

      setProofImages((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, upload_status: "uploading" } : entry
        )
      );

      const formData = new FormData();
      formData.append("files", item.file);
      formData.append("folder", "merchant_invoices");

      const response = await fetch("/api/cloudinary/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setProofImages((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, upload_status: "error" } : entry
          )
        );
        throw new Error("Failed to upload invoice proof image.");
      }

      const data = await response.json();
      const [uploaded] = (data.files ?? []) as MerchantInvoiceImage[];
      if (uploaded) uploadedImages.push(uploaded);

      setProofImages((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, upload_status: "uploaded" } : entry
        )
      );
    }

    return uploadedImages;
  }

  async function saveInvoice() {
    if (saving) return;

    setSaving(true);
    onBusyChange?.(true);
    setSubmitStage("idle");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const remoteImages = proofImages
        .filter((item) => !item.file)
        .map<MerchantInvoiceImage>((item) => ({
          id: item.id,
          name: item.name,
          size: item.size,
          type: item.type,
          resource_type: item.resource_type,
          public_id: item.public_id,
          url: item.url,
          secure_url: item.secure_url,
          format: item.format ?? null,
          version: item.version ?? null,
          thumbnail_url: item.thumbnail_url ?? null,
        }));

      const hasLocalImages = proofImages.some((item) => item.file);
      if (hasLocalImages) setSubmitStage("uploading_images");
      const uploadedImages = hasLocalImages ? await uploadProofImages(proofImages) : [];
      const mergedProofImages = [...remoteImages, ...uploadedImages];

      setSubmitStage("saving_invoice");

      const payload: MerchantInvoiceFormValues = {
        id: invoice?.id,
        sequence_no: sequenceNo,
        merchant: merchant.trim(),
        contract_number: contractNumber.trim(),
        invoice_amount: numericInvoiceAmount,
        vat_rate: vatRate,
        company_name: companyName.trim(),
        company_address: companyAddress.trim(),
        tax_code: taxCode.trim(),
        invoice_email: invoiceEmail.trim(),
        note: note.trim() || null,
        proof_images: mergedProofImages,
        status: currentStatus,
        created_at: invoice?.created_at,
      };

      if (isEditMode && invoice?.id) {
        const { error } = await supabase
          .from("merchant_invoices")
          .update({
            sequence_no: payload.sequence_no,
            merchant: payload.merchant,
            contract_number: payload.contract_number || null,
            invoice_amount: payload.invoice_amount,
            vat_rate: payload.vat_rate,
            company_name: payload.company_name,
            company_address: payload.company_address || null,
            tax_code: payload.tax_code,
            invoice_email: payload.invoice_email || null,
            note: payload.note,
            proof_images: payload.proof_images,
            status: payload.status,
            issued_at:
              payload.status === "issued" && invoice.status !== "issued"
                ? new Date().toISOString()
                : invoice.issued_at,
            version: (invoice.version ?? 1) + 1,
          })
          .eq("id", invoice.id);

        if (error) {
          toast.error(error.message || "Could not update the invoice.");
          return;
        }

        toast.success("Invoice updated.");
      } else {
        const { error } = await supabase.from("merchant_invoices").insert({
          sequence_no: payload.sequence_no,
          merchant: payload.merchant,
          contract_number: payload.contract_number || null,
          invoice_amount: payload.invoice_amount,
          vat_rate: payload.vat_rate,
          company_name: payload.company_name,
          company_address: payload.company_address || null,
          tax_code: payload.tax_code,
          invoice_email: payload.invoice_email || null,
          note: payload.note,
          proof_images: payload.proof_images,
          status: payload.status,
          issued_at: payload.status === "issued" ? new Date().toISOString() : null,
          created_by_user_id: user?.id ?? null,
        });

        if (error) {
          toast.error(error.message || "Could not create the invoice.");
          return;
        }

        toast.success("Invoice created.");
      }

      onOpenChange(false);
      await onSaved();
    } catch (error) {
      console.error("save invoice failed:", error);
      toast.error("Could not save the invoice.");
    } finally {
      setSaving(false);
      setSubmitStage("idle");
      onBusyChange?.(false);
    }
  }

  const canSave = Boolean(
    !saving &&
      merchant.trim() &&
      companyName.trim() &&
      taxCode.trim() &&
      numericInvoiceAmount >= 0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-[min(80vw,1180px)] max-w-[calc(100vw-2rem)] min-w-[min(1040px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background p-0 shadow-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b px-6 py-4">
          <div className="mb-2 flex w-fit items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5" />
            No. #{sequenceNo}
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
            {t(isEditMode ? "Update Invoice" : "Create Invoice")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t(isEditMode ? "Update invoice details" : "Create a new invoice")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-2">
          {autoFillNotice && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              {t(
                autoFillNotice.source === "tax_code"
                  ? "Invoice details were filled from the existing tax code ({{merchant}})."
                  : "Invoice details were filled from {{merchant}}.",
                { merchant: autoFillNotice.merchant }
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="relative">
              <label className={labelClass}>
                {t("Merchant (brand/store name)")}{" "}
                <span className="text-destructive">*</span>
              </label>
              <Input
                required
                ref={merchantInputRef}
                value={merchant}
                onChange={(event) => handleMerchantChange(event.target.value)}
                onFocus={() => setShowMerchantSuggestions(true)}
                onKeyDownCapture={(event) => {
                  if (event.key === "Enter" && selectFirstMerchantSuggestion(event.currentTarget.value)) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                onBlur={() => window.setTimeout(() => setShowMerchantSuggestions(false), 120)}
                placeholder={t("Example: Ha Spa, Tokyo Deli...")}
                className={fieldClass}
              />
              {showMerchantSuggestions && merchantLookupRows.length > 0 && (
                <div className="absolute left-0 right-0 top-[72px] z-50 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl">
	                  {merchantLookupRows.map((row) => (
	                    <button
	                      key={row.id}
	                      type="button"
	                      onMouseDown={(event) => event.preventDefault()}
	                      onClick={() => replaceWithMerchantLookup(row)}
                      className="flex w-full cursor-pointer flex-col rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent hover:text-accent-foreground"
                    >
                      <span className="font-semibold">{row.merchant}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.company_name} · {t("Tax ID")} {row.tax_code}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>
                {t("Tax Code")} <span className="text-destructive">*</span>
              </label>
              <Input
                required
                value={taxCode}
                onChange={(event) => handleTaxCodeChange(event.target.value)}
                placeholder={t("Enter tax code (e.g. 318954777)...")}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>
                {t("Invoice Company Name")} <span className="text-destructive">*</span>
              </label>
              <Input
                required
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="COMPANY LTD..."
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t("Invoice Address")}</label>
              <Input
                value={companyAddress}
                onChange={(event) => setCompanyAddress(event.target.value)}
                placeholder={t("Address shown on the invoice...")}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>{t("Email")}</label>
              <Input
                type="email"
                value={invoiceEmail}
                onChange={(event) => setInvoiceEmail(event.target.value)}
                placeholder="email@domain.com"
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t("Contract Number")}</label>
              <Input
                value={contractNumber}
                onChange={(event) => setContractNumber(event.target.value)}
                placeholder={t("Example: NO.KADOB")}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>
                {t("VAT Rate (%)")} <span className="text-destructive">*</span>
              </label>
              <div className="flex h-11 items-center gap-2">
                {[8, 10, 0].map((rate) => (
                  <Button
                    key={rate}
                    type="button"
                    variant={vatRate === rate ? "default" : "outline"}
                    size="sm"
                    onClick={() => setVatRate(rate)}
                    className="cursor-pointer"
                  >
                    {rate}%
                  </Button>
                ))}
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={vatRate}
                  onChange={(event) => setVatRate(Number(event.target.value) || 0)}
                  className="h-9 w-20"
                />
                <span className="text-xs font-bold text-muted-foreground">%</span>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                {t("Invoice Amount (VAT Included)")}{" "}
                <span className="text-destructive">*</span>
              </label>
              <Input
                inputMode="numeric"
                required
                value={invoiceAmount}
                onChange={(event) => setInvoiceAmount(formatAmountInput(event.target.value))}
                placeholder="62.243.200 ₫"
                className={`${fieldClass} font-extrabold placeholder:font-medium`}
              />
            </div>
          </div>

          {Boolean(invoiceAmount) && (
            <div className="space-y-1.5 rounded-xl border bg-muted/40 p-3 text-xs text-foreground">
              <div className="flex items-center justify-between gap-4">
                <span>
                  {t("1. Amount before VAT (invoice amount / {{rate}}%):", {
                    rate: 100 + (vatRate || 0),
                  })}
                </span>
                <MoneyText
                  amount={vatBreakdown.preVatAmount}
                  className="font-mono text-xs font-bold"
                  currencyClassName="relative top-[0.14em]"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>{t("2. VAT amount ({{rate}}%):", { rate: vatRate })}</span>
                <MoneyText
                  amount={vatBreakdown.vatAmount}
                  className="font-mono text-xs font-bold"
                  currencyClassName="relative top-[0.14em]"
                />
              </div>
              <div className="flex items-center justify-between gap-4 border-t pt-1.5 font-bold text-primary">
                <span>{t("3. Total invoice amount (VAT included):")}</span>
                <MoneyText
                  amount={numericInvoiceAmount}
                  className="font-mono text-sm font-extrabold"
                  currencyClassName="relative top-[0.14em]"
                />
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>{t("Note")}</label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("Enter an invoice note...")}
              className="min-h-[82px] resize-none rounded-lg border-input bg-background px-3 py-2 text-sm shadow-none placeholder:font-medium placeholder:text-muted-foreground/65"
            />
          </div>

          <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                {t("Invoice Status")}
              </label>
              <span
                className={[
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold",
                  currentStatus === "issued"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : currentStatus === "ready"
                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300"
                      : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300",
                ].join(" ")}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {currentStatus === "issued"
                  ? t("🔒 Issued")
                  : currentStatus === "ready"
                    ? t("Ready to issue")
                    : t("Not ready")}
              </span>
            </div>

            <div className="text-xs leading-relaxed text-muted-foreground">
              {currentStatus === "issued" ? (
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  • {t("This invoice is issued and locked. It cannot return to Not ready or Ready to issue.")}
                </span>
              ) : missingFields.length === 0 ? (
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  • {t("When all details are complete (merchant, contract number, company, address, tax code, email, and amount), the invoice automatically moves to Ready to issue.")}
                </span>
              ) : (
                <div className="space-y-1 font-medium text-red-700 dark:text-red-300">
                  <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold dark:border-red-900/70 dark:bg-red-950/40">
                    📌 {t("Missing fields:")}{" "}
                    <span className="underline">
                      {missingFields.map((field) => t(field)).join(", ")}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {isEditMode && invoice?.status !== "issued" && (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Input
                  type="checkbox"
                  checked={issuedLocked}
                  onChange={(event) => setIssuedLocked(event.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                {t("Mark as Issued")}
              </label>
            )}
          </div>

          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <ImageIcon className="h-4 w-4 text-primary" />
                {t("Transaction Proof Images")}
              </label>
              <div className="flex items-center gap-1 text-[11px]">
                {[
                  ["FILE", "Upload files"],
                  ["PASTE", "Paste image (Ctrl+V)"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setImageInputMode(mode as "FILE" | "PASTE")}
                    className={[
                      "cursor-pointer rounded px-2 py-0.5 font-medium transition",
                      imageInputMode === mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    ].join(" ")}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files?.length) void mergeProofImages(event.target.files);
                  event.target.value = "";
                }}
              />

              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (event.dataTransfer.files?.length) void mergeProofImages(event.dataTransfer.files);
                }}
                className="flex min-h-[120px] flex-col justify-center rounded-xl border border-dashed bg-background p-4 text-center transition hover:border-primary/50"
              >
                {proofImages.length > 0 ? (
                  <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
                    {proofImages.map((item) => (
                      <div
                        key={item.id}
                        className="relative flex h-[112px] min-w-0 items-center gap-3 rounded-lg border bg-background p-2 pr-10 text-left shadow-xs"
                      >
                        <img
                          src={getImageUrl(item)}
                          alt={item.name}
                          className="h-24 w-24 shrink-0 rounded-md border object-cover object-top"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-foreground">
                            {truncateMiddleFileName(item.name, 28)}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {formatFileSize(item.size)}
                          </div>
                          {item.upload_status === "uploading" && (
                            <div className="mt-1 text-[11px] font-semibold text-primary">
                              {t("Uploading...")}
                            </div>
                          )}
                          {item.upload_status === "error" && (
                            <div className="mt-1 text-[11px] font-semibold text-destructive">
                              {t("Upload failed")}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="destructive"
                          onClick={() => removeImage(item.id)}
                          disabled={saving}
                          className="absolute right-2 top-2 cursor-pointer"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}

                    {proofImages.length < MAX_PROOF_IMAGES && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={saving}
                        className="flex h-[112px] cursor-pointer items-center justify-center rounded-lg border border-dashed bg-background text-sm font-semibold text-muted-foreground transition hover:border-primary/50 hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        + {t("Add images")}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer font-bold text-primary hover:underline"
                      >
                        {t("Upload images")}
                      </button>
                      {t(", drag and drop up to 2 images here, or press")}{" "}
                      <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        Ctrl + V
                      </kbd>{" "}
                      {t("to paste")}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer"
                    >
                      <UploadCloud className="h-4 w-4" />
                      {t("Upload files")}
                    </Button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        <DialogFooter className="border-t bg-muted/40 px-6 py-4">
          <div className="flex min-h-10 flex-1 items-center">
            {saving && (
              <AttachmentLoadingIndicator
                text={
                  submitStage === "uploading_images"
                    ? t("Uploading {{count}} images...", {
                        count: proofImages.filter((item) => item.file).length,
                      })
                    : t("Saving invoice...")
                }
              />
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="cursor-pointer"
          >
            {t("Cancel")}
          </Button>
          <Button onClick={saveInvoice} disabled={!canSave} className="cursor-pointer">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t(isEditMode ? "Save Changes" : "Create Invoice")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
