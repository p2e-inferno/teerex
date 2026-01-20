-- Add payout_account_id to paystack_transactions to track which vendor account was used

ALTER TABLE public.paystack_transactions
  ADD COLUMN payout_account_id UUID REFERENCES public.vendor_payout_accounts(id);

-- Index for querying transactions by payout account (performance per CLAUDE.md)
CREATE INDEX idx_paystack_transactions_payout_account
  ON public.paystack_transactions(payout_account_id)
  WHERE payout_account_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.paystack_transactions.payout_account_id IS 'References the vendor payout account that received this payment. NULL if payment went to main platform account.';
