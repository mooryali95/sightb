import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert Eastern-Arabic (٠-٩) and Extended-Arabic (۰-۹) digits to Western 0-9 */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * The user-facing text for a thrown value.
 *
 * Errors reach the UI as `unknown`; most are `Error` instances from the service
 * layer carrying an Arabic message, but a rejected promise can carry anything.
 * Callers used to read `e.message` off an `any`, which shows an empty toast
 * when the throw was not an Error.
 */
export function errorMessage(e: unknown, fallback = 'فشلت العملية'): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return fallback;
}
