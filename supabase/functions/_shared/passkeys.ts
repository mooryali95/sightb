/**
 * The parts of the passkey ceremony that are plain logic: which origins
 * may act as the relying party, how long a challenge lives, and the byte
 * encodings the database rows carry. Kept free of Deno and library
 * imports so they are unit-tested with the rest of the app.
 */

export const ALLOWED_ORIGINS = [
  "https://sightb.lovable.app",
  "https://sight.basserh.com",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:4173",
];

/** Five minutes: long enough to touch a key, short enough to be worthless later. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** How many ceremonies one user may start in the rate window before being refused. */
export const MAX_CHALLENGES_PER_WINDOW = 10;
export const RATE_WINDOW_MS = 10 * 60 * 1000;

export interface RelyingParty {
  /** The registrable domain the credential is bound to. */
  rpID: string;
  /** The exact origin an assertion must come from. */
  origin: string;
}

export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com");
  } catch {
    return false;
  }
}

/**
 * The relying party for a request, or null when its origin is not one of
 * ours: a credential minted for an unknown origin would be usable only
 * from there, so the ceremony is refused before it starts.
 */
export function relyingPartyFor(origin: string | null): RelyingParty | null {
  if (!origin || !isAllowedOrigin(origin)) return null;
  return { rpID: new URL(origin).hostname, origin };
}

export function challengeExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();
}

export function isChallengeLive(row: { expires_at: string }, now: Date = new Date()): boolean {
  return new Date(row.expires_at).getTime() > now.getTime();
}

export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export interface PasskeyRow {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  device_type: string | null;
  backed_up: boolean;
  name: string;
  created_at: string;
  last_used_at: string | null;
  /**
   * Whether the key may sign in on its own. Absent until the migration adding
   * it is applied, and false for every key registered before the gate that
   * requires a completed second factor to add one.
   */
  can_sign_in?: boolean | null;
  discoverable?: boolean | null;
}

/** What the browser is told about a passkey: never the key material. */
export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: string | null;
  backedUp: boolean;
  transports: string[];
  /**
   * Whether it signs in on its own, or only stands in for the emailed code;
   * null while the column that says so is not there yet.
   */
  canSignIn: boolean | null;
  /** Whether the authenticator kept a discoverable credential; null when it did not say. */
  discoverable: boolean | null;
}

export function summarizePasskey(row: PasskeyRow): PasskeySummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    deviceType: row.device_type,
    backedUp: row.backed_up,
    transports: row.transports ?? [],
    canSignIn: row.can_sign_in === undefined ? null : row.can_sign_in === true,
    discoverable: typeof row.discoverable === "boolean" ? row.discoverable : null,
  };
}

/** A label typed by the user, or a sensible default; never empty, never long. */
export function passkeyName(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  return (text || "مفتاح مرور").slice(0, 60);
}
