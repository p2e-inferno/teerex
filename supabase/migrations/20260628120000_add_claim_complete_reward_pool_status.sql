-- Distinguish a pool whose every share was paid out to winners ("claim_complete") from one the
-- creator closed/reclaimed ("closed"). The two are different terminal states: closed is creator-
-- driven, claim_complete is reached only via winner claims. Derived in deriveRewardPoolStatus.

alter table public.reward_pools
  drop constraint if exists reward_pools_status_check;

alter table public.reward_pools
  add constraint reward_pools_status_check
  check (status in ('funded', 'results_pending', 'claiming', 'frozen', 'expired', 'claim_complete', 'closed'));
