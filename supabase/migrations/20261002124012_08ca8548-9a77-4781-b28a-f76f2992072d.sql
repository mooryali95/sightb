REVOKE EXECUTE ON FUNCTION public.protect_fund_with_transfers() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.plpgsql_block_begin(text) SET search_path = public;