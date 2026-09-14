-- =====================================================================
--  DUEAUKSJON — demodata
--  Valgfritt. Gir deg noe å se på før du legger inn ekte lodd.
--  Slett med:  delete from public.collections where slug = 'demo-2026';
--              delete from public.auctions where collection_id is null and title like 'Demo%';
-- =====================================================================

insert into public.collections (slug, title, description, opens_at, closes_at, sort_order)
values ('demo-2026', 'Høstauksjon 2026',
        'Ungduer og avlspar fra medlemmenes slag. Alle lodd selges uten ansvar for arrangøren; oppgjør avtales direkte mellom kjøper og selger.',
        now() - interval '2 days', now() + interval '5 days', 1)
on conflict (slug) do nothing;

with c as (select id from public.collections where slug = 'demo-2026')
insert into public.auctions
  (collection_id, lot_no, title, description, ring_number, breed, sex, hatch_year,
   color, sire_ring, dam_ring, starting_price, reserve_price,
   starts_at, ends_at, status, seller_label)
select c.id, v.lot_no, v.title, v.descr, v.ring, v.breed, v.sex, v.yr,
       v.color, v.sire, v.dam, v.start, v.reserve,
       now() - interval '1 day', now() + make_interval(secs => v.hours * 3600),
       'live', v.sname
from c, (values
  (1, 'Blå hann etter "Storm"',
      'Kraftig ungdue med god fjærkvalitet. Far har flere premieringer på mellomdistanse. Vaksinert mot paramyxo i august.',
      'NO-2026-14022', 'Janssen', 'hann', 2026, 'Blå sjekk', 'NO-2023-10877', 'NO-2024-11902',
      400, null, 26, 'Ola Nordvik'),
  (2, 'Blåsjekket hunn, Van Loon',
      'Rolig hunn fra et pålitelig par. Mor er søster til slagets beste langdistansedue.',
      'NO-2026-14023', 'Van Loon', 'hunn', 2026, 'Blåsjekk', 'NO-2022-90114', 'NO-2023-10455',
      400, 900, 27, 'Ola Nordvik'),
  (3, 'Avlspar, Meulemans',
      'Etablert par som har gitt gode unger i tre sesonger. Selges samlet.',
      'NO-2021-33019', 'Meulemans', 'ukjent', 2021, 'Rød', 'NO-2019-44120', 'NO-2020-55231',
      1500, 2500, 28, 'Kari Sæther'),
  (4, 'Hvit hunn, langdistanse',
      'Ungdue fra langdistanselinje. Begge foreldre har fullført Bergen–Oslo.',
      'NO-2026-14044', 'Egen linje', 'hunn', 2026, 'Hvit', 'NO-2022-77001', 'NO-2023-88112',
      600, null, 29, 'Kari Sæther'),
  (5, 'Ungdue etter "Bruna"',
      'God type, fin i hånden. Anbefales til avl framfor kappflyging.',
      'NO-2026-14051', 'Janssen', 'hann', 2026, 'Brun', 'NO-2021-22001', 'NO-2022-31441',
      350, null, 30, 'Ola Nordvik')
) as v(lot_no, title, descr, ring, breed, sex, yr, color, sire, dam, start, reserve, hours, sname)
where not exists (select 1 from public.auctions a where a.collection_id = c.id and a.lot_no = v.lot_no);

-- Ett avsluttet lodd, så arkivsiden ikke er tom
with c as (select id from public.collections where slug = 'demo-2026')
insert into public.auctions
  (collection_id, lot_no, title, description, ring_number, breed, sex, hatch_year, color,
   starting_price, starts_at, ends_at, status, reserve_met, seller_label)
select c.id, 99, 'Blå hann (avsluttet demo)', 'Eksempel på et lodd som er ferdig.',
       'NO-2025-12000', 'Janssen', 'hann', 2025, 'Blå', 500,
       now() - interval '9 days', now() - interval '2 days', 'ended', false, 'Ola Nordvik'
from c
where not exists (select 1 from public.auctions a where a.collection_id = c.id and a.lot_no = 99);

-- Kontaktinfo for demoselgerne (egen tabell, ikke offentlig lesbar)
insert into public.auction_contacts (auction_id, seller_name, seller_email, seller_phone)
select a.id, a.seller_label,
       case when a.seller_label = 'Ola Nordvik'
            then 'demo-selger@example.com' else 'demo-selger2@example.com' end,
       case when a.seller_label = 'Ola Nordvik'
            then '+47 901 22 333' else '+47 918 44 100' end
from public.auctions a
join public.collections c on c.id = a.collection_id and c.slug = 'demo-2026'
on conflict (auction_id) do nothing;
