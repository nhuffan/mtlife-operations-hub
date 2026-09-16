import { NextResponse } from "next/server";
import {
  FALLBACK_BANKS,
  normalizeVietQrBanks,
  VIETQR_BANKS_URL,
} from "@/lib/features/banks/banks";

export const runtime = "nodejs";
export const revalidate = 86_400;

export async function GET() {
  try {
    const response = await fetch(VIETQR_BANKS_URL, {
      next: { revalidate },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) throw new Error(`VietQR returned ${response.status}.`);

    const banks = normalizeVietQrBanks(await response.json());
    if (!banks.length) throw new Error("VietQR returned an empty bank list.");

    return NextResponse.json({ banks, source: "vietqr" });
  } catch (error) {
    console.error("VietQR bank list failed; using the local fallback.", error);
    return NextResponse.json({ banks: FALLBACK_BANKS, source: "fallback" });
  }
}
