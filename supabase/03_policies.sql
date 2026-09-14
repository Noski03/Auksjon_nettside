-- =====================================================================
--  DUEAUKSJON — radsikkerhet (Row Level Security)
--  Kjøres ETTER 02_functions.sql.
--
--  Hovedregelen: databasen stoler ikke på nettleseren. Selv om noen
--  åpner konsollen og skriver egne spørringer, kommer de ikke lenger
--  enn reglene her tillater.
-- =====================================================================

alter table public.profiles    enable row level security;
alter table public.collections enable row level security;
alter table public.auctions    enable row level security;
alter table public.auction_contacts enable row level security;
alter table public.bids        enable row level security;
alter table public.bid_limits  enable row level security;
alter table public.watchlist   enable row level security;
alter table public.outbox      enable row level security;

-- Ingen skriver direkte i bud- eller e-posttabellene. Alt går via
-- funksjonene, som er de eneste som kjenner reglene.
revoke insert, update, delete on public.bids       from anon, authenticated;
revoke insert, update, delete on public.bid_limits from anon, authenticated;
revoke insert, update, delete on public.outbox     from anon, authenticated;

-- ---------------------------------------------------------------------
--  PROFILER
--  Du ser din egen. Admin ser alle. Og — kjernen i hele opplegget —
--  når en auksjon er avgjort ser selger og vinner hverandres profil.
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  -- selger ser vinneren sin
  or exists (select 1 from public.auctions a
              where a.winner_id = profiles.id
                and a.seller_id = auth.uid()
                and a.status = 'ended')
  -- vinner ser selgeren sin
  or exists (select 1 from public.auctions a
              where a.seller_id = profiles.id
                and a.winner_id = auth.uid()
                and a.status = 'ended')
);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
--  AUKSJONSRUNDER
-- ---------------------------------------------------------------------
drop policy if exists collections_select on public.collections;
create policy collections_select on public.collections for select to anon, authenticated
using (is_published or public.is_admin());

drop policy if exists collections_write on public.collections;
create policy collections_write on public.collections for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
--  AUKSJONER
--  Alle kan se alt som er publisert — også uten å være innlogget.
--  Kladd er bare for admin. Bare admin oppretter og redigerer.
-- ---------------------------------------------------------------------
drop policy if exists auctions_select on public.auctions;
create policy auctions_select on public.auctions for select to anon, authenticated
using (status <> 'draft' or public.is_admin());

drop policy if exists auctions_write on public.auctions;
create policy auctions_write on public.auctions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
--  SELGERENS KONTAKTINFO
--  Arrangøren, selgeren selv, og vinneren når runden er avgjort.
-- ---------------------------------------------------------------------
drop policy if exists contacts_select on public.auction_contacts;
create policy contacts_select on public.auction_contacts for select to authenticated
using (
  public.is_admin()
  or exists (select 1 from public.auctions a
              where a.id = auction_contacts.auction_id and a.seller_id = auth.uid())
  or exists (select 1 from public.auctions a
              where a.id = auction_contacts.auction_id
                and a.winner_id = auth.uid() and a.status = 'ended')
);

drop policy if exists contacts_write on public.auction_contacts;
create policy contacts_write on public.auction_contacts for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
--  BUD
--  Budhistorikken er offentlig — det er den som gjør en auksjon
--  etterprøvbar. Den inneholder alias og beløp, aldri maksbud.
-- ---------------------------------------------------------------------
drop policy if exists bids_select on public.bids;
create policy bids_select on public.bids for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
--  MAKSBUD — hemmelig
-- ---------------------------------------------------------------------
drop policy if exists bid_limits_select on public.bid_limits;
create policy bid_limits_select on public.bid_limits for select to authenticated
using (bidder_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
--  FAVORITTER
-- ---------------------------------------------------------------------
drop policy if exists watchlist_all on public.watchlist;
create policy watchlist_all on public.watchlist for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
--  E-POSTKØ — bare admin kan se den fra nettsiden.
--  Edge-funksjonen bruker service-nøkkelen og går utenom RLS.
-- ---------------------------------------------------------------------
drop policy if exists outbox_select on public.outbox;
create policy outbox_select on public.outbox for select to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------------
--  Hvem får kalle funksjonene
-- ---------------------------------------------------------------------
revoke execute on function public.settle_auction(uuid) from anon, authenticated;
revoke execute on function public.enqueue_mail(text,text,text,text,text[],text,uuid) from anon, authenticated;

grant execute on function public.place_bid(uuid, numeric)  to authenticated;
grant execute on function public.my_max_bid(uuid)          to authenticated;
grant execute on function public.tick_auctions()           to anon, authenticated;
grant execute on function public.is_admin()                to anon, authenticated;
grant execute on function public.bid_step(numeric)         to anon, authenticated;
grant execute on function public.kr(numeric)               to anon, authenticated;

-- ---------------------------------------------------------------------
--  SANNTID
--  Disse to tabellene kringkastes til alle som ser på en auksjon.
--  Uten dette skjer ingenting live.
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.auctions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.bids;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
--  BILDER
--  Bøtte for duebilder: alle kan se, bare admin kan laste opp.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('lots', 'lots', true)
on conflict (id) do nothing;

drop policy if exists "lots public read"  on storage.objects;
create policy "lots public read" on storage.objects for select to anon, authenticated
using (bucket_id = 'lots');

drop policy if exists "lots admin write" on storage.objects;
create policy "lots admin write" on storage.objects for all to authenticated
using (bucket_id = 'lots' and public.is_admin())
with check (bucket_id = 'lots' and public.is_admin());
