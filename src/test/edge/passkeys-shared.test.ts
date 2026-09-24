/**
 * The passkey helpers the edge function shares: which origins may act as
 * the relying party, how a challenge ages, the byte encodings a credential
 * row carries, and what the browser is told about a passkey.
 */
import { describe, it, expect } from 'vitest';
import {
  relyingPartyFor, isAllowedOrigin, challengeExpiresAt, isChallengeLive, CHALLENGE_TTL_MS,
  bytesToBase64url, base64urlToBytes, summarizePasskey, passkeyName,
} from '../../../supabase/functions/_shared/passkeys.ts';

describe('relying party', () => {
  it('binds the credential to the hostname of an allowed origin', () => {
    expect(relyingPartyFor('https://sightb.lovable.app')).toEqual({ rpID: 'sightb.lovable.app', origin: 'https://sightb.lovable.app' });
    expect(relyingPartyFor('http://localhost:4173')).toEqual({ rpID: 'localhost', origin: 'http://localhost:4173' });
    expect(relyingPartyFor('https://preview-abc.lovableproject.com')?.rpID).toBe('preview-abc.lovableproject.com');
  });

  it('refuses a missing, foreign or malformed origin', () => {
    expect(relyingPartyFor(null)).toBeNull();
    expect(relyingPartyFor('')).toBeNull();
    expect(relyingPartyFor('https://evil.example.com')).toBeNull();
    expect(relyingPartyFor('https://sightb.lovable.app.evil.com')).toBeNull();
    expect(isAllowedOrigin('not a url')).toBe(false);
  });
});

describe('challenge lifetime', () => {
  const now = new Date('2026-09-19T06:00:00Z');
  it('expires five minutes after minting', () => {
    expect(challengeExpiresAt(now)).toBe('2026-09-19T06:05:00.000Z');
    expect(CHALLENGE_TTL_MS).toBe(300000);
  });
  it('is live strictly before its expiry and dead at it', () => {
    expect(isChallengeLive({ expires_at: '2026-09-19T06:00:01Z' }, now)).toBe(true);
    expect(isChallengeLive({ expires_at: '2026-09-19T06:00:00Z' }, now)).toBe(false);
    expect(isChallengeLive({ expires_at: '2026-09-19T05:59:00Z' }, now)).toBe(false);
  });
});

describe('base64url', () => {
  it('round-trips bytes without padding or url-unsafe characters', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const text = bytesToBase64url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect(Array.from(base64urlToBytes(text))).toEqual(Array.from(bytes));
    expect(bytesToBase64url(new Uint8Array([])) ).toBe('');
  });
});

describe('summaries and names', () => {
  it('hands the browser labels and dates, never the key', () => {
    const summary = summarizePasskey({
      id: 'pk-1', user_id: 'u1', credential_id: 'cred', public_key: 'SECRET', counter: 3, transports: null,
      device_type: 'multiDevice', backed_up: true, name: 'هاتفي', created_at: '2026-09-01T00:00:00Z', last_used_at: null,
    });
    expect(summary).toEqual({ id: 'pk-1', name: 'هاتفي', createdAt: '2026-09-01T00:00:00Z', lastUsedAt: null, deviceType: 'multiDevice', backedUp: true, transports: [], canSignIn: null, discoverable: null });
    expect(JSON.stringify(summary)).not.toContain('SECRET');
    expect(JSON.stringify(summary)).not.toContain('cred');
  });

  it('says a key signs in alone only when the row says so, and cannot say while the column is missing', () => {
    const row = {
      id: 'pk-1', user_id: 'u1', credential_id: 'cred', public_key: 'k', counter: 0, transports: [],
      device_type: null, backed_up: false, name: 'n', created_at: '2026-09-01T00:00:00Z', last_used_at: null,
    };
    expect(summarizePasskey({ ...row, can_sign_in: true }).canSignIn).toBe(true);
    expect(summarizePasskey({ ...row, can_sign_in: false }).canSignIn).toBe(false);
    expect(summarizePasskey({ ...row, can_sign_in: null }).canSignIn).toBe(false);
    expect(summarizePasskey(row).canSignIn).toBeNull();
    expect(summarizePasskey({ ...row, discoverable: false }).discoverable).toBe(false);
  });
  it('trims the typed name, falls back when blank, and caps its length', () => {
    expect(passkeyName('  هاتفي  ')).toBe('هاتفي');
    expect(passkeyName('')).toBe('مفتاح مرور');
    expect(passkeyName(undefined)).toBe('مفتاح مرور');
    expect(passkeyName('x'.repeat(100))).toHaveLength(60);
  });
});
