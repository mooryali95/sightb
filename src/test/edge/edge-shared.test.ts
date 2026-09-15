/**
 * Unit tests for the two helpers the edge functions share: the HTML to
 * plain-text conversion every outgoing email carries as its text part,
 * and the unsubscribe token lookup that reuses an unused token before
 * minting one. They live under supabase/functions and run on Deno, but
 * carry no Deno imports, so they are tested here with the rest.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { htmlToPlainText } from '../../../supabase/functions/_shared/email-text.ts';
import { getOrCreateUnsubscribeToken } from '../../../supabase/functions/_shared/email-unsubscribe.ts';

describe('htmlToPlainText', () => {
  it('turns block tags into line breaks, list items into bullets, and drops style and script blocks', () => {
    const html = '<style>p{color:red}</style><h1>مرحباً</h1><p>سطر <b>أول</b></p><ul><li>بند 1</li><li>بند 2</li></ul><div>ختام</div><script>alert(1)</script>';
    expect(htmlToPlainText(html)).toBe('مرحباً\n\nسطر أول\n\n• بند 1\n• بند 2\nختام');
  });

  it('decodes the common entities and collapses runs of spaces and blank lines', () => {
    expect(htmlToPlainText('a&nbsp;&amp;&nbsp;b &lt;c&gt; &#39;d&#39; &quot;e&quot;')).toBe('a & b <c> \'d\' "e"');
    expect(htmlToPlainText('<p>x</p><br><br><br><p>y</p>   z')).toBe('x\n\ny\n\nz');
    expect(htmlToPlainText('  <p>  padded  </p>  ')).toBe('padded');
  });

  it('keeps a link\'s text and leaves an empty document empty', () => {
    expect(htmlToPlainText('<a href="https://x.co">افتح الرابط</a>')).toBe('افتح الرابط');
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText('<div></div>')).toBe('');
  });
});

describe('getOrCreateUnsubscribeToken', () => {
  const calls: { op: string; args: unknown[] }[] = [];
  const answers: { select?: unknown; insert?: unknown } = {};
  const chain = () => {
    const b: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) => Promise.resolve(answers.select ?? { data: null, error: null }).then(resolve),
    };
    for (const op of ['select', 'eq', 'is', 'order', 'limit', 'maybeSingle']) {
      b[op] = (...args: unknown[]) => { calls.push({ op, args }); return b; };
    }
    return b;
  };
  const supabase = {
    from: (table: string) => {
      calls.push({ op: 'from', args: [table] });
      return {
        select: (...args: unknown[]) => { calls.push({ op: 'select', args }); return chain(); },
        insert: (...args: unknown[]) => { calls.push({ op: 'insert', args }); return Promise.resolve(answers.insert ?? { error: null }); },
      };
    },
  };
  const ops = () => calls.map((c) => [c.op, ...c.args]);

  beforeEach(() => {
    calls.length = 0;
    delete answers.select;
    delete answers.insert;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('crypto', { randomUUID: () => 'new-token' });
  });

  it('reuses the newest unused token for the normalised address', async () => {
    answers.select = { data: { token: 'old-token' }, error: null };
    expect(await getOrCreateUnsubscribeToken(supabase, '  Big@X.CO ')).toBe('old-token');
    expect(ops()).toEqual([
      ['from', 'email_unsubscribe_tokens'], ['select', 'token'], ['eq', 'email', 'big@x.co'], ['is', 'used_at', null],
      ['order', 'created_at', { ascending: false }], ['limit', 1], ['maybeSingle'],
    ]);
    expect(ops().some(([op]) => op === 'insert')).toBe(false);
  });

  it('mints and stores a new token when none is unused, even after a failed lookup', async () => {
    answers.select = { data: null, error: null };
    expect(await getOrCreateUnsubscribeToken(supabase, 'a@x.co')).toBe('new-token');
    expect(ops().at(-1)).toEqual(['insert', { email: 'a@x.co', token: 'new-token' }]);

    calls.length = 0;
    answers.select = { data: null, error: { message: 'timeout' } };
    expect(await getOrCreateUnsubscribeToken(supabase, 'a@x.co')).toBe('new-token');
    expect(console.error).toHaveBeenCalledWith('[email-unsubscribe] Failed to load token', { message: 'timeout' });
    expect(ops().at(-1)?.[0]).toBe('insert');
  });

  it('fails loudly when the token cannot be stored', async () => {
    answers.insert = { error: { message: 'duplicate' } };
    await expect(getOrCreateUnsubscribeToken(supabase, 'a@x.co')).rejects.toThrow('Failed to create unsubscribe token');
  });
});
