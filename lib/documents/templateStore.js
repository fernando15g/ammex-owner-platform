// =============================================================================
// WHERE THE PROPOSAL TEMPLATE LIVES
//
// Vercel's filesystem is read-only, so the app can't save an uploaded template
// to itself. That's why updating it used to mean downloading a JavaScript file
// and pushing it to GitHub — a developer's workflow, for a person who isn't one.
// Which really means: the template would never get updated. It'd just become a
// thing to ask someone else for.
//
// So the template lives in Vercel Blob. Upload it in the OS, and the next
// proposal uses it. No file, no push.
//
// IMPORTANT: the embedded copy stays as a FALLBACK. If Blob isn't set up, or a
// fetch fails, proposals still generate from the version baked into the build.
// A missing template must never mean "you can't send a proposal today" — the
// storage is a convenience, not a dependency.
// =============================================================================

import { proposalTemplateBuffer } from "@/lib/documents/proposalTemplate";

const BLOB_KEY = "templates/proposal-template.xlsx";

export function blobConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// The template to build proposals from: the uploaded one if there is one, the
// version baked into the build otherwise.
export async function getTemplateBuffer() {
  if (!blobConfigured()) {
    return { buffer: proposalTemplateBuffer(), source: "built-in" };
  }

  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
    if (!blobs.length) {
      return { buffer: proposalTemplateBuffer(), source: "built-in" };
    }

    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    return {
      buffer,
      source: "uploaded",
      uploadedAt: blobs[0].uploadedAt,
      size: blobs[0].size,
    };
  } catch (e) {
    // Never let a storage hiccup stop a proposal going out.
    console.error("[template] couldn't read the uploaded template, using the built-in one:", e.message || e);
    return { buffer: proposalTemplateBuffer(), source: "built-in", error: String(e.message || e) };
  }
}

// Save an uploaded template. Overwrites the previous one — the point is that
// there's exactly one current template, not a pile of them.
export async function putTemplate(buffer) {
  if (!blobConfigured()) {
    throw new Error(
      "Template storage isn't set up yet. In Vercel: your project → Storage → Create a Blob store. " +
      "Vercel adds the token for you; then redeploy."
    );
  }
  const { put } = await import("@vercel/blob");
  const blob = await put(BLOB_KEY, buffer, {
    access: "public",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: blob.url };
}

// Go back to the version baked into the build.
export async function resetTemplate() {
  if (!blobConfigured()) return { reset: true, source: "built-in" };
  try {
    const { del, list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
    if (blobs.length) await del(blobs[0].url);
    return { reset: true, source: "built-in" };
  } catch (e) {
    throw new Error(`Couldn't remove the uploaded template: ${e.message || e}`);
  }
}
