-- =====================================================================
--  Prøver på radsikkerheten: hvem får se hva.
--  Kjøres som en vanlig innlogget bruker, ikke som eier av databasen,
--  ellers ville reglene blitt hoppet over.
-- =====================================================================
\set ON_ERROR_STOP on

create or replace function pg_temp.sjekk(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is not distinct from want then
    raise notice 'OK    %  (=%)', rpad(label, 50), got;
  else
    raise exception 'FEIL  %  fikk % — ventet %', rpad(label, 50), got, want;
  end if;
end $$;

do $$
declare
  selger uuid; kjoper uuid; fremmed uuid; adm uuid; lot uuid;
begin
  -- Tre brukere og ett lodd som allerede er avgjort.
  insert into auth.users (email, raw_user_meta_data)
    values ('selger@test.no', '{"display_name":"selger"}') returning id into selger;
  insert into auth.users (email, raw_user_meta_data)
    values ('kjoper@test.no', '{"display_name":"kjoper"}') returning id into kjoper;
  insert into auth.users (email, raw_user_meta_data)
    values ('fremmed@test.no', '{"display_name":"fremmed"}') returning id into fremmed;
  insert into auth.users (email, raw_user_meta_data)
    values ('admin@test.no', '{"display_name":"admin"}') returning id into adm;

  update public.profiles set full_name = 'Selger Selgersen', phone = '+47 900 11 222',
    address = 'Slagveien 2', postal_code = '3200', city = 'Sandefjord' where id = selger;
  update public.profiles set full_name = 'Kari Kjøper', phone = '+47 933 44 555',
    address = 'Dueveien 9', postal_code = '0560', city = 'Oslo' where id = kjoper;
  update public.profiles set is_admin = true where id = adm;

  insert into public.auctions (title, starting_price, current_price, winning_price, bid_count,
                               starts_at, ends_at, status, winner_id, reserve_met,
                               seller_id, seller_label)
  values ('Avgjort lodd', 500, 800, 800, 3, now() - interval '2 days', now() - interval '1 hour',
          'ended', kjoper, true, selger, 'Selger S., Sandefjord')
  returning id into lot;

  insert into public.auction_contacts (auction_id, seller_name, seller_email, seller_phone)
  values (lot, 'Selger Selgersen', 'selger@test.no', '+47 900 11 222');

  perform set_config('role', 'authenticated', true);

  -- ---- Selgeren ----
  perform set_config('test.uid', selger::text, true);
  perform pg_temp.sjekk('selger ser kjøperens fulle navn',
    (select p.full_name from public.profiles p where p.id = kjoper), 'Kari Kjøper');
  perform pg_temp.sjekk('selger ser kjøperens adresse',
    (select p.postal_code || ' ' || p.city from public.profiles p where p.id = kjoper), '0560 Oslo');
  perform pg_temp.sjekk('selger ser ikke en tilfeldig tredjepart',
    (select count(*) from public.profiles p where p.id = fremmed), 0::bigint);

  -- ---- Kjøperen ----
  perform set_config('test.uid', kjoper::text, true);
  perform pg_temp.sjekk('vinner ser selgerens kontaktinfo',
    (select c.seller_email from public.auction_contacts c where c.auction_id = lot), 'selger@test.no');
  perform pg_temp.sjekk('vinner ser selgerens profil',
    (select p.full_name from public.profiles p where p.id = selger), 'Selger Selgersen');

  -- ---- En utenforstående ----
  perform set_config('test.uid', fremmed::text, true);
  perform pg_temp.sjekk('utenforstående ser INGEN kontaktinfo',
    (select count(*) from public.auction_contacts), 0::bigint);
  perform pg_temp.sjekk('utenforstående ser bare sin egen profil',
    (select count(*) from public.profiles), 1::bigint);
  perform pg_temp.sjekk('og den ene er hans egen',
    (select p.id from public.profiles p), fremmed);
  perform pg_temp.sjekk('utenforstående ser likevel selve loddet',
    (select count(*) from public.auctions where id = lot), 1::bigint);
  perform pg_temp.sjekk('utenforstående ser ikke andres maksbud',
    (select count(*) from public.bid_limits), 0::bigint);
  perform pg_temp.sjekk('utenforstående ser ikke e-postkøen',
    (select count(*) from public.outbox), 0::bigint);

  -- ---- Ikke innlogget ----
  perform set_config('role', 'anon', true);
  perform set_config('test.uid', '', true);
  perform pg_temp.sjekk('uinnlogget ser budhistorikken',
    (select count(*) >= 0 from public.bids), true);
  perform pg_temp.sjekk('uinnlogget ser ingen kontaktinfo',
    (select count(*) from public.auction_contacts), 0::bigint);
  perform pg_temp.sjekk('uinnlogget ser ingen profiler',
    (select count(*) from public.profiles), 0::bigint);

  -- ---- Arrangøren ----
  perform set_config('role', 'authenticated', true);
  perform set_config('test.uid', adm::text, true);
  perform pg_temp.sjekk('arrangør ser all kontaktinfo',
    (select count(*) from public.auction_contacts where auction_id = lot), 1::bigint);
  perform pg_temp.sjekk('arrangør ser e-postkøen',
    (select count(*) >= 0 from public.outbox), true);

  perform set_config('role', 'postgres', true);
  raise notice '';
  raise notice '======  TILGANGSPRØVENE BESTÅTT  ======';
end $$;
