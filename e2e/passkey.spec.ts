import { test, expect, type Page } from '@playwright/test';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { stubSupabase } from './support/stub';
import { USER_ID } from './support/seed';

/**
 * Passkeys end to end, against Chromium's virtual authenticator: no real
 * key is touched, but the browser runs the genuine WebAuthn ceremony. What
 * must hold: registering from the security page sends a real attestation
 * for the typed name; and at the second-factor step the passkey signs the
 * server's challenge with the credential it holds, the assertion goes out
 * with the device fingerprint, and the person lands home with no code.
 *
 * WebAuthn refuses an IP address as a relying party, so this spec runs on
 * localhost rather than the suite's 127.0.0.1.
 */
test.use({ baseURL: 'http://localhost:4173' });

const b64url = (buf: Buffer) => buf.toString('base64url');
const invokes = (wire: { writes: { method: string; table: string; body: unknown }[] }, action: string) =>
  wire.writes
    .filter((w) => w.method === 'INVOKE' && w.table === 'passkeys' && (w.body as { action?: string })?.action === action)
    .map((w) => w.body as Record<string, unknown>);

const CHALLENGE = b64url(randomBytes(32));
const registrationOptions = {
  challenge: CHALLENGE,
  rp: { name: 'رؤية بصيرة', id: 'localhost' },
  user: { id: b64url(Buffer.from('user-1')), name: 'pm@example.com', displayName: 'PM' },
  pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
  timeout: 60000,
  attestation: 'none',
  excludeCredentials: [],
  authenticatorSelection: { residentKey: 'preferred', requireResidentKey: false, userVerification: 'preferred' },
};

async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId };
}

test('registering a passkey from the security page sends a real attestation under the typed name', async ({ page }) => {
  const registered: Record<string, unknown>[] = [];
  const wire = await stubSupabase(page, {}, {
    passkeys: (body) => {
      const { action } = body as { action: string; name?: string };
      if (action === 'list') return { passkeys: registered };
      if (action === 'register-options') return { options: registrationOptions };
      if (action === 'register-verify') {
        const passkey = { id: 'pk-1', name: (body as { name: string }).name, createdAt: '2026-09-19T00:00:00Z', lastUsedAt: null, deviceType: 'singleDevice', backedUp: false, transports: ['internal'] };
        registered.push(passkey);
        return { registered: true, passkey };
      }
      return {};
    },
  });
  await virtualAuthenticator(page);

  await page.goto('/security');
  await expect(page.getByRole('heading', { name: 'الأمان' })).toBeVisible();
  await expect(page.getByText(/لا توجد مفاتيح مرور مسجّلة/)).toBeVisible();
  await page.getByRole('button', { name: 'إضافة مفتاح مرور' }).click();
  await page.getByLabel('اسم المفتاح').fill('هاتفي');
  await page.getByRole('button', { name: 'تسجيل المفتاح' }).click();

  await expect(page.getByText('تم تسجيل "هاتفي"')).toBeVisible();
  const verify = invokes(wire, 'register-verify');
  expect(verify).toHaveLength(1);
  expect(verify[0].name).toBe('هاتفي');
  const response = verify[0].response as { id: string; type: string; response: { clientDataJSON: string; attestationObject: string } };
  expect(response.type).toBe('public-key');
  expect(response.id).toMatch(/^[A-Za-z0-9_-]+$/);
  const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'));
  expect(clientData).toMatchObject({ type: 'webauthn.create', challenge: CHALLENGE, origin: 'http://localhost:4173' });
  expect(response.response.attestationObject.length).toBeGreaterThan(0);
  await expect(page.getByText('هاتفي', { exact: true })).toBeVisible();
  await expect(page.getByText(/مفتاح على هذا الجهاز فقط/)).toBeVisible();
});

