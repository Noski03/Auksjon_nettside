-- =====================================================================
--  Prøver på budmotoren. Kjøres med tests/run.sh.
--  Hver test skriver OK eller FEIL. Se README for hvordan du kjører.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then
    raise notice 'OK    %  (=%)', rpad(label, 46), got;
  else
    raise exception 'FEIL  %  fikk % — ventet %', rpad(label, 46), got, want;
  end if;
end $$;

create or replace function pg_temp.raises(label text, sql text, frag text)
returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if position(lower(frag) in lower(sqlerrm)) > 0 then
      raise notice 'OK    %  (avvist: %)', rpad(label, 46), left(sqlerrm, 44);
      return;
    end if;
    raise exception 'FEIL  %  feil melding: %', rpad(label, 46), sqlerrm;
  end;
  raise exception 'FEIL  %  skulle vært avvist, men gikk gjennom', rpad(label, 46);
end $$;

create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('test.uid', coalesce(u::text, ''), false);
$$;

create or replace function pg_temp.mkuser(nick text, complete boolean default true)
returns uuid language plpgsql as $$
declare uid uuid;
begin
  insert into auth.users (email, raw_user_meta_data)
  values (nick || '@test.no', jsonb_build_object('display_name', nick))
  returning id into uid;
  if complete then
    update public.profiles set
      full_name = initcap(nick) || ' Duesen', phone = '+47 900 00 000',
      address = 'Slagveien 1', postal_code = '0150', city = 'Oslo'
    where id = uid;
  end if;
  return uid;
end $$;

create or replace function pg_temp.mklot(
  start_price numeric, minutes_left numeric default 60,
  reserve numeric default null, seller uuid default null,
  soft_close integer default 180)
returns uuid language plpgsql as $$
declare a uuid;
begin
  insert into public.auctions (title, lot_no, starting_price, reserve_price,
                               starts_at, ends_at, status, seller_id, soft_close_seconds)
  values ('Blå duehann', 1, start_price, reserve,
          now() - interval '1 hour', now() + make_interval(secs => minutes_left * 60),
          'live', seller, soft_close)
  returning id into a;
  return a;
end $$;

-- =====================================================================
do $$
declare
  ann uuid; bob uuid; cid uuid; dan uuid; lot uuid; r jsonb; a public.auctions;
