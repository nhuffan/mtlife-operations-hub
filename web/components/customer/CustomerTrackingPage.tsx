"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/integrations/supabase/client";
import CustomerTrackingToolbar from "./CustomerTrackingToolbar";
import CustomerTrackingTable from "./CustomerTrackingTable";
import type { TrackingFilters, TrackingRecordVM } from "./types";
import { useMasters } from "@/lib/features/masters/useMasters";

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

const ALL = "__all__";

export default function CustomerTrackingPage({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const [filters, setFilters] = useState<TrackingFilters>({
    month: getCurrentMonth(),
  });
  const [rows, setRows] = useState<TrackingRecordVM[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const scrollRestoreRef = useRef<number | null>(null);
  const skipRealtimeRefreshUntilRef = useRef<number>(0);

  const { items: allBdList, loading: mastersLoading } = useMasters("bd");

  const bdMap = useMemo(
    () => Object.fromEntries(allBdList.map((x) => [x.id, x.label])),
    [allBdList]
  );

  function markSkipRealtimeRefresh(ms = 1200) {
    skipRealtimeRefreshUntilRef.current = Date.now() + ms;
  }

  const refresh = useCallback(async (options?: { preserveScroll?: boolean }) => {
    if (options?.preserveScroll) {
      scrollRestoreRef.current = window.scrollY;
    }

    setLoading(true);

    const { data, error } = await supabase.from("customer_tracking").select("*");

    if (error) {
      console.error("Failed to fetch customer tracking:", error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(
      (data ?? []).map((r) => ({
        ...r,
        _sync_status: "synced",
      }))
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel("customer-tracking-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customer_tracking",
        },
        () => {
          if (Date.now() < skipRealtimeRefreshUntilRef.current) return;
          void refresh({ preserveScroll: true });
        }
      )
      .subscribe((status) => {
        console.log("customer_tracking realtime:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    if (!loading && scrollRestoreRef.current !== null) {
      const y = scrollRestoreRef.current;
      scrollRestoreRef.current = null;

      requestAnimationFrame(() => {
        window.scrollTo({ top: y, behavior: "auto" });
      });
    }
  }, [loading]);

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
        if (filters.month && filters.month !== ALL) {
          const recordMonth = r.event_date.slice(0, 7);
          if (recordMonth !== filters.month) return false;
        }

        if (filters.from && r.event_date < filters.from) return false;
        if (filters.to && r.event_date > filters.to) return false;
        if (filters.bd_ids?.length && !filters.bd_ids.includes(r.bd_id ?? "")) return false;

        if (
          filters.customer_name &&
          !r.customer_name
            .toLowerCase()
            .includes(filters.customer_name.toLowerCase())
        ) {
          return false;
        }

        if (filters.combo_voucher === "yes" && r.combo_voucher !== true) {
          return false;
        }

        if (filters.combo_voucher === "none" && r.combo_voucher === true) {
          return false;
        }

        if (filters.offer_ads === "yes" && r.offer_ads !== true) {
          return false;
        }

        if (filters.offer_ads === "none" && r.offer_ads === true) {
          return false;
        }

        if (search) {
          const keyword = search.toLowerCase();

          const match =
            r.customer_name.toLowerCase().includes(keyword) ||
            (bdMap[r.bd_id ?? ""] ?? "").toLowerCase().includes(keyword) ||
            (r.note ?? "").toLowerCase().includes(keyword) ||
            (r.info ?? "").toLowerCase().includes(keyword);

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
  }, [rows, filters, search, bdMap]);

  const stats = useMemo(() => {
    const totalCustomers = filtered.length;

    const totalBranches = filtered.reduce((sum, r) => {
      return sum + (r.branch ?? 0);
    }, 0);

    return {
      totalCustomers,
      totalBranches,
    };
  }, [filtered]);

  return (
    <div className="space-y-3">
      <CustomerTrackingToolbar
        filters={filters}
        onChangeFilters={setFilters}
        rowsForExport={filtered}
        onRefresh={() => refresh({ preserveScroll: true })}
        isAdmin={isAdmin}
        bdMap={bdMap}
        monthOptions={monthOptions}
      />

      <CustomerTrackingTable
        rows={filtered}
        loading={loading || mastersLoading}
        onChanged={async () => {
          markSkipRealtimeRefresh();
          await refresh({ preserveScroll: true });
        }}
        onRefresh={() => refresh({ preserveScroll: true })}
        isAdmin={isAdmin}
        search={search}
        onSearchChange={setSearch}
        bdMap={bdMap}
        stats={stats}
      />
    </div>
  );
}
