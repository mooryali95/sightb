/**
 * A device fingerprint as the browser sends it: the random id the login page
 * keeps in localStorage. Anything that is not a string of a sane length is
 * treated as absent.
 */
export function fingerprintOf(raw: unknown): string {
  return typeof raw === "string" && raw.length >= 8 && raw.length <= 128 ? raw : "";
}