test('a session with no confirmed code is asked for the emailed code before any ceremony, then registers', async ({ page }) => {
  let confirmed = false;
  const wire = await stubSupabase(page, {}, {
    passkeys: (body) => {
      const { action, code } = body as { action: string; code?: string };
      if (action === 'list') return { passkeys: [] };
      if (action === 'register-options') return confirmed ? { options: registrationOptions } : { needsStepUp: true };
      if (action === 'step-up-send') return { sent: true };
      if (action === 'step-up-verify') {
        confirmed = code === '482913';
        return confirmed ? { verified: true } : { verified: false, error: 'الرمز غير صحيح أو انتهت صلاحيته' };
      }
      if (action === 'register-verify') {
        return { registered: true, passkey: { id: 'pk-7', name: (body as { name: string }).name, createdAt: '2026-09-24T00:00:00Z', lastUsedAt: null, deviceType: 'multiDevice', backedUp: true, transports: ['internal'], canSignIn: true } };
      }
      return {};
    },
  });
  await virtualAuthenticator(page);

  await page.goto('/security');
  await page.getByRole('button', { name: 'إضافة مفتاح مرور' }).click();
  await page.getByLabel('اسم المفتاح').fill('هاتفي');
  await page.getByRole('button', { name: 'تسجيل المفتاح' }).click();

  // No ceremony yet: the code is sent, and asked for.
  await expect(page.getByLabel('رمز التأكيد')).toBeVisible();
  expect(invokes(wire, 'step-up-send')).toHaveLength(1);
  expect(invokes(wire, 'register-verify')).toHaveLength(0);

  await page.getByLabel('رمز التأكيد').fill('111111');
  await page.getByRole('button', { name: 'تأكيد الرمز' }).click();
  await expect(page.getByText('الرمز غير صحيح أو انتهت صلاحيته').first()).toBeVisible();

  await page.getByLabel('رمز التأكيد').fill('482913');
  await page.getByRole('button', { name: 'تأكيد الرمز' }).click();
  await expect(page.getByText('تم التأكيد. اضغط «تسجيل المفتاح» لإكمال الإضافة.').first()).toBeVisible();
  expect(invokes(wire, 'step-up-verify').map((b) => b.code)).toEqual(['111111', '482913']);

  await page.getByRole('button', { name: 'تسجيل المفتاح' }).click();
  await expect(page.getByText('تم تسجيل "هاتفي"')).toBeVisible();
  const verify = invokes(wire, 'register-verify');
  expect(verify).toHaveLength(1);
  const clientData = JSON.parse(Buffer.from((verify[0].response as { response: { clientDataJSON: string } }).response.clientDataJSON, 'base64url').toString('utf8'));
  expect(clientData).toMatchObject({ type: 'webauthn.create', challenge: CHALLENGE });
  await expect(page.getByText('يصلح للدخول دون كلمة مرور')).toBeVisible();
});

test('at the second factor, the passkey signs the challenge and the person lands home with no code', async ({ page }) => {
  const credentialId = randomBytes(16);
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;

  const wire = await stubSupabase(page, {}, {
    'second-factor': () => ({ requiresOtp: true, sent: true }),
    passkeys: (body) => {
      const { action } = body as { action: string };
      if (action === 'auth-options') {
        return { options: { challenge: CHALLENGE, rpId: 'localhost', timeout: 60000, userVerification: 'preferred', allowCredentials: [{ id: b64url(credentialId), type: 'public-key', transports: ['internal'] }] } };
      }
      if (action === 'auth-verify') return { verified: true };
      return {};
    },
  });
  const { cdp, authenticatorId } = await virtualAuthenticator(page);
  await cdp.send('WebAuthn.addCredential', {
    authenticatorId,
    credential: { credentialId: credentialId.toString('base64'), isResidentCredential: false, rpId: 'localhost', privateKey: pkcs8.toString('base64'), signCount: 0 },
  });

  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill('pm@example.com');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('secret1');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page.getByText('التحقق بخطوتين')).toBeVisible();

  await page.getByRole('button', { name: 'التحقق بمفتاح المرور' }).click();
  await expect(page.getByText('تم التحقق بمفتاح المرور')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  const verify = invokes(wire, 'auth-verify');
  expect(verify).toHaveLength(1);
  expect(String(verify[0].fingerprint)).toMatch(/[0-9a-f-]{36}/);
  const response = verify[0].response as { id: string; response: { clientDataJSON: string; authenticatorData: string; signature: string } };
  expect(response.id).toBe(b64url(credentialId));
  const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'));
  expect(clientData).toMatchObject({ type: 'webauthn.get', challenge: CHALLENGE, origin: 'http://localhost:4173' });
  expect(response.response.signature.length).toBeGreaterThan(0);
  expect(response.response.authenticatorData.length).toBeGreaterThan(0);
  expect(wire.writes.some((w) => w.method === 'INVOKE' && w.table === 'accept-invite')).toBe(true);
  // The code was never used: one check, no verify. The home page then asks where the session stands.
  // The home page asks after it renders, so wait for that call rather than read the wire at once (it raced 1 in 40).
  await expect.poll(() => wire.writes.filter((w) => w.table === 'second-factor').map((w) => (w.body as { action: string }).action)).toEqual(['check', 'status']);
  expect(wire.writes.some((w) => w.table === 'admin-otp')).toBe(false);
});

