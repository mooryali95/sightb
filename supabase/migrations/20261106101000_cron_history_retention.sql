-- pg_cron keeps a row for every run in cron.job_run_details and never deletes
-- one. The email queue job from 20260314014847_email_infra ran every five
-- seconds and filled it to 7.4 GB, against under 10 MB of the app's own data;
-- that job no longer exists (cron.job was empty on 6 November 2026), so the
-- history is of nothing that runs. It is emptied here, and a daily job keeps
-- seven days from now on.
--
-- TRUNCATE, not DELETE: it frees the space at once without scanning 7 GB.
-- Skipped where pg_cron is not installed (a local test database).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed: nothing to trim';
    RETURN;
  END IF;
  TRUNCATE cron.job_run_details;
  PERFORM cron.unschedule('trim-cron-history') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trim-cron-history');
  PERFORM cron.schedule('trim-cron-history', '30 4 * * *',
    $job$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$job$);
END $$;
