// GET /api/admin/template/status — which template is in use, and is storage set up?
import { NextResponse } from "next/server";
import { getTemplateBuffer, blobConfigured } from "@/lib/documents/templateStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const { source, uploadedAt, size, error } = await getTemplateBuffer();
  return NextResponse.json({
    ok: true,
    storageReady: blobConfigured(),
    source,                       // "uploaded" | "built-in"
    uploadedAt: uploadedAt || null,
    size: size || null,
    error: error || null,
  });
}