begin
  ann := pg_temp.mkuser('ann');
  bob := pg_temp.mkuser('bob');
  cid := pg_temp.mkuser('cecilie');
  dan := pg_temp.mkuser('dag', false);   -- mangler kontaktinfo

  raise notice '';
  raise notice '--- 1. Enkeltbud og proxy ---';

  lot := pg_temp.mklot(1000);
  perform pg_temp.as_user(ann);

  -- Utropspris 1000, trinn over 1000 er 50 → min_bid = 1000 (første bud)
  select * into a from public.auctions where id = lot;
  perform pg_temp.check('min_bid før første bud = utropspris', a.min_bid, 1000::numeric);

  r := public.place_bid(lot, 1000);
  perform pg_temp.check('Anns første bud gir tilslag på utropspris', (r->>'price')::numeric, 1000::numeric);
  perform pg_temp.check('Ann leder', r->>'result', 'leading');

  select * into a from public.auctions where id = lot;
  perform pg_temp.check('neste bud må være 1000+100', a.min_bid, 1100::numeric);
  perform pg_temp.check('budteller', a.bid_count, 1);

  raise notice '';
  raise notice '--- 2. Maksbud slår maksbud ---';

  -- Ann la inn tak 1000. Bob legger inn tak 3000.
  perform pg_temp.as_user(bob);
  r := public.place_bid(lot, 3000);
  perform pg_temp.check('Bob overtar ledelsen', r->>'result', 'leading');
  -- Anns automatikk svarer med alt hun hadde (1000 = allerede prisen, ingen ny rad),
  -- Bob legges inn ett trinn over 1000 → 1050. Ikke 3000: taket er hemmelig.
  perform pg_temp.check('Bob betaler bare ett trinn over Ann', (r->>'price')::numeric, 1100::numeric);

  select * into a from public.auctions where id = lot;
  perform pg_temp.check('Bobs tak lekker ikke ut i prisen', a.current_price, 1100::numeric);
  perform pg_temp.check('maksbud er hemmelig i budtabellen',
    (select count(*) from public.bids b where b.amount > 1100 and b.auction_id = lot), 0::bigint);

  raise notice '';
  raise notice '--- 3. Bud under ledende maksbud ---';

  perform pg_temp.as_user(cid);
  r := public.place_bid(lot, 2000);          -- under Bobs 3000
  perform pg_temp.check('Cecilie blir overbudt umiddelbart', r->>'result', 'outbid');
  perform pg_temp.check('Bobs automatikk svarer 2000+100', (r->>'price')::numeric, 2100::numeric);

  select * into a from public.auctions where id = lot;
  perform pg_temp.check('Bob leder fortsatt', a.leader_id, bob);
  perform pg_temp.check('Cecilies bud står i historikken',
    (select count(*) from public.bids b where b.bidder_id = cid and b.auction_id = lot), 1::bigint);

  raise notice '';
  raise notice '--- 4. Likt maksbud: den som var først beholder ledelsen ---';

  lot := pg_temp.mklot(500);
  perform pg_temp.as_user(ann); r := public.place_bid(lot, 2000);
  perform pg_temp.as_user(bob); r := public.place_bid(lot, 2000);
  perform pg_temp.check('Bob vinner ikke på likt tak', r->>'result', 'outbid');
  select * into a from public.auctions where id = lot;
  perform pg_temp.check('Ann beholder ledelsen ved likt bud', a.leader_id, ann);
  perform pg_temp.check('prisen stopper på begges tak', a.current_price, 2000::numeric);

  raise notice '';
  raise notice '--- 5. Heve eget tak endrer ikke prisen ---';

  perform pg_temp.as_user(ann);
  r := public.place_bid(lot, 5000);
  perform pg_temp.check('egen takheving', r->>'result', 'limit_raised');
  select * into a from public.auctions where id = lot;
  perform pg_temp.check('prisen står stille', a.current_price, 2000::numeric);

  perform pg_temp.raises('samme tak to ganger avvises',
    format('select public.place_bid(%L, 5000)', lot), 'allerede et maksbud');

  raise notice '';
  raise notice '--- 6. Ugyldige bud ---';

  lot := pg_temp.mklot(1000);
  perform pg_temp.as_user(ann);
  perform pg_temp.raises('bud under utropspris',
    format('select public.place_bid(%L, 999)', lot), 'Minste gyldige bud');

  r := public.place_bid(lot, 1000);
  perform pg_temp.as_user(bob);
  perform pg_temp.raises('bud som ikke når neste trinn',
    format('select public.place_bid(%L, 1020)', lot), 'Minste gyldige bud');

  perform pg_temp.as_user(dan);
  perform pg_temp.raises('bruker uten kontaktinfo',
    format('select public.place_bid(%L, 2000)', lot), 'Fyll ut navn');

  perform pg_temp.as_user(null);
  perform pg_temp.raises('ikke innlogget',
    format('select public.place_bid(%L, 2000)', lot), 'innlogget');

  lot := pg_temp.mklot(100, 60, null, ann);
  perform pg_temp.as_user(ann);
  perform pg_temp.raises('selger byr på eget lodd',
    format('select public.place_bid(%L, 500)', lot), 'eget lodd');

  raise notice '';
  raise notice '--- 7. Antisniping ---';

  lot := pg_temp.mklot(100, 1);            -- 1 minutt igjen, 180 s vindu
  perform pg_temp.as_user(ann);
  r := public.place_bid(lot, 100);
  perform pg_temp.check('bud på tampen forlenger runden', (r->>'extended')::boolean, true);
  select * into a from public.auctions where id = lot;
  perform pg_temp.check('ny slutt er ca. 3 min fram',
    (a.ends_at - now() between interval '170 seconds' and interval '185 seconds'), true);
  perform pg_temp.check('forlengelser telles', a.extension_count, 1);

  lot := pg_temp.mklot(100, 60);           -- god tid igjen
  perform pg_temp.as_user(ann);
  r := public.place_bid(lot, 100);
  perform pg_temp.check('bud i god tid forlenger ikke', (r->>'extended')::boolean, false);

  raise notice '';
  raise notice '--- 8. Avslutning, vinner og e-post ---';

  lot := pg_temp.mklot(1000, 60);
  perform pg_temp.as_user(ann); r := public.place_bid(lot, 1000);
  perform pg_temp.as_user(bob); r := public.place_bid(lot, 4000);
  update public.auctions set ends_at = now() - interval '1 second' where id = lot;

  perform pg_temp.check('tick avslutter én auksjon', public.tick_auctions() >= 1, true);
  select * into a from public.auctions where id = lot;
  perform pg_temp.check('status er avsluttet', a.status::text, 'ended');
  perform pg_temp.check('Bob er vinner', a.winner_id, bob);
  perform pg_temp.check('tilslagspris', a.winning_price, 1100::numeric);
  perform pg_temp.check('e-post til vinner i kø',
    (select count(*) from public.outbox o where o.auction_id = lot and o.kind = 'winner'), 1::bigint);
  perform pg_temp.check('varsel om overbud til Ann',
    (select count(*) from public.outbox o where o.auction_id = lot and o.kind = 'outbid'), 1::bigint);

  perform pg_temp.raises('bud etter at runden er over',
    format('select public.place_bid(%L, 9000)', lot), 'avsluttet');

  raise notice '';
  raise notice '--- 9. Minstepris ikke nådd ---';

  lot := pg_temp.mklot(1000, 60, 5000);
  perform pg_temp.as_user(ann); r := public.place_bid(lot, 1200);
  update public.auctions set ends_at = now() - interval '1 second' where id = lot;
  perform public.tick_auctions();
  select * into a from public.auctions where id = lot;
  perform pg_temp.check('ingen vinner under minstepris', a.winner_id, null::uuid);
  perform pg_temp.check('minstepris markert som ikke nådd', a.reserve_met, false);
  perform pg_temp.check('ingen e-post sendes ut',
    (select count(*) from public.outbox o where o.auction_id = lot and o.kind in ('winner','seller')), 0::bigint);

  raise notice '';
  raise notice '--- 10. Auksjon som ikke har åpnet ---';

  insert into public.auctions (title, starting_price, starts_at, ends_at, status)
  values ('Kommende lodd', 500, now() + interval '2 hours', now() + interval '5 hours', 'scheduled')
  returning id into lot;
  perform pg_temp.as_user(ann);
  perform pg_temp.raises('bud før åpning',
    format('select public.place_bid(%L, 500)', lot), 'ikke åpen');

  update public.auctions set starts_at = now() - interval '1 minute' where id = lot;
  perform public.tick_auctions();
  select * into a from public.auctions where id = lot;
  perform pg_temp.check('tick åpner auksjonen', a.status::text, 'live');

  raise notice '';
  raise notice '--- 11. Budtrinn ---';
  perform pg_temp.check('trinn ved 300',    public.bid_step(300),    25::numeric);
  perform pg_temp.check('trinn ved 800',    public.bid_step(800),    50::numeric);
  perform pg_temp.check('trinn ved 4000',   public.bid_step(4000),   250::numeric);
  perform pg_temp.check('trinn ved 25000',  public.bid_step(25000),  1000::numeric);

  raise notice '';
  raise notice '--- 12. Ingen kan gjøre seg selv til admin ---';
  perform pg_temp.as_user(ann);
  update public.profiles set is_admin = true where id = ann;
  perform pg_temp.check('is_admin blir tvunget tilbake',
    (select p.is_admin from public.profiles p where p.id = ann), false);

  raise notice '';
  raise notice '======  ALLE PRØVER BESTÅTT  ======';
end $$;
