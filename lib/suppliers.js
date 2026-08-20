// Material suppliers we send job-PO requests to. Atlas and White Cap use the
// identical format, so the templates are shared; each supplier just has its own
// name + email. Labels are ALL CAPS so they stand out in plain-text email
// (mailto bodies can't be bold — caps is the readable plain-text equivalent).

const AMMEX = "Ammex Rebar Placers, Inc.";
const CONTACT_PRIMARY = "Fernando Garcia";
const PHONE_PRIMARY = "602-501-3809";
const CONTACT_SECONDARY = "Oscar Garcia";
const PHONE_SECONDARY = "602-501-2734";

const openSubject = (f) => `Job PO Request — ${f.jobName || "New Job"} (${f.jobId || "no ID"})`;
const openBody = (f) =>
  [
    `Please create a job PO for the following so we can begin tracking material costs.`,
    ``,
    `CUSTOMER NAME: ${f.customer}`,
    `JOB NAME: ${f.jobName || "—"}`,
    `JOB/PO #: ${f.jobId || "—"}`,
    `JOB ADDRESS: ${f.address || "—"}`,
    `CITY: ${f.city || "—"}`,
    `STATE: ${f.state || "—"}`,
    `ZIP CODE: ${f.zip || "—"}`,
    `JOB SITE CONTACT (PRIMARY): ${f.contactPrimary} — ${f.phonePrimary}`,
    `JOB SITE CONTACT (SECONDARY): ${f.contactSecondary} — ${f.phoneSecondary}`,
    ``,
    `Thank you,`,
    `${f.contactPrimary}`,
    `${f.customer}`,
  ].join("\n");
const closeSubject = (f) => `Job Complete — Please Close PO — ${f.jobName || ""} (${f.jobId || ""})`;
const closeBody = (f) =>
  [
    `The following job is complete. Please close the PO on your side and send final material billing.`,
    ``,
    `CUSTOMER NAME: ${f.customer}`,
    `JOB NAME: ${f.jobName || "—"}`,
    `JOB/PO #: ${f.jobId || "—"}`,
    ``,
    `Thank you,`,
    `${f.contactPrimary}`,
    `${f.customer}`,
  ].join("\n");

const commonTemplates = { subject: openSubject, body: openBody, closeSubject, closeBody };

export const SUPPLIERS = [
  { id: "atlas", name: "Atlas Construction Supply", email: "PRELIMS@ATLASFORM.COM", ...commonTemplates },
  { id: "whitecap", name: "White Cap", email: "BRYAN.IHRKE@WHITECAP.COM", ...commonTemplates },
];

export const SUPPLIER_CONSTANTS = {
  customer: AMMEX,
  contactPrimary: CONTACT_PRIMARY,
  phonePrimary: PHONE_PRIMARY,
  contactSecondary: CONTACT_SECONDARY,
  phoneSecondary: PHONE_SECONDARY,
};

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
    _addressMissing: !address,
  };
}
