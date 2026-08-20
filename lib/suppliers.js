// Material suppliers we send job-PO requests to. Hardcoded per-supplier because
// each wants its own email format; adding one is a quick config addition here.
// Each supplier: { id, name, email, subject(project), body(project, fields) }.
//
// `fields` passed to body() is pre-resolved by the caller: {
//   customer, jobName, jobId, address, city, state, zip,
//   contactPrimary, phonePrimary, contactSecondary, phoneSecondary
// }

const AMMEX = "Ammex Rebar Placers, Inc.";
const CONTACT_PRIMARY = "Fernando Garcia";
const PHONE_PRIMARY = "602-501-3809";
const CONTACT_SECONDARY = "Oscar Garcia";
const PHONE_SECONDARY = "602-501-2734";

export const SUPPLIERS = [
  {
    id: "atlas",
    name: "Atlas Construction Supply",
    email: "PRELIMS@ATLASFORM.COM",
    subject: (f) => `Job PO Request — ${f.jobName || "New Job"} (${f.jobId || "no ID"})`,
    body: (f) =>
      [
        `Please create a job PO for the following so we can begin tracking material costs.`,
        ``,
        `Customer Name: ${f.customer}`,
        `Job Name: ${f.jobName || "—"}`,
        `Job/PO #: ${f.jobId || "—"}`,
        `Job Address: ${f.address || "—"}`,
        `City: ${f.city || "—"}`,
        `State: ${f.state || "—"}`,
        `Zip Code: ${f.zip || "—"}`,
        `Job Site Contact (Primary): ${f.contactPrimary} — ${f.phonePrimary}`,
        `Job Site Contact (Secondary): ${f.contactSecondary} — ${f.phoneSecondary}`,
        ``,
        `Thank you,`,
        `${f.contactPrimary}`,
        `${f.customer}`,
      ].join("\n"),
    // close-out email (fast-follow feature; wording is a first pass, easy to tweak)
    closeSubject: (f) => `Job Complete — Please Close PO — ${f.jobName || ""} (${f.jobId || ""})`,
    closeBody: (f) =>
      [
        `The following job is complete. Please close the PO on your side and send final material billing.`,
        ``,
        `Customer Name: ${f.customer}`,
        `Job Name: ${f.jobName || "—"}`,
        `Job/PO #: ${f.jobId || "—"}`,
        ``,
        `Thank you,`,
        `${f.contactPrimary}`,
        `${f.customer}`,
      ].join("\n"),
  },
  // White Cap and others get added here once we have their format + email.
];

export const SUPPLIER_CONSTANTS = {
  customer: AMMEX,
  contactPrimary: CONTACT_PRIMARY,
  phonePrimary: PHONE_PRIMARY,
  contactSecondary: CONTACT_SECONDARY,
  phoneSecondary: PHONE_SECONDARY,
};

// Resolve a project's PO fields, applying the Site Street -> Crossroads fallback.
export function resolvePOFields(project) {
  const site = project.site || {};
  const address = (site.street && site.street.trim()) || (site.crossroads && site.crossroads.trim()) || "";
  return {
    ...SUPPLIER_CONSTANTS,
    jobName: project.name || project.projectName || "",
    jobId: project.projectId || "",
    address,
    city: site.city || "",
    state: site.state || "",
    zip: site.zip || "",
    _addressMissing: !address, // both street and crossroads empty
  };
}
