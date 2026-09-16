"use client";

import { useEffect, useState } from "react";
import { FALLBACK_BANKS } from "./banks";

let cachedBanks: string[] | null = null;
let pendingRequest: Promise<string[]> | null = null;

async function loadBanks() {
  if (cachedBanks) return cachedBanks;

  pendingRequest ??= fetch("/api/banks")
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not load banks.");
      const payload = (await response.json()) as { banks?: unknown };
      if (!Array.isArray(payload.banks)) throw new Error("Invalid bank response.");

      const banks = payload.banks.filter(
        (bank): bank is string => typeof bank === "string" && Boolean(bank.trim())
      );
      if (!banks.length) throw new Error("The bank list is empty.");

      cachedBanks = banks;
      return banks;
    })
    .catch(() => FALLBACK_BANKS)
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
}

export function useVietnamBanks() {
  const [banks, setBanks] = useState<string[]>(cachedBanks ?? FALLBACK_BANKS);

  useEffect(() => {
    let active = true;
    void loadBanks().then((nextBanks) => {
      if (active) setBanks(nextBanks);
    });

    return () => {
      active = false;
    };
  }, []);

  return banks;
}
