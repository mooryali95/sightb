-- The second factor, for database functions that bypass row-level security.
--
-- 20260924150000 put a RESTRICTIVE second_factor policy on every table, but a
-- SECURITY DEFINER function runs as its owner and reads past those policies.
-- The ones a signed-in user may call from the browser would hand a
-- password-only session what the tables refuse it. So:

-- 1. The guard itself: refuses a session that owes its second factor, under
--    the same rule as the policies (and nothing while enforcement is off).
CREATE OR REPLACE FUNCTION public.require_second_factor()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.second_factor_ok() THEN
    RAISE EXCEPTION 'أكمل التحقق بخطوتين لهذه الجلسة أولاً.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.require_second_factor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_second_factor() TO authenticated, service_role;

-- 2. custody_snapshot and fund_total_spent check no access at all: any
--    signed-in user could read any custody's or fund's totals by id. The app
--    never calls them; only other definer functions do, which run as the
--    owner and keep their right to. So users lose it.
REVOKE EXECUTE ON FUNCTION public.custody_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fund_total_spent(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Every other definer function a signed-in user may call gets the guard as
--    its first statement. The list comes from the database, not from reading
--    migrations, and each body is the live one (pg_get_functiondef): the
--    guard is added to whatever version is there, never a copy of an old one.
--    Left out: the access helpers row-level policies call (guarding them
--    would repeat the table policies row by row) and the second-factor
--    functions themselves. Trigger functions are not callable. A function in
--    a language other than plpgsql or sql stops the migration.
--
--    In plpgsql the guard goes right after the block's own BEGIN. A text
--    search is not enough to find it: a comment or a string in the DECLARE
--    section can say "begin" first (a test caught exactly that). So this
--    walks the body, skipping comments, quoted strings and names, and
--    dollar-quoted text, and returns where the first real BEGIN starts.
CREATE OR REPLACE FUNCTION public.plpgsql_block_begin(body text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $f$
DECLARE
  pos int := 1;
  n int := length(body);
  c text;
  tag text;
  stop int;
BEGIN
  WHILE pos <= n LOOP
    c := substr(body, pos, 1);
    IF substr(body, pos, 2) = '--' THEN
      stop := strpos(substr(body, pos), E'\n');
      pos := CASE WHEN stop = 0 THEN n + 1 ELSE pos + stop END;
      CONTINUE;
    ELSIF substr(body, pos, 2) = '/*' THEN
      stop := strpos(substr(body, pos + 2), '*/');
      pos := CASE WHEN stop = 0 THEN n + 1 ELSE pos + 2 + stop + 1 END;
      CONTINUE;
    ELSIF c = '''' OR c = '"' THEN
      pos := pos + 1;
      LOOP
        EXIT WHEN pos > n;
        IF substr(body, pos, 1) = c THEN
          IF substr(body, pos + 1, 1) = c THEN pos := pos + 2; CONTINUE; END IF;
          EXIT;
        END IF;
        pos := pos + 1;
      END LOOP;
      pos := pos + 1;
      CONTINUE;
    ELSIF c = '$' THEN
      tag := substring(substr(body, pos) FROM '^\$[A-Za-z_]*\$');
      IF tag IS NOT NULL THEN
        stop := strpos(substr(body, pos + length(tag)), tag);
        pos := CASE WHEN stop = 0 THEN n + 1 ELSE pos + length(tag) + stop - 1 + length(tag) END;
        CONTINUE;
      END IF;
    ELSIF upper(substr(body, pos, 5)) = 'BEGIN'
      AND (pos = 1 OR substr(body, pos - 1, 1) !~ '[A-Za-z0-9_$]')
      AND substr(body, pos + 5, 1) !~ '[A-Za-z0-9_$]' THEN
      RETURN pos;
    END IF;
    pos := pos + 1;
  END LOOP;
  RETURN 0;
END;
$f$;
REVOKE ALL ON FUNCTION public.plpgsql_block_begin(text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  f record;
  def text;
  head text;
  body text;
  marker int;
  at int;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, l.lanname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.prokind = 'f'
       AND p.prorettype <> 'trigger'::regtype
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND p.proname NOT IN (
         'has_role', 'has_access', 'can_edit',
         'can_access_expense_receipt', 'can_access_resource_receipt',
         'second_factor_ok', 'second_factor_required', 'require_second_factor'
       )
  LOOP
    def := pg_get_functiondef(f.oid);
    CONTINUE WHEN def ILIKE '%require_second_factor%';
    marker := position('AS $function$' IN def);
    IF marker = 0 THEN
      RAISE EXCEPTION 'second factor: cannot find the body of %', f.proname;
    END IF;
    head := left(def, marker + length('AS $function$') - 1);
    body := substr(def, marker + length('AS $function$'));
    IF f.lanname = 'plpgsql' THEN
      at := public.plpgsql_block_begin(body);
      IF at = 0 THEN
        RAISE EXCEPTION 'second factor: no BEGIN in %', f.proname;
      END IF;
      body := left(body, at + 4) || ' PERFORM public.require_second_factor();' || substr(body, at + 5);
    ELSIF f.lanname = 'sql' THEN
      body := ' SELECT public.require_second_factor();' || body;
    ELSE
      RAISE EXCEPTION 'second factor: % is in %, which this cannot guard', f.proname, f.lanname;
    END IF;
    EXECUTE head || body;
    RAISE NOTICE 'second factor now guards %', f.proname;
  END LOOP;
END $$;
