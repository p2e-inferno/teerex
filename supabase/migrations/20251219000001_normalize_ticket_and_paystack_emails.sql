-- Normalize emails in tickets and paystack_transactions to lowercase/trim for consistency

-- Normalize tickets.user_email
UPDATE public.tickets
SET user_email = NULLIF(lower(trim(user_email)), '')
WHERE user_email IS NOT NULL;

-- Normalize paystack_transactions.user_email
UPDATE public.paystack_transactions
SET user_email = NULLIF(lower(trim(user_email)), '')
WHERE user_email IS NOT NULL;
