import type { Page, Route } from '@playwright/test';
import { seed, SESSION } from './seed';

export interface Wire {
  /** Every write the app sent, in order, so a spec can assert on the payload. */
  writes: { method: string; table: string; body: unknown }[];
}

/** PostgREST puts the table in the first path segment after /rest/v1/. */
function tableOf(url: string): string {
  const m = url.match(/\/rest\/v1\/([^/?]+)/);
  return m ? m[1] : '';
}

/**
 * Apply the `?col=eq.value` filters the store actually uses. Anything more
 * exotic falls through unfiltered — deliberately, so an unsupported filter
 * shows up as a wrong-looking screen rather than a silently empty one.
 */
function applyFilters(rows: Record<string, unknown>[], url: string) {
  const params = new URL(url).searchParams;
  let out = rows;
  for (const [key, raw] of params) {
    if (key.startsWith('select') || key.startsWith('order') || key.startsWith('limit') || key.startsWith('offset')) continue;
    const eq = raw.match(/^eq\.(.*)$/);
    if (eq) out = out.filter((r) => String(r[key] ?? '') === eq[1]);
    // in.(a,b,"c d"): what .in() sends; without it a filtered update touched every row.
    const inList = raw.match(/^in\.\((.*)\)$/);
    if (inList) {
      const values = new Set(inList[1].split(',').map((v) => v.replace(/^"|"$/g, '')));
      out = out.filter((r) => values.has(String(r[key] ?? '')));
    }
  }
  return out;
}

/**
 * Stand in for Supabase over HTTP, and seed the session the app expects to
 * find already in storage.
 *
 * The storage key is not arbitrary: supabase-js derives it as
 * `sb-<first host label>-auth-token`, so it must track the VITE_SUPABASE_URL
 * the preview server was built with (https://e2e.supabase.co → sb-e2e-...).
 */
export async function stubSupabase(
  page: Page,
  /** Rows a spec needs on top of the shared seed, by table; appended, never replacing. */
  extra: Record<string, Record<string, unknown>[]> = {},
  /** Answers for edge functions, by function name; a function not listed answers an empty object. */
  functions: Record<string, (body: unknown) => unknown> = {},
  /**
   * Answers for Postgres functions called through PostgREST, by name; one not
   * listed answers an empty object. The function sees the tables and may
   * change them, as the database would.
   */
  rpcs: Record<string, (args: unknown, tables: Record<string, Record<string, unknown>[]>) => unknown> = {},
): Promise<Wire> {
  const wire: Wire = { writes: [] };
  const rows: Record<string, Record<string, unknown>[]> = JSON.parse(JSON.stringify(seed));
  for (const [table, list] of Object.entries(extra)) rows[table] = [...(rows[table] ?? []), ...list];

  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key as string, JSON.stringify(session));
      // The first-run guide is its own spec (concept-guide.spec.ts); elsewhere it is seen.
      if (window.localStorage.getItem('rouya_concept_guide_seen') === null) window.localStorage.setItem('rouya_concept_guide_seen', '1');
    },
    ['sb-e2e-auth-token', SESSION] as const,
  );

  await page.route('**/auth/v1/**', (route: Route) => {
    const url = route.request().url();
    if (url.includes('/logout')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(url.includes('/user') ? SESSION.user : SESSION),
    });
  });

  await page.route('**/rest/v1/**', async (route: Route) => {
    const req = route.request();
    const url = req.url();
    const table = tableOf(url);
    const method = req.method();
    // PostgREST returns a bare object rather than an array when the caller asks
    // for it, which is what .single() does. The store uses .single() on every
    // settlement write, so getting this wrong turns a passing write into
    // "JSON object requested, multiple (or no) rows returned".
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const json = (status: number, body: unknown) => {
      const payload = wantsObject && Array.isArray(body) ? (body[0] ?? null) : body;
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    };

    if (method === 'GET') return json(200, applyFilters(rows[table] ?? [], url));

    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { /* non-JSON write; recorded as null */ }

    // A Postgres function call is recorded under its own name, and answered
    // by the spec's function or with an empty object, never as a table write.
    if (table === 'rpc') {
      const fn = url.match(/\/rest\/v1\/rpc\/([^/?]+)/)?.[1] ?? '';
      wire.writes.push({ method: 'RPC', table: fn, body });
      const answer = rpcs[fn] ? rpcs[fn](body, rows) : {};
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) });
    }
    wire.writes.push({ method, table, body });

    if (method === 'POST') {
      const payload = Array.isArray(body) ? body : [body];
      const created = payload.map((row, i) => ({
        id: `created-${table}-${wire.writes.length}-${i}`,
        created_at: new Date().toISOString(),
        ...(row as Record<string, unknown>),
      }));
      rows[table] = [...(rows[table] ?? []), ...created];
      return json(201, created);
    }

    if (method === 'PATCH') {
      const matched = applyFilters(rows[table] ?? [], url);
      const patched = matched.map((r) => ({ ...r, ...(body as object) }));
      const ids = new Set(patched.map((r) => r.id));
      rows[table] = (rows[table] ?? []).map((r) => (ids.has(r.id) ? patched.find((p) => p.id === r.id)! : r));
      return json(200, patched);
    }

    if (method === 'DELETE') return json(200, []);
    return json(200, []);
  });

  // Storage and edge functions are not what these paths are about; answer them
  // so an unrelated 404 never fails a spec about arithmetic.
  await page.route('**/storage/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'e2e/receipt.png', path: 'e2e/receipt.png' }) }));
  // Edge function calls are recorded like writes, under the function's name,
  // so a spec can assert on what was sent; the answer is an empty object.
  await page.route('**/functions/v1/**', (route) => {
    const req = route.request();
    const fn = req.url().match(/\/functions\/v1\/([^/?]+)/)?.[1] ?? '';
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { /* non-JSON call; recorded as null */ }
    wire.writes.push({ method: 'INVOKE', table: fn, body });
    const answer = functions[fn] ? functions[fn](body) : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) });
  });

  return wire;
}
