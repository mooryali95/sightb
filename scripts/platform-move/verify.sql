-- One row describing the data: every public table's row count and the money
-- totals that matter, as a single JSON document. Run it on the old database
-- and on the new one; the move is complete only when the two are identical.
-- Read only.
SELECT jsonb_build_object(
  'rows', (
    SELECT jsonb_object_agg(t.relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.relname), false, true, '')))[1]::text::bigint)
      FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relkind = 'r'
  ),
  'users', (SELECT count(*) FROM auth.users),
  'expenses_by_status', (SELECT jsonb_object_agg(approval_status, s) FROM (SELECT approval_status, round(sum(amount)::numeric, 2) s FROM public.expenses GROUP BY 1) x),
  'revenues_by_status', (SELECT jsonb_object_agg(status, s) FROM (SELECT status, round(sum(amount)::numeric, 2) s FROM public.revenues GROUP BY 1) x),
  'funds_total', (SELECT round(COALESCE(sum(amount), 0)::numeric, 2) FROM public.project_funds),
  'contracts_total', (SELECT round(COALESCE(sum(contract_value), 0)::numeric, 2) FROM public.projects),
  'ledger_total', (SELECT round(COALESCE(sum(amount), 0)::numeric, 2) FROM public.intercompany_entries)
) AS fingerprint;
