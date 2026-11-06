-- Everything the move carries, as one JSON document: every public table, and
-- the sign-in records (auth.users keeps the password hash, auth.identities the
-- sign-in methods) so nobody resets a password after the move. Read only.
--
-- Run it on the old database through Lovable's read access and save the result
-- as export.json. It holds password hashes: keep it out of the repository and
-- delete it once imported.
SELECT json_build_object(
  'public', (
    SELECT json_object_agg(c.relname, (xpath('/row/j/text()', query_to_xml(
             format('SELECT COALESCE(json_agg(t), ''[]''::json) AS j FROM public.%I t', c.relname), false, true, '')))[1]::text::json)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  'auth_users', (SELECT COALESCE(json_agg(u), '[]'::json) FROM auth.users u),
  'auth_identities', (SELECT COALESCE(json_agg(i), '[]'::json) FROM auth.identities i)
) AS export;
