-- The public tables in an order that loads parents before children: each
-- table after every table its foreign keys point to. Cycles (a table pointing
-- at itself or two tables at each other) are broken by the import running
-- with triggers and foreign-key checks suspended; the order only keeps the
-- common case readable.
WITH RECURSIVE t AS (
  SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
), deps AS (
  SELECT DISTINCT con.conrelid AS child, con.confrelid AS parent
    FROM pg_constraint con JOIN t ON t.oid = con.conrelid
   WHERE con.contype = 'f' AND con.conrelid <> con.confrelid
     AND con.confrelid IN (SELECT oid FROM t)
), lvl AS (
  SELECT oid, 0 AS depth FROM t WHERE oid NOT IN (SELECT child FROM deps)
  UNION ALL
  SELECT d.child, l.depth + 1 FROM deps d JOIN lvl l ON l.oid = d.parent WHERE l.depth < 30
)
SELECT relname FROM (
  SELECT t.relname, m.d FROM t JOIN (SELECT oid, max(depth) d FROM lvl GROUP BY oid) m USING (oid)
  UNION ALL
  SELECT relname, 999 FROM t WHERE oid NOT IN (SELECT oid FROM lvl)
) o ORDER BY d, relname;
