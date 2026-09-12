/**
 * The contract maths of the new-project form, kept pure: the VAT rate the
 * field means, and the three figures of a contract at that rate.
 */
import { addVAT, calcVAT, removeVAT } from '@/lib/finance';

export const DEFAULT_VAT_RATE = 15;

/** 0 is a rate, not a missing one: only an unparsable field falls back to the default. */
export function resolveVatRate(text: string, fallback = DEFAULT_VAT_RATE): number {
  const parsed = parseFloat(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface ContractFigures {
  /** The contract net of VAT: what the project row stores. */
  excl: number;
  vat: number;
  incl: number;
}

/** The entered figure read as inclusive or exclusive of VAT at the given rate. */
export function contractFigures(entered: number, rate: number, inclusive: boolean): ContractFigures {
  if (inclusive) {
    const excl = removeVAT(entered, rate);
    return { excl, vat: entered - excl, incl: entered };
  }
  return { excl: entered, vat: calcVAT(entered, rate), incl: addVAT(entered, rate) };
}
