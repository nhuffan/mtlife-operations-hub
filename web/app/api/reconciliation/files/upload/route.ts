import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { cloudinary } from "@/lib/integrations/cloudinary/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await supabase.auth.getUser(authorization.slice(7));
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("files");
    const clientId = form.get("clientId");
    if (!(file instanceof File) || form.getAll("files").length !== 1 || !/\.(pdf|xlsx)$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024 || typeof clientId !== "string") {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }
    const { data: client, error: clientError } = await supabase.from("reconciliation_clients").select("id").eq("id", clientId).maybeSingle();
    if (clientError || !client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "xlsx";
    let valid = extension === "pdf" && buffer.subarray(0, 5).toString() === "%PDF-";
    if (extension === "xlsx") {
      try {
        const zip = await JSZip.loadAsync(buffer);
        valid = Boolean(zip.file("[Content_Types].xml") && zip.file("xl/workbook.xml"));
      } catch { valid = false; }
    }
    if (!valid) return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    const mime = extension === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const uploaded = await cloudinary.uploader.upload(`data:${mime};base64,${buffer.toString("base64")}`, {
      resource_type: "raw", folder: `reconciliation_exports/${client.id}`,
      public_id: `${crypto.randomUUID()}.${extension}`, overwrite: false,
    });
    return NextResponse.json({ files: [{ secure_url: uploaded.secure_url, public_id: uploaded.public_id, resource_type: uploaded.resource_type }] });
  } catch (error) {
    console.error("Client file upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
