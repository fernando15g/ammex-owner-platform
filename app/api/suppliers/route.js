// Suppliers live in Notion so contacts can change without a code push. If that
// lookup fails for any reason, fall back to the built-in list — a PO request
// must never be blocked by a settings read.
import { NextResponse } from "next/server";
import { listSuppliers, updateSupplier, createSupplier } from "@/lib/notion/supplierRepository";
import { SUPPLIERS as FALLBACK, TEMPLATES } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

const withTemplates = (list) => list.map((s) => ({ ...s, ...(TEMPLATES[s.template] || TEMPLATES.standard) }));

export async function GET() {
  try {
    const rows = (await listSuppliers()).filter((s) => s.active !== false);
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, suppliers: FALLBACK, source: "built-in" });
    }
    return NextResponse.json({ ok: true, suppliers: rows, source: "notion" });
  } catch (e) {
    return NextResponse.json({ ok: true, suppliers: FALLBACK, source: "built-in", note: String(e?.message || e) });
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    if (body.create) {
      await createSupplier(body.create);
    } else {
      const { id, changes } = body;
      if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
      await updateSupplier(id, changes || {});
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
