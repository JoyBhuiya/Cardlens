/**
 * Legal details shown on /privacy, /terms and the landing page footer: one place to fill them in.
 * Values in [brackets] are still to be decided (tasks/todo.md → "Before charging anyone").
 */
export const LEGAL = {
  /** Operating entity and seller of record, e.g. "Example Ltd (company no. 12345678)". */
  companyName: "[Company name]",
  /** Registered office address, required on the terms once trading. */
  companyAddress: "[registered address]",
  /** Where people send privacy requests. */
  privacyEmail: "[privacy email]",
  /** ICO data protection fee registration number. */
  icoNumber: "[pending]",
  /** Who runs the server (cardlens.brightnext.eu, its database and file storage) and where it is. */
  hostingProvider: "[Hosting provider]",
  hostingLocation: "[location]",
  privacyUpdated: "13 November 2026",
  termsUpdated: "13 November 2026",
} as const;

/** True while any detail is still a placeholder; shown as a reminder on the legal pages. */
export const LEGAL_INCOMPLETE = Object.values(LEGAL).some((v) => v.startsWith("["));
