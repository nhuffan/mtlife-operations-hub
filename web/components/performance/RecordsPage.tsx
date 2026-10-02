"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/integrations/supabase/client";
import { db } from "@/lib/features/performance/offlineDb";
import { syncPending } from "@/lib/features/performance/syncPending";
import { RecordRow } from "@/lib/features/performance/types";
import RecordsToolbar from "./RecordsToolbar";
import RecordsTable from "./RecordsTable";
import { useMasters } from "@/lib/features/masters/useMasters";
import {
  fetchBdMonthlyLevels,
  normalizeRecordBdLevel,
  type BdMonthlyLevelMap,
} from "@/lib/features/performance/bdMonthlyLevels";
import type { LocalRecord } from "@/lib/features/performance/offlineDb";

export type Filters = {
  month?: string;
  from?: string;
  to?: string;
  bd_ids?: string[];
  customer_name?: string;
  note?: string;
  category?: "entertainment" | "restaurant";
  customer_type_ids?: string[];
  point_type_ids?: string[];
};

export type RecordVM = RecordRow & {
  _sync_status?: "pending" | "synced" | "failed";
};

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export default function RecordsPage({ isAdmin }: { isAdmin: boolean }) {
  const [filters, setFilters] = useState<Filters>({
    month: getCurrentMonth(),
  });
  const [rows, setRows] = useState<RecordVM[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const { items: allBdList, loading: mastersLoading } = useMasters("bd");
  const { items: levelList } = useMasters("bd_level");
  const { items: customerTypes } = useMasters("customer_type");
  const { items: pointTypes } = useMasters("point_type");

  const bdMap = useMemo(
    () => Object.fromEntries(allBdList.map((x) => [x.id, x.label])),
    [allBdList]
  );

  const levelMap = useMemo(
    () => Object.fromEntries(levelList.map((x) => [x.id, x.label])),
    [levelList]
  );

  const customerTypeMap = useMemo(
    () => Object.fromEntries(customerTypes.map((x) => [x.id, x.label])),
    [customerTypes]
  );

  const pointTypeMap = useMemo(
    () => Object.fromEntries(pointTypes.map((x) => [x.id, x.label])),
    [pointTypes]
  );

  const scrollRestoreRef = useRef<number | null>(null);

  async function refresh(options?: { preserveScroll?: boolean }) {
    if (options?.preserveScroll) {
      scrollRestoreRef.current = window.scrollY;
    }

    setLoading(true);

    const local = await db.records.toArray();
    const { data, error } = await supabase.from("records").select("*");
    const monthKeys = Array.from(
      new Set(
        [
          ...(data ?? []).map((r: RecordRow) => r.event_date?.slice(0, 7)),
          ...local.map((r) => r.event_date?.slice(0, 7)),
        ].filter(Boolean) as string[]
      )
    );

    let monthlyLevelMap: BdMonthlyLevelMap = {};

    try {
      monthlyLevelMap = await fetchBdMonthlyLevels(monthKeys);
    } catch (levelError) {
      console.error("Failed to fetch BD monthly levels:", levelError);
    }

    if (error) {
      const localOnly: RecordVM[] = local
        .filter((x) => !x.deleted)
        .map(
          ({ sync_status, ...r }: LocalRecord) => ({
            ...(normalizeRecordBdLevel(r as RecordRow, monthlyLevelMap) as RecordRow),
            _sync_status: sync_status,
          })
        );

      setRows(localOnly);
      setLoading(false);
      return;
    }

    const serverMap = new Map<string, RecordVM>(
      ((data ?? []) as RecordRow[]).map((r) => [
        r.id,
        {
          ...(normalizeRecordBdLevel(r, monthlyLevelMap) as RecordRow),
          _sync_status: "synced",
        },
      ])
    );

    for (const l of local) {
      if (l.sync_status === "synced") continue;
      if (l.deleted) continue;

      const { sync_status, ...pure } = l;

      serverMap.set(l.id, {
        ...(normalizeRecordBdLevel(pure as RecordRow, monthlyLevelMap) as RecordRow),
        _sync_status: sync_status,
      });
    }

    setRows(Array.from(serverMap.values()));
    setLoading(false);
  }

  useEffect(() => {
    const initialRefreshId = window.setTimeout(() => {
      void refresh();
    }, 0);

    const onOnline = async () => {
      await syncPending();
      await refresh();
    };

    const onMastersUpdated = () => {
      refresh();
    };

    const onRecordsUpdated = () => {
      refresh();
    };

    const onPerformanceRecordsUpdated = () => {
      refresh();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("masters-updated", onMastersUpdated);
    window.addEventListener("records-updated", onRecordsUpdated);
    window.addEventListener("performance-records-updated", onPerformanceRecordsUpdated);

    return () => {
      window.clearTimeout(initialRefreshId);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("masters-updated", onMastersUpdated);
      window.removeEventListener("records-updated", onRecordsUpdated);
      window.removeEventListener("performance-records-updated", onPerformanceRecordsUpdated);
    };
  }, []);

  useEffect(() => {
    if (!loading && scrollRestoreRef.current !== null) {
      const y = scrollRestoreRef.current;
      scrollRestoreRef.current = null;

      requestAnimationFrame(() => {
        window.scrollTo({ top: y, behavior: "auto" });
      });
    }
  }, [loading]);

  const ALL = "__all__";

  const monthOptions = useMemo(() => {
    const selectedMonth = filters.month;
    const currentMonth = getCurrentMonth();

    const months = Array.from(
      new Set(
        [
          currentMonth,
          selectedMonth,
          ...rows.map((r) => r.event_date?.slice(0, 7)).filter(Boolean),
        ].filter(Boolean) as string[]
      )
    )
      .filter((month) => month !== ALL)
      .sort((a, b) => b.localeCompare(a));

    return [ALL, ...months];
  }, [rows, filters.month]);

  const filtered = useMemo(() => {
    return [...rows]
      .filter((r) => {
        if (filters.month && filters.month !== "__all__") {
          const recordMonth = r.event_date.slice(0, 7);
          if (recordMonth !== filters.month) return false;
        }

        if (filters.from && r.event_date < filters.from) return false;
        if (filters.to && r.event_date > filters.to) return false;
        if (filters.bd_ids?.length && !filters.bd_ids.includes(r.bd_id ?? "")) return false;
        if (filters.category && r.category !== filters.category) return false;

        if (
          filters.customer_type_ids?.length &&
          !filters.customer_type_ids.includes(r.customer_type_id)
        ) {
          return false;
        }

        if (
          filters.point_type_ids?.length &&
          !filters.point_type_ids.includes(r.point_type_id)
        ) {
          return false;
        }

        if (
          filters.customer_name &&
          !r.customer_name
            .toLowerCase()
            .includes(filters.customer_name.toLowerCase())
        ) {
          return false;
        }

        if (
          filters.note &&
          !(r.note ?? "").toLowerCase().includes(filters.note.toLowerCase())
        ) {
          return false;
        }

        if (search) {
          const keyword = search.toLowerCase();

          const categoryLabel =
            r.category === "restaurant" ? "restaurant" : "entertainment";

          const match =
            r.customer_name?.toLowerCase().includes(keyword) ||
            categoryLabel.includes(keyword) ||
            (r.note ?? "").toLowerCase().includes(keyword) ||
            (bdMap[r.bd_id] ?? "").toLowerCase().includes(keyword) ||
            (customerTypeMap[r.customer_type_id] ?? "")
              .toLowerCase()
              .includes(keyword) ||
            (pointTypeMap[r.point_type_id] ?? "")
              .toLowerCase()
              .includes(keyword);

          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.event_date !== b.event_date) {
          return b.event_date.localeCompare(a.event_date);
        }

        const aTime = a.updated_at ?? a.created_at ?? "";
        const bTime = b.updated_at ?? b.created_at ?? "";
        return bTime.localeCompare(aTime);
      });
  }, [rows, filters, search, bdMap, customerTypeMap, pointTypeMap]);

  return (
    <div className="space-y-3">
      <RecordsToolbar
        filters={filters}
        onChangeFilters={setFilters}
        rowsForExport={filtered}
        onRefresh={refresh}
        isAdmin={isAdmin}
        monthOptions={monthOptions}
      />

      <RecordsTable
  rows={filtered}
  loading={loading || mastersLoading}
  onChanged={() => refresh({ preserveScroll: true })}
  onRefresh={() => refresh({ preserveScroll: true })}
  bdMap={bdMap}
  levelMap={levelMap}
  customerTypeMap={customerTypeMap}
  pointTypeMap={pointTypeMap}
  isAdmin={isAdmin}
  search={search}
  onSearchChange={setSearch}
/>
    </div>
  );
}
