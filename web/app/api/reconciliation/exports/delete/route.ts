import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cloudinary } from "@/lib/integrations/cloudinary/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(authorization.slice(7));
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id)) {
    return NextResponse.json({ error: "Invalid export ID" }, { status: 400 });
  }

  try {
    const { data: record, error } = await supabase.from("reconciliation_exports")
      .select("id, asset, created_by").eq("id", body.id).maybeSingle();
    if (error) throw error;
    // Deletion is idempotent so a lost response can be retried safely.
    if (!record) return NextResponse.json({ success: true });
    if (record.created_by !== user.id) {
      return NextResponse.json({ error: "You can only delete files you added." }, { status: 403 });
    }
    const asset = record.asset;
    if (!asset?.public_id || !["raw", "image", "video"].includes(asset.resource_type)) {
      throw new Error("Invalid archived asset");
    }
    const result = await cloudinary.uploader.destroy(asset.public_id, {
      resource_type: asset.resource_type,
      invalidate: true,
    });
    if (!["ok", "not found"].includes(result.result)) throw new Error("Cloudinary did not confirm deletion");

    const { error: deleteError } = await supabase.from("reconciliation_exports").delete().eq("id", record.id);
    if (deleteError) {
      return NextResponse.json({ error: "Could not finish deleting the file. Please retry." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reconciliation export deletion failed:", error);
    return NextResponse.json({ error: "Could not delete the file. Please try again." }, { status: 500 });
  }
}
