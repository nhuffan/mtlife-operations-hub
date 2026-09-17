"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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
import { Badge } from "@/components/ui/badge";

import type { MasterCategory, MasterItem } from "@/lib/features/masters/masters";
import {
  createMaster,
  deleteMaster,
  fetchMasters,
  updateMaster,
} from "@/lib/features/masters/masters";
import { MASTER_CATEGORY_UI } from "@/lib/features/masters/masterUi";
import { supabase } from "@/lib/integrations/supabase/client";
import { invalidateMastersCache } from "@/lib/features/masters/useMasters";
import { extractDigits } from "@/lib/shared/number";
import { db } from "@/lib/features/performance/offlineDb";
import { syncPending } from "@/lib/features/performance/syncPending";
import { fetchBdMonthlyLevels, getBdLevelsForMonth } from "@/lib/features/performance/bdMonthlyLevels";
import { Pencil, Trash2, ArrowUpDown, CalendarDays, Plus, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { exportBdPersonnelToExcel } from "./helpers/exportBdPersonnelExcel";

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function generateCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${monthNumber}/${year}`;
}

function getMonthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const nextMonth = new Date(year, monthNumber, 1);
  const end = nextMonth.toISOString().slice(0, 10);
  return { start, end };
}

function getNearestMonth(months: string[], targetMonth: string) {
  if (months.length === 0) return null;

  const [targetYear, targetMonthNumber] = targetMonth.split("-").map(Number);
  if (!targetYear || !targetMonthNumber) return months[0];

  const targetIndex = targetYear * 12 + targetMonthNumber;

  return [...months].sort((a, b) => {
    const [aYear, aMonth] = a.split("-").map(Number);
    const [bYear, bMonth] = b.split("-").map(Number);
    const aDistance = Math.abs(aYear * 12 + aMonth - targetIndex);
    const bDistance = Math.abs(bYear * 12 + bMonth - targetIndex);

    return aDistance - bDistance || b.localeCompare(a);
  })[0];
}

function getMedalByIndex(index: number) {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return null;
}

type SortDirection = "asc" | "desc";
type BdSortField = "points" | "money" | "newCustomers" | "newHotList";
type BdLevelMonthlyKpiRow = {
  id: string;
  bd_level_id: string;
  month_key: string;
  kpi: number;
};

export default function MasterManager({
  category,
  isAdmin,
  title,
}: {
  category: MasterCategory;
  isAdmin: boolean;
  title: string;
}) {
  const ui = MASTER_CATEGORY_UI[category];
  const ALL_TIME = "__all__";

  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterItem | null>(null);

  const [label, setLabel] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [showInUseDialog, setShowInUseDialog] = useState(false);

  const [totals, setTotals] = useState<
    Record<string, { points: number; money: number; packageAmount: number | null }>
  >({});

  const [trackingTotals, setTrackingTotals] = useState<
    Record<string, { newCustomers: number; newHotList: number }>
  >({});

  const [monthOptions, setMonthOptions] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(ALL_TIME);
  const [monthlyKpis, setMonthlyKpis] = useState<Record<string, number>>({});
  const [kpiInputs, setKpiInputs] = useState<Record<string, string>>({});
  const [savingKpiId, setSavingKpiId] = useState<string | null>(null);
  const [bdLevels, setBdLevels] = useState<MasterItem[]>([]);
  const [bdLevelByBdId, setBdLevelByBdId] = useState<Record<string, string>>({});
  const [savingBdLevelId, setSavingBdLevelId] = useState<string | null>(null);

  const [bdSortField, setBdSortField] = useState<BdSortField>("points");
  const [bdSortDirection, setBdSortDirection] =
    useState<SortDirection>("desc");
  const suppressRecordsRefreshUntilRef = useRef(0);

  async function refresh() {
    setLoading(true);

    try {
      const data = await fetchMasters(category);
      data.sort((a, b) => a.label.localeCompare(b.label));
      setItems(data);

      if (category === "bd" || category === "bd_level") {
        const bdLevelItems = await fetchMasters("bd_level");
        bdLevelItems.sort((a, b) => a.label.localeCompare(b.label));
        setBdLevels(bdLevelItems);

        const { data: records, error: recordsError } = await supabase
          .from("records")
          .select("bd_id, points, money, package_amount, event_date");

        const isBdCategory = category === "bd";
        const { data: trackingRows, error: trackingError } = isBdCategory
          ? await supabase
            .from("customer_tracking")
            .select("bd_id, event_date, branch, in_hot_list, combo_voucher, offer_ads")
          : { data: [], error: null };

        if (recordsError) {
          console.error("Failed to fetch records:", recordsError);
        }

        if (trackingError) {
          console.error("Failed to fetch customer_tracking:", trackingError);
        }

        const allRecords = records ?? [];
        const allTrackingRows = trackingRows ?? [];

        const months = Array.from(
          new Set(
            isBdCategory
              ? [
                ...allRecords.map((r) => r.event_date?.slice(0, 7)),
                ...allTrackingRows.map((r) => r.event_date?.slice(0, 7)),
              ].filter(Boolean) as string[]
              : allRecords
                .map((r) => r.event_date?.slice(0, 7))
                .filter(Boolean) as string[]
          )
        ).sort((a, b) => b.localeCompare(a));

        setMonthOptions(months);

        const filteredRecords =
          selectedMonth === ALL_TIME
            ? allRecords
            : allRecords.filter(
              (r) => r.event_date?.slice(0, 7) === selectedMonth
            );

        const map: Record<
          string,
          { points: number; money: number; packageAmount: number | null }
        > = {};

        filteredRecords.forEach((r) => {
          if (!r.bd_id) return;

          if (!map[r.bd_id]) {
            map[r.bd_id] = { points: 0, money: 0, packageAmount: null };
          }

          map[r.bd_id].points += r.points ?? 0;
          map[r.bd_id].money += r.money ?? 0;

          if (r.package_amount != null) {
            map[r.bd_id].packageAmount =
              (map[r.bd_id].packageAmount ?? 0) + r.package_amount;
          }

        });

        setTotals(category === "bd" ? map : {});

        if (isBdCategory) {
          const filteredTrackingRows =
            selectedMonth === ALL_TIME
              ? allTrackingRows
              : allTrackingRows.filter(
                (r) => r.event_date?.slice(0, 7) === selectedMonth
              );

          const trackingMap: Record<
            string,
            { newCustomers: number; newHotList: number }
          > = {};

          filteredTrackingRows.forEach((r) => {
            if (!r.bd_id) return;
            if (r.combo_voucher !== true && r.offer_ads !== true) return;

            if (!trackingMap[r.bd_id]) {
              trackingMap[r.bd_id] = {
                newCustomers: 0,
                newHotList: 0,
              };
            }

            trackingMap[r.bd_id].newCustomers += r.branch ?? 0;
            trackingMap[r.bd_id].newHotList += r.in_hot_list ?? 0;
          });

          setTrackingTotals(trackingMap);
        } else {
          setTrackingTotals({});
        }

        if (selectedMonth !== ALL_TIME) {
          try {
            const monthlyLevelMap = await fetchBdMonthlyLevels([selectedMonth]);
            const bdIds =
              category === "bd"
                ? data.map((item) => item.id)
                : bdLevelItems.map((item) => item.id);

            setBdLevelByBdId(
              getBdLevelsForMonth(selectedMonth, bdIds, monthlyLevelMap)
            );
          } catch (monthlyLevelError) {
            console.error("Failed to fetch bd monthly levels:", monthlyLevelError);
            setBdLevelByBdId({});
          }
        } else {
          setBdLevelByBdId({});
        }

        if (selectedMonth !== ALL_TIME) {
          const { data: kpiRows, error: kpiError } = await supabase
            .from("bd_level_monthly_kpis")
            .select("id, bd_level_id, month_key, kpi")
            .eq("month_key", selectedMonth);

          if (kpiError) {
            console.error("Failed to fetch bd level monthly kpis:", kpiError);
            setMonthlyKpis({});
            setKpiInputs({});
          } else {
            const nextMap = Object.fromEntries(
              ((kpiRows ?? []) as BdLevelMonthlyKpiRow[]).map((row) => [
                row.bd_level_id,
                row.kpi ?? 0,
              ])
            );

            setMonthlyKpis(nextMap);
            setKpiInputs(
              Object.fromEntries(
                Object.entries(nextMap).map(([bdId, value]) => [
                  bdId,
                  value > 0 ? value.toLocaleString("en-US") : "",
                ])
              )
            );
          }
        } else {
          setMonthlyKpis({});
          setKpiInputs({});
        }
      } else {
        setTotals({});
        setTrackingTotals({});
        setMonthOptions([]);
        setMonthlyKpis({});
        setKpiInputs({});
        setBdLevels([]);
        setBdLevelByBdId({});
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [category, selectedMonth]);

  useEffect(() => {
    if (category !== "bd" && category !== "bd_level") return;
    if (category === "bd" && selectedMonth === ALL_TIME) return;
    if (monthOptions.includes(selectedMonth)) return;

    const fallbackMonth = getNearestMonth(monthOptions, selectedMonth);
    if (fallbackMonth) {
      setSelectedMonth(fallbackMonth);
    }
  }, [category, monthOptions, selectedMonth]);

  useEffect(() => {
    if (category !== "bd" && category !== "bd_level") return;

    const channel = supabase
      .channel(`${category}-manager-realtime`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "records",
        },
        () => {
          if (
            category === "bd" &&
            Date.now() < suppressRecordsRefreshUntilRef.current
          ) {
            return;
          }
          refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "masters",
        },
        () => {
          refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bd_level_monthly_kpis",
        },
        () => {
          refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bd_monthly_levels",
        },
        () => {
          refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customer_tracking",
        },
        () => {
          if (category === "bd") {
            refresh();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [category, selectedMonth]);

  useEffect(() => {
    const handler = () => refresh();

    window.addEventListener("records-updated", handler);
    window.addEventListener("customer-tracking-updated", handler);

    return () => {
      window.removeEventListener("records-updated", handler);
      window.removeEventListener("customer-tracking-updated", handler);
    };
  }, [category, selectedMonth]);

  function openCreate() {
    setEditing(null);
    setLabel("");
    setIsActive(true);
    setErrorMessage("");
    setOpen(true);
  }

  function openEdit(item: MasterItem) {
    setEditing(item);
    setLabel(item.label);
    setIsActive(item.is_active);
    setErrorMessage("");
    setOpen(true);
  }

  const isDuplicateName = useMemo(() => {
    const normalized = normalizeName(label);
    if (!normalized) return false;

    return items.some((item) => {
      if (editing && item.id === editing.id) return false;
      return normalizeName(item.label) === normalized;
    });
  }, [items, label, editing]);

  useEffect(() => {
    if (!label.trim()) {
      setErrorMessage("");
      return;
    }

    if (isDuplicateName) {
      setErrorMessage(`${ui.singular} name already exists.`);
    } else {
      setErrorMessage("");
    }
  }, [label, isDuplicateName, ui.singular]);

  const isSaveDisabled = !label.trim() || isDuplicateName;

  const sortedItems = useMemo(() => {
    const arr = [...items];

    if (category !== "bd") {
      return arr;
    }

    // Helper: does this BD have any records in the selected month scope?
    function hasAnyRecord(id: string) {
      const monthData = totals[id];
      const monthTracking = trackingTotals[id];
      const hasRecords =
        (monthData?.points ?? 0) > 0 ||
        (monthData?.money ?? 0) > 0 ||
        (monthData?.packageAmount ?? 0) > 0 ||
        (monthTracking?.newCustomers ?? 0) > 0 ||
        (monthTracking?.newHotList ?? 0) > 0;
      return hasRecords;
    }

    // Hide inactive BD who have no records in the selected month
    const visible = arr.filter(
      (item) => item.is_active || hasAnyRecord(item.id)
    );

    function getSortValue(id: string, field: BdSortField) {
      switch (field) {
        case "newCustomers":
          return trackingTotals[id]?.newCustomers ?? 0;
        case "newHotList":
          return trackingTotals[id]?.newHotList ?? 0;
        case "money":
          return totals[id]?.money ?? 0;
        case "points":
        default:
          return totals[id]?.points ?? 0;
      }
    }

    visible.sort((a, b) => {
      const primaryA = getSortValue(a.id, bdSortField);
      const primaryB = getSortValue(b.id, bdSortField);

      if (primaryA !== primaryB) {
        return bdSortDirection === "desc"
          ? primaryB - primaryA
          : primaryA - primaryB;
      }

      const ALL_FIELDS = [
        "newCustomers",
        "newHotList",
        "points",
        "money",
      ] as const;

      const fallbackFields = ALL_FIELDS.filter(
        (field) => field !== bdSortField
      );

      for (const field of fallbackFields) {
        const fallbackA = getSortValue(a.id, field);
        const fallbackB = getSortValue(b.id, field);

        if (fallbackA !== fallbackB) {
          return bdSortDirection === "desc"
            ? fallbackB - fallbackA
            : fallbackA - fallbackB;
        }
      }

      return a.label.localeCompare(b.label);
    });

    return visible;
  }, [items, totals, trackingTotals, category, bdSortField, bdSortDirection]);

  const bdMedalMap = useMemo(() => {
    if (category !== "bd") return {};

    function getSortValue(id: string, field: BdSortField) {
      switch (field) {
        case "newCustomers":
          return trackingTotals[id]?.newCustomers ?? 0;
        case "newHotList":
          return trackingTotals[id]?.newHotList ?? 0;
        case "money":
          return totals[id]?.money ?? 0;
        case "points":
        default:
          return totals[id]?.points ?? 0;
      }
    }

    const map: Record<string, string> = {};

    const rankedItems = sortedItems.filter((item) => {
      const value = getSortValue(item.id, bdSortField);
      return value > 0;
    });

    const medalTargets =
      bdSortDirection === "desc"
        ? rankedItems.slice(0, 3)
        : rankedItems.slice(-3).reverse();

    medalTargets.forEach((item, index) => {
      const medal = getMedalByIndex(index);
      if (medal) {
        map[item.id] = medal;
      }
    });

    return map;
  }, [category, sortedItems, bdSortField, bdSortDirection, totals, trackingTotals]);

  async function onSave() {
    if (isSaveDisabled) return;

    const trimmedLabel = label.trim();

    if (editing) {
      await updateMaster(editing.id, {
        label: trimmedLabel,
        is_active: isActive,
      });
    } else {
      const generatedCode = generateCode(trimmedLabel);

      await createMaster({
        category,
        code: generatedCode,
        label: trimmedLabel,
        sort_order: items.length + 1,
        is_active: true,
      });
    }

    invalidateMastersCache(category);
    await refresh();
    window.dispatchEvent(new Event("masters-updated"));

    setOpen(false);
    setLabel("");
    setErrorMessage("");
  }

  async function onDelete(id: string) {
    if (category === "bd") {
      // Soft-delete: set is_active = false instead of hard delete
      await updateMaster(id, { is_active: false });
      invalidateMastersCache(category);
      await refresh();
      window.dispatchEvent(new Event("masters-updated"));
      return;
    }

    const columnMap: Record<MasterCategory, string> = {
      bd: "bd_id",
      bd_level: "bd_level_id",
      customer_type: "customer_type_id",
      point_type: "point_type_id",
    };

    const column = columnMap[category];

    const { count, error } = await supabase
      .from("records")
      .select("*", { count: "exact", head: true })
      .eq(column, id);

    if (error) {
      console.error("Failed to check related records:", error);
      return;
    }

    if ((count ?? 0) > 0) {
      setShowInUseDialog(true);
      return;
    }

    await deleteMaster(id);

    invalidateMastersCache(category);
    await refresh();
    window.dispatchEvent(new Event("masters-updated"));
  }

  async function saveMonthlyKpi(bdLevelId: string) {
    if (category !== "bd_level" || selectedMonth === ALL_TIME) return;

    const rawValue = kpiInputs[bdLevelId] ?? "";
    const digits = extractDigits(rawValue);
    const kpiValue = digits ? Number(digits) : 0;

    setSavingKpiId(bdLevelId);

    try {
      const { error } = await supabase.from("bd_level_monthly_kpis").upsert(
        {
          bd_level_id: bdLevelId,
          month_key: selectedMonth,
          kpi: kpiValue,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "bd_level_id,month_key",
        }
      );

      if (error) {
        toast.error("Failed to save KPI.");
        return;
      }

      setMonthlyKpis((prev) => ({
        ...prev,
        [bdLevelId]: kpiValue,
      }));

      setKpiInputs((prev) => ({
        ...prev,
        [bdLevelId]: kpiValue > 0 ? kpiValue.toLocaleString("en-US") : "",
      }));

      toast.success("KPI updated successfully.");
    } finally {
      setSavingKpiId(null);
    }
  }

  async function saveBdMonthlyLevel(bdId: string, bdLevelId: string) {
    if (category !== "bd" || selectedMonth === ALL_TIME) return;

    setSavingBdLevelId(bdId);

    try {
      const { start, end } = getMonthRange(selectedMonth);

      if (!bdLevelId) {
        const { error } = await supabase
          .from("bd_monthly_levels")
          .delete()
          .eq("bd_id", bdId)
          .eq("month_key", selectedMonth);

        if (error) {
          toast.error("Failed to update BD level.");
          return false;
        }

        setBdLevelByBdId((prev) => {
          const next = { ...prev };
          delete next[bdId];
          return next;
        });
        window.dispatchEvent(new Event("bd-monthly-levels-updated"));
        window.dispatchEvent(new Event("records-updated"));
        return true;
      }

      const { error } = await supabase.from("bd_monthly_levels").upsert(
        {
          bd_id: bdId,
          bd_level_id: bdLevelId,
          month_key: selectedMonth,
        },
        {
          onConflict: "bd_id,month_key",
        }
      );

      if (error) {
        toast.error("Failed to update BD level.");
        return false;
      }

      setBdLevelByBdId((prev) => ({
        ...prev,
        [bdId]: bdLevelId,
      }));
      window.dispatchEvent(new Event("bd-monthly-levels-updated"));

      const { error: recordsError } = await supabase
        .from("records")
        .update({ bd_level_id: bdLevelId })
        .eq("bd_id", bdId)
        .gte("event_date", start)
        .lt("event_date", end);

      if (recordsError) {
        toast.error("BD level was saved, but performance records failed to update.");
        return false;
      }

      const localRows = await db.records
        .where("bd_id")
        .equals(bdId)
        .toArray();

      await Promise.all(
        localRows
          .filter((row) => !row.deleted && row.event_date >= start && row.event_date < end)
          .map((row) =>
            db.records.update(row.id, {
              bd_level_id: bdLevelId,
              sync_status: "pending",
              updated_at_local: Date.now(),
            })
          )
      );

      if (navigator.onLine) {
        await syncPending();
      }

      suppressRecordsRefreshUntilRef.current = Date.now() + 1500;
      window.dispatchEvent(new Event("performance-records-updated"));
      return true;
    } finally {
      setSavingBdLevelId(null);
    }
  }

  function handleExportBdPersonnel() {
    exportBdPersonnelToExcel(sortedItems, {
      title: "BD Personnel",
      selectedMonthLabel:
        selectedMonth === ALL_TIME ? "All Time" : formatMonthLabel(selectedMonth),
      showMonthlyColumns: selectedMonth !== ALL_TIME,
      bdLevelByBdId,
      bdLevels,
      monthlyKpis,
      totals,
      trackingTotals,
    });
  }

  function renderTable(list: MasterItem[], startIndex: number) {
    return (
      <div className="overflow-hidden rounded-xl border">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-[40px] p-2 pl-5 text-left">#</th>
                <th className="w-[140px] p-2 text-center">Name</th>

                {category === "bd" && (
                  <>
                    {selectedMonth !== ALL_TIME && (
                      <th className="w-[140px] p-2 text-center">BD Level</th>
                    )}
                    <th className="w-[130px] p-2 text-center">New Customers</th>
                    <th className="w-[130px] p-2 text-center">New In Hot List</th>
                    <th className="w-[130px] p-2 text-center">Points</th>
                    {selectedMonth !== ALL_TIME && (
                      <th className="w-[130px] p-2 text-center">Performance</th>
                    )}
                    <th className="w-[130px] p-2 text-center">Bonus</th>
                    <th className="w-[140px] p-2 text-center">Package Amount</th>
                  </>
                )}

                {category === "bd_level" && selectedMonth !== ALL_TIME && (
                  <th className="w-[160px] p-2 text-center">KPI</th>
                )}

                {isAdmin && (
                  <th className="w-[100px] p-2 pr-5 text-right">Action</th>
                )}
              </tr>
            </thead>

            <tbody>
              {list.map((it, index) => {
                const realIndex = startIndex + index;

                const displayRank =
                  category === "bd" && bdSortDirection === "asc"
                    ? sortedItems.length - realIndex
                    : realIndex + 1;

                return (
                  <tr
                    key={it.id}
                    className="border-t odd:bg-muted/40 even:bg-background"
                  >
                    {/* # */}
                    <td className="p-2 pl-5 text-left text-muted-foreground">
                      {category === "bd" && bdMedalMap[it.id] ? (
                        <span className="text-base leading-none">
                          {bdMedalMap[it.id]}
                        </span>
                      ) : (
                        displayRank
                      )}
                    </td>

                    {/* Name */}
                    <td className="truncate p-2 text-center" title={it.label}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{it.label}</span>
                        {!it.is_active && (
                          <Badge
                            className="
      inline-flex items-center gap-1.5
      rounded-lg
      bg-red-50
      dark:bg-red-950/40
      px-2.5 py-1
      text-xs font-semibold
      text-red-600
      dark:text-red-300
      border-0
      shadow-none
    "
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 dark:bg-red-400" />
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </td>

                    {category === "bd" && (
                      <>
                        {selectedMonth !== ALL_TIME && (
                          <td className="p-2 text-center">
                            {(() => {
                              const currentLevelId = bdLevelByBdId[it.id] ?? "";
                              if (!isAdmin) {
                                const levelLabel =
                                  bdLevels.find((level) => level.id === currentLevelId)?.label;
                                return levelLabel ?? "—";
                              }

                              return (
                                <Select
                                  value={currentLevelId || "__none__"}
                                  onValueChange={(value) => {
                                    const nextLevelId = value === "__none__" ? "" : value;
                                    void saveBdMonthlyLevel(it.id, nextLevelId);
                                  }}
                                  disabled={savingBdLevelId === it.id}
                                >
                                  <SelectTrigger className="mx-auto h-8 w-[120px]">
                                    <SelectValue placeholder="Select level" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">No Level</SelectItem>
                                    {bdLevels.map((level) => (
                                      <SelectItem key={level.id} value={level.id}>
                                        {level.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            })()}
                          </td>
                        )}

                        <td className="p-2 text-center tabular-nums">
                          {(trackingTotals[it.id]?.newCustomers ?? 0).toLocaleString("en-US")}
                        </td>

                        <td className="p-2 text-center tabular-nums">
                          {(trackingTotals[it.id]?.newHotList ?? 0).toLocaleString("en-US")}
                        </td>

                        <td className="p-2 text-center tabular-nums">
                          {(totals[it.id]?.points ?? 0).toLocaleString("en-US")}
                        </td>

                        {selectedMonth !== ALL_TIME && (
                          <td className="p-2 text-center tabular-nums">
                            {(() => {
                              const points = totals[it.id]?.points ?? 0;
                              const bdLevelId = bdLevelByBdId[it.id];
                              const kpi = bdLevelId ? monthlyKpis[bdLevelId] ?? 0 : 0;

                              if (!kpi) return "—";

                              const performance = (points / kpi) * 100;
                              return `${performance.toFixed(1)}%`;
                            })()}
                          </td>
                        )}

                        <td className="p-2 text-center tabular-nums">
                          {(totals[it.id]?.money ?? 0).toLocaleString("en-US")}
                        </td>

                        <td className="p-2 text-center tabular-nums">
                          {(() => {
                            const packageAmount = totals[it.id]?.packageAmount;
                            return packageAmount != null
                              ? packageAmount.toLocaleString("en-US")
                              : "—";
                          })()}
                        </td>
                      </>
                    )}

                    {category === "bd_level" && selectedMonth !== ALL_TIME && (
                      <td className="p-2 text-center tabular-nums">
                        {isAdmin ? (
                          <Input
                            value={kpiInputs[it.id] ?? ""}
                            inputMode="numeric"
                            placeholder="Enter KPI"
                            className="mx-auto h-8 max-w-[140px] text-center"
                            disabled={savingKpiId === it.id}
                            onChange={(e) => {
                              const digits = extractDigits(e.target.value);
                              setKpiInputs((prev) => ({
                                ...prev,
                                [it.id]: digits
                                  ? Number(digits).toLocaleString("en-US")
                                  : "",
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void saveMonthlyKpi(it.id);
                              }
                            }}
                          />
                        ) : (
                          monthlyKpis[it.id]?.toLocaleString("en-US") || "—"
                        )}
                      </td>
                    )}

                    {/* Action */}
                    {isAdmin && (
                      <td className="p-2 pr-5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 cursor-pointer"
                            onClick={() => openEdit(it)}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 cursor-pointer"
                            onClick={() => onDelete(it.id)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {(category === "bd" || category === "bd_level") && (
            <>
              {category === "bd" && (
                <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border bg-transparent px-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />

                  <div className="w-[140px]">
                    <Select
                      value={bdSortField}
                      onValueChange={(value) => setBdSortField(value as BdSortField)}
                    >
                      <SelectTrigger className="h-8 border-0 bg-transparent px-2 shadow-none dark:bg-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newCustomers">New Customers</SelectItem>
                        <SelectItem value="newHotList">New In Hot List</SelectItem>
                        <SelectItem value="points">Points</SelectItem>
                        <SelectItem value="money">Bonus</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-[110px]">
                    <Select
                      value={bdSortDirection}
                      onValueChange={(value) =>
                        setBdSortDirection(value as SortDirection)
                      }
                    >
                      <SelectTrigger className="h-8 border-0 bg-transparent px-2 shadow-none dark:bg-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">High → Low</SelectItem>
                        <SelectItem value="asc">Low → High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="shrink-0">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="inline-flex h-9 min-w-[140px] w-auto gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>

                  <SelectContent>
                    {category === "bd" && (
                      <SelectItem value={ALL_TIME}>All Time</SelectItem>
                    )}

                    {monthOptions.map((month) => (
                      <SelectItem key={month} value={month}>
                        {formatMonthLabel(month)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {category === "bd" && (
            <Button
              variant="outline"
              className="flex h-9 cursor-pointer items-center gap-2"
              onClick={handleExportBdPersonnel}
              disabled={loading || sortedItems.length === 0}
            >
              <Download className="h-4 w-4" />
              Export Data
            </Button>
          )}

          {isAdmin && (
            <Button
              className="flex h-9 cursor-pointer items-center gap-2"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              {ui.addButton}
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/55 backdrop-blur-[1px]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {items.length === 0 ? (
          <div className="min-h-[240px] rounded-xl border p-4 text-sm text-muted-foreground">
            {!loading && "No data"}
          </div>
        ) : (
          renderTable(sortedItems, 0)
        )}
      </div>

      {isAdmin && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold tracking-tight">
                {editing ? ui.editDialogTitle : ui.addDialogTitle}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm font-medium text-foreground">
                  {ui.fieldLabel}
                </p>

                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={ui.fieldPlaceholder}
                />

                {errorMessage && (
                  <p className="mt-1 text-sm text-destructive">
                    {errorMessage}
                  </p>
                )}
              </div>

              {editing && category === "bd" && (
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">Active</span>
                    <span className="text-xs text-muted-foreground">
                      Inactive users disappear from selection lists
                    </span>
                  </div>
                  <Switch
                    checked={isActive}
                    onCheckedChange={setIsActive}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="secondary"
                className="cursor-pointer"
                onClick={() => {
                  setOpen(false);
                  setErrorMessage("");
                }}
              >
                Cancel
              </Button>

              <Button
                className="cursor-pointer"
                onClick={onSave}
                disabled={isSaveDisabled}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isAdmin && (
        <Dialog open={showInUseDialog} onOpenChange={setShowInUseDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Cannot Delete
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
              This type is currently used in existing records.
              <br />
              <br />
              Please go to the <b>Home</b> page and delete those records first.
            </p>

            <DialogFooter>
              <Button
                className="cursor-pointer"
                onClick={() => setShowInUseDialog(false)}
              >
                OK
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
