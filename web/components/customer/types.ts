export type TrackingRecordRow = {
  id: string;
  event_date: string;
  customer_name: string;

  branch: number | null;
  bd_id: string | null;

  combo_voucher: boolean | null;
  offer_ads: boolean | null;

  note: string | null;
  info: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};


export type TrackingRecordVM = TrackingRecordRow & {
  _sync_status?: "pending" | "synced" | "failed";
};

export type TrackingFilters = {
  month?: string;
  from?: string;
  to?: string;
  customer_name?: string;
  bd_ids?: string[];
  combo_voucher?: "all" | "yes" | "none";
  offer_ads?: "all" | "yes" | "none";
};
