-- =====================================================================
--  DUEAUKSJON — databaseskjema
--  Kjør denne filen i Supabase → SQL Editor → New query → Run.
--  Filen er idempotent: den tåler å kjøres flere ganger.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  0. BUDTRINN
--  Hvor mye et bud må øke med, avhengig av hvor høyt det ligger.
--  Må defineres før tabellene, fordi auctions.min_bid bruker den.
--  Vil du endre trinnene er det bare denne funksjonen du rører.
-- ---------------------------------------------------------------------
create or replace function public.bid_step(p numeric)
returns numeric language sql immutable parallel safe as $$
  select case
    when p <   500 then 25
    when p <  1000 then 50
    when p <  2500 then 100
    when p <  5000 then 250
    when p < 10000 then 500
    else                1000
  end::numeric;
$$;

-- ---------------------------------------------------------------------
--  1. PROFILER
--  Hver bruker i auth.users får en rad her. Kontaktinfoen er privat og
--  blir bare synlig for motparten når en auksjon er avgjort.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text        not null default '',   -- vises offentlig i budhistorikken
  full_name     text        not null default '',
  email         text        not null default '',
  phone         text        not null default '',
  address       text        not null default '',
  postal_code   text        not null default '',
  city          text        not null default '',
  country       text        not null default 'Norge',
  club          text        not null default '',   -- dueforening / slag
  is_admin      boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.profiles.display_name is 'Offentlig alias i budhistorikk. Aldri fullt navn.';

-- ---------------------------------------------------------------------
--  2. AUKSJONSRUNDER (samlinger av lodd, f.eks. "Vårauksjon 2026")
-- ---------------------------------------------------------------------
create table if not exists public.collections (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  description   text not null default '',
  opens_at      timestamptz,
  closes_at     timestamptz,
  is_published  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  3. AUKSJONER (ett lodd = én due)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.auction_status as enum ('draft','scheduled','live','ended','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.auctions (
  id             uuid primary key default gen_random_uuid(),
  collection_id  uuid references public.collections(id) on delete set null,
  lot_no         integer,

  -- Beskrivelse av duen
  title          text not null,
  description    text not null default '',
  ring_number    text not null default '',
  breed          text not null default '',      -- stamme
  sex            text not null default 'ukjent',
  hatch_year     integer,
  color          text not null default '',
  sire_ring      text not null default '',      -- far
  dam_ring       text not null default '',      -- mor
  pedigree_url   text not null default '',
  image_urls     text[] not null default '{}',

  -- Pris og bud
  starting_price numeric(12,2) not null default 100 check (starting_price >= 0),
  reserve_price  numeric(12,2) check (reserve_price is null or reserve_price >= 0),
  current_price  numeric(12,2) not null default 0,
  leader_id      uuid references public.profiles(id) on delete set null,
  bid_count      integer not null default 0,

  -- Minste tillatte neste bud. Holdes oppdatert av triggeren
  -- sett_min_bid i 02_functions.sql.
  --
  -- Hvorfor en vanlig kolonne og ikke en generert en: PostgreSQL sender
  -- ikke genererte kolonner med i sanntidsmeldingene. Da ville alle
  -- andre enn den som nettopp bød fått et tomt «neste gyldige bud».
  min_bid        numeric(12,2) not null default 0,

  -- Tid
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz not null,
  soft_close_seconds integer not null default 180 check (soft_close_seconds >= 0),
  extension_count    integer not null default 0,

  -- Avslutning
  status         public.auction_status not null default 'draft',
  winner_id      uuid references public.profiles(id) on delete set null,
  winning_price  numeric(12,2),
  reserve_met    boolean,
  settled_at     timestamptz,

  -- Selger. Admin oppretter loddet, men selgeren er den som skal ha
  -- kontaktinfoen til vinneren.
  --   seller_id    — peker på en registrert bruker, hvis selgeren har konto
  --   seller_label — det publikum får se, f.eks. "Ola N., Sandefjord"
  -- E-post og telefon ligger IKKE her: auctions er offentlig lesbar, så
  -- de hører hjemme i auction_contacts lenger nede.
  seller_id      uuid references public.profiles(id) on delete set null,
  seller_label   text not null default '',

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  check (ends_at > starts_at),
  check (sex in ('hann','hunn','ukjent'))
);

create index if not exists auctions_status_ends_idx on public.auctions (status, ends_at);
create index if not exists auctions_collection_idx  on public.auctions (collection_id, lot_no);
create index if not exists auctions_leader_idx      on public.auctions (leader_id);
create index if not exists auctions_winner_idx      on public.auctions (winner_id);
create index if not exists auctions_seller_idx      on public.auctions (seller_id);

-- ---------------------------------------------------------------------
--  3b. SELGERENS KONTAKTINFO — ikke offentlig
--  Egen tabell nettopp fordi auctions kan leses av alle. Her gjelder
--  strengere regler: arrangør, selgeren selv, og vinneren etter at
--  runden er avgjort.
-- ---------------------------------------------------------------------
create table if not exists public.auction_contacts (
  auction_id   uuid primary key references public.auctions(id) on delete cascade,
  seller_name  text not null default '',
  seller_email text not null default '',
  seller_phone text not null default '',
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  4. BUD (offentlig budhistorikk)
--  Inneholder bevisst IKKE maksbud — se bid_limits.
-- ---------------------------------------------------------------------
create table if not exists public.bids (
  id           bigint generated always as identity primary key,
  auction_id   uuid not null references public.auctions(id) on delete cascade,
  bidder_id    uuid not null references public.profiles(id) on delete cascade,
  bidder_alias text not null,
  amount       numeric(12,2) not null,
  is_auto      boolean not null default false,   -- lagt inn av maksbud-automatikken
  created_at   timestamptz not null default now()
);
create index if not exists bids_auction_idx on public.bids (auction_id, id desc);
create index if not exists bids_bidder_idx  on public.bids (bidder_id, id desc);

-- ---------------------------------------------------------------------
--  5. MAKSBUD (hemmelig — bare eieren og admin kan lese)
-- ---------------------------------------------------------------------
create table if not exists public.bid_limits (
  auction_id uuid not null references public.auctions(id) on delete cascade,
  bidder_id  uuid not null references public.profiles(id) on delete cascade,
  max_amount numeric(12,2) not null,
  updated_at timestamptz not null default now(),
  primary key (auction_id, bidder_id)
);

-- ---------------------------------------------------------------------
--  6. FAVORITTER
-- ---------------------------------------------------------------------
create table if not exists public.watchlist (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, auction_id)
);

-- ---------------------------------------------------------------------
--  7. E-POSTKØ
--  Databasen legger e-post her. En Edge Function tømmer køen.
--  Uten e-postoppsett virker resten av siden helt likt — da ligger
--  meldingene bare og venter, synlig for admin.
-- ---------------------------------------------------------------------
create table if not exists public.outbox (
  id         bigint generated always as identity primary key,
  to_email   text not null,
  to_name    text not null default '',
  subject    text not null,
  body_html  text not null,
  body_text  text not null default '',
  kind       text not null,
  auction_id uuid references public.auctions(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0,
  error      text
);
create index if not exists outbox_pending_idx on public.outbox (created_at) where sent_at is null;
