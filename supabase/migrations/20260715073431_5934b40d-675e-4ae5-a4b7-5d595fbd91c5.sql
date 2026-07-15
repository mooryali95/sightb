
REVOKE EXECUTE ON FUNCTION public.check_fund_balance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_custody_against_fund() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_close_custody_on_exhaustion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_cash_transfer() FROM PUBLIC, anon, authenticated;
