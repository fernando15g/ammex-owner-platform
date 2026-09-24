// =============================================================================
// SUPPLIERS — who we send material PO requests to.
//
// Lives in Notion so a contact can be changed by typing instead of a code push.
// Only WHO is in Notion (name, addresses, which body format); the email
// templates themselves stay in code, since those are formatting, not data.
//
// If the table is empty, missing, or Notion is unreachable, callers fall back
// to the built-in list in lib/suppliers.js — the PO buttons must never break
// because a lookup failed.
// =============================================================================
import { queryAll, getTitle, getText, getSelect, getCheckbox, pageId, createPage, updatePage, fmt } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";

const P = { name: "Name", emails: "Emails", template: "Template", active: "Active" };

function mapSupplier(page) {
  const emails = (getText(page, P.emails) || "")
    .split(/[,;]/).map((e) => e.trim()).filter(Boolean);
  return {
    id: pageId(page),
    name: getTitle(page) || "",
    emails,
    template: getSelect(page, P.template) || "standard",
    active: getCheckbox(page, P.active),
  };
}

export async function listSuppliers() {
  const pages = await queryAll(DB.SUPPLIERS);
  return pages.map(mapSupplier).filter((s) => s.name && s.emails.length > 0);
}

export async function updateSupplier(id, changes) {
  const props = {};
  if ("name" in changes) props[P.name] = fmt.title(changes.name || "");
  if ("emails" in changes) {
    const list = Array.isArray(changes.emails) ? changes.emails.join(", ") : String(changes.emails || "");
    props[P.emails] = fmt.richText(list);
  }
  if ("template" in changes) props[P.template] = changes.template ? { select: { name: changes.template } } : { select: null };
  if ("active" in changes) props[P.active] = fmt.checkbox(changes.active);
  return updatePage(id, props);
}

export async function createSupplier(s) {
  return createPage(DB.SUPPLIERS, {
    [P.name]: fmt.title(s.name || ""),
    [P.emails]: fmt.richText((s.emails || []).join(", ")),
    [P.template]: { select: { name: s.template || "standard" } },
    [P.active]: fmt.checkbox(s.active !== false),
  });
}
