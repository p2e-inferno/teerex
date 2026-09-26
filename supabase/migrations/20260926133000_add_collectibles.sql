-- Collectibles V1: descriptive state for creator-issued Unlock-backed editions.
-- Ownership, supply, per-wallet limits, price and balances remain authoritative on-chain.

create table if not exists public.collectibles (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null,
  creator_address text not null,
  name text not null,
  description text,
  image_url text not null,
  chain_id bigint not null,
  currency text not null,
  price numeric not null,
  max_supply integer not null,
  max_keys_per_address integer not null default 1,
  lock_address text not null,
  transaction_hash text not null,
  is_claimable boolean not null default false,
  fulfillment_note text,
  is_public boolean not null default true,
  transferable boolean not null default true,
  nft_metadata_set boolean not null default true,
  nft_base_uri text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint collectibles_name_not_blank check (length(btrim(name)) > 0),
  constraint collectibles_image_not_blank check (length(btrim(image_url)) > 0),
  constraint collectibles_chain_positive check (chain_id > 0),
  constraint collectibles_currency_not_blank check (length(btrim(currency)) > 0),
  constraint collectibles_price_positive check (price > 0),
  constraint collectibles_max_supply_positive check (max_supply > 0),
  constraint collectibles_max_keys_per_address_positive check (max_keys_per_address > 0),
  constraint collectibles_max_keys_within_supply check (max_keys_per_address <= max_supply),
  constraint collectibles_wallet_format check (creator_address ~ '^0x[0-9a-f]{40}$'),
  constraint collectibles_lock_format check (lower(lock_address) ~ '^0x[0-9a-f]{40}$'),
  constraint collectibles_transaction_hash_format check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  constraint collectibles_claim_terms check (
    not is_claimable or length(btrim(coalesce(fulfillment_note, ''))) > 0
  )
);

create unique index if not exists collectibles_chain_lock_unique
  on public.collectibles (chain_id, lower(lock_address));

create index if not exists collectibles_creator_id_idx
  on public.collectibles (creator_id, created_at desc);

create index if not exists collectibles_creator_address_idx
  on public.collectibles (lower(creator_address), created_at desc);

create index if not exists collectibles_public_created_idx
  on public.collectibles (is_public, created_at desc);

alter table public.collectibles enable row level security;

comment on table public.collectibles is
  'TeeRex creator collectible listings. Unlock PublicLock is authoritative for ownership, price, supply, per-wallet limit and funds.';