test('on the login page, a passkey alone signs the person in: no email, no password, no code', async ({ page }) => {
  const credentialId = randomBytes(16);
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  const userHandle = Buffer.from(USER_ID);

  const wire = await stubSupabase(page, {}, {
    // login-verify trusted this device, so the check that follows needs no code.
    'second-factor': () => ({ requiresOtp: false }),
    passkeys: (body) => {
      const { action } = body as { action: string };
      if (action === 'login-options') {
        return { challengeId: 'challenge-1', options: { challenge: CHALLENGE, rpId: 'localhost', timeout: 60000, userVerification: 'required', allowCredentials: [] } };
      }
      if (action === 'login-verify') return { verified: true, tokenHash: 'token-hash-1' };
      return {};
    },
  });
  // The stub seeds a session; this door is for someone who has none.
  await page.addInitScript(() => window.localStorage.removeItem('sb-e2e-auth-token'));
  const auth: { url: string; body: unknown }[] = [];
  await page.route('**/auth/v1/**', (route) => {
    let body: unknown = null;
    try { body = route.request().postDataJSON(); } catch { /* not JSON */ }
    auth.push({ url: route.request().url(), body });
    return route.fallback();
  });

  const { cdp, authenticatorId } = await virtualAuthenticator(page);
  await cdp.send('WebAuthn.addCredential', {
    authenticatorId,
    credential: {
      credentialId: credentialId.toString('base64'), isResidentCredential: true, rpId: 'localhost',
      privateKey: pkcs8.toString('base64'), userHandle: userHandle.toString('base64'), signCount: 0,
    },
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'الدخول بمفتاح المرور' }).click();
  await expect(page.getByText('تم الدخول بمفتاح المرور')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // The authenticator was asked for any passkey it holds for this site, and
  // signed the server's challenge with the person verified.
  const verify = invokes(wire, 'login-verify');
  expect(verify).toHaveLength(1);
  expect(verify[0].challengeId).toBe('challenge-1');
  expect(String(verify[0].fingerprint)).toMatch(/[0-9a-f-]{36}/);
  const response = verify[0].response as { id: string; response: { clientDataJSON: string; authenticatorData: string; userHandle: string } };
  expect(response.id).toBe(b64url(credentialId));
  expect(response.response.userHandle).toBe(b64url(userHandle));
  const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'));
  expect(clientData).toMatchObject({ type: 'webauthn.get', challenge: CHALLENGE, origin: 'http://localhost:4173' });
  const flags = Buffer.from(response.response.authenticatorData, 'base64url')[32];
  expect(flags & 0x04).toBe(0x04); // user verified: the fingerprint or face, not just a tap

  // The session was opened with the server's one-time token, never a password.
  const verifyCalls = auth.filter((a) => new URL(a.url).pathname.endsWith('/auth/v1/verify'));
  expect(verifyCalls.map((a) => a.body)).toEqual([expect.objectContaining({ token_hash: 'token-hash-1', type: 'magiclink' })]);
  expect(auth.some((a) => a.url.includes('grant_type=password'))).toBe(false);
  expect(wire.writes.some((w) => w.method === 'INVOKE' && w.table === 'accept-invite')).toBe(true);
  expect(wire.writes.some((w) => w.table === 'admin-otp')).toBe(false);
  // The new session is checked with the same fingerprint, which records it as passed.
  const checks = wire.writes.filter((w) => w.table === 'second-factor' && (w.body as { action: string }).action === 'check');
  expect(checks.map((w) => w.body)).toEqual([{ action: 'check', fingerprint: verify[0].fingerprint }]);
});
