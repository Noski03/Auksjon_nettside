-- =====================================================================
--  DUEAUKSJON — funksjoner, triggere og budmotor
--  Kjøres ETTER 01_schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Hjelpere
-- ---------------------------------------------------------------------

-- Kroner på norsk form: 12 500, ikke 12,500. Skrevet uten å spørre
-- serveren om språk, så det ser likt ut uansett hvor databasen står.
create or replace function public.kr(n numeric)
returns text language sql immutable parallel safe as $$
  select regexp_replace(trim(to_char(round(n), 'FM9999999990')), '(\d)(?=(\d{3})+$)', '\1 ', 'g');
$$;

-- Er den innloggede brukeren admin? Egen funksjon fordi et RLS-regelverk
-- på profiles ikke kan slå opp i profiles uten å gå i uendelig løkke.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- En bruker må ha fullstendig kontaktinfo for å kunne by. Dette er hele
-- poenget med registreringen: selgeren skal kunne sende faktura.
create or replace function public.profile_is_complete(p public.profiles)
returns boolean language sql immutable as $$
  select length(trim(coalesce(p.full_name,'')))    > 1
     and length(trim(coalesce(p.email,'')))        > 3
     and length(trim(coalesce(p.phone,'')))        > 5
     and length(trim(coalesce(p.address,'')))      > 3
     and length(trim(coalesce(p.postal_code,'')))  > 3
     and length(trim(coalesce(p.city,'')))         > 1;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

-- Minste tillatte neste bud, regnet ut ved hver eneste endring av
-- loddet. Da stemmer den også om arrangøren redigerer utropsprisen.
create or replace function public.sett_min_bid()
returns trigger language plpgsql as $$
begin
  new.min_bid := case
    when new.bid_count = 0 then new.starting_price
    else new.current_price + public.bid_step(new.current_price)
  end;
  return new;
end;
$$;

drop trigger if exists auctions_min_bid on public.auctions;
create trigger auctions_min_bid before insert or update on public.auctions
  for each row execute function public.sett_min_bid();

drop trigger if exists auctions_touch on public.auctions;
create trigger auctions_touch before update on public.auctions
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Ingen innlogget bruker kan gjøre seg selv til admin ved å redigere
-- sin egen profil. Betingelsen «auth.uid() is not null» er med vilje:
-- da slipper du selv til når du sitter i SQL-editoren i Supabase og
-- skal utnevne den første arrangøren. Uinnloggede kommer uansett ikke
-- forbi radsikkerheten på profiles.
create or replace function public.guard_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;
  new.id := old.id;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_columns();

-- Ny bruker i auth.users → opprett profil med det som ble fylt ut i skjemaet.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, display_name, full_name, phone, address, postal_code, city, country, club)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(m->>'display_name'), ''), split_part(coalesce(new.email,'due'), '@', 1)),
    coalesce(m->>'full_name', ''),
    coalesce(m->>'phone', ''),
    coalesce(m->>'address', ''),
    coalesce(m->>'postal_code', ''),
    coalesce(m->>'city', ''),
    coalesce(nullif(m->>'country',''), 'Norge'),
    coalesce(m->>'club', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Selgerens kontaktinfo. Er den fylt ut på loddet brukes den; ellers
-- hentes den fra profilen til den registrerte selgeren.
create or replace function public.seller_contact(a public.auctions)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name',  coalesce(nullif(c.seller_name,''),  p.full_name, a.seller_label, ''),
    'email', coalesce(nullif(c.seller_email,''), p.email, ''),
    'phone', coalesce(nullif(c.seller_phone,''), p.phone, '')
  )
  from (select 1) dummy
  left join public.auction_contacts c on c.auction_id = a.id
  left join public.profiles p         on p.id = a.seller_id;
$$;

-- ---------------------------------------------------------------------
--  E-postmaler
-- ---------------------------------------------------------------------
create or replace function public.enqueue_mail(
  p_to text, p_to_name text, p_subject text, p_heading text,
  p_lines text[], p_kind text, p_auction uuid
) returns void language plpgsql security definer set search_path = public as $$
declare body text := '';
begin
  if coalesce(trim(p_to), '') = '' then return; end if;

  body := '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:28px;'
       || 'background:#F6F2E9;color:#17191C">'
       || '<p style="font:600 11px/1 system-ui;letter-spacing:.18em;text-transform:uppercase;color:#8A3D14;margin:0 0 18px">Dueauksjon</p>'
       || '<h1 style="font-size:24px;margin:0 0 18px;font-weight:600">' || p_heading || '</h1>';

  for i in 1 .. coalesce(array_length(p_lines, 1), 0) loop
    body := body || '<p style="font:15px/1.6 system-ui;margin:0 0 12px">' || p_lines[i] || '</p>';
  end loop;

  body := body || '<hr style="border:0;border-top:1px solid #D8D0BE;margin:24px 0">'
       || '<p style="font:12px/1.6 system-ui;color:#4A4F55;margin:0">'
       || 'Denne meldingen er sendt automatisk fra auksjonssystemet. Oppgjør avtales direkte mellom kjøper og selger.</p></div>';

  insert into public.outbox (to_email, to_name, subject, body_html, body_text, kind, auction_id)
  values (p_to, coalesce(p_to_name,''), p_subject, body,
          p_heading || E'\n\n' || array_to_string(p_lines, E'\n'), p_kind, p_auction);
end;
$$;

-- ---------------------------------------------------------------------
--  AVSLUTNING AV ÉN AUKSJON
--  Kårer vinner, sjekker minstepris og legger e-post i kø.
-- ---------------------------------------------------------------------
create or replace function public.settle_auction(p_auction uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  a        public.auctions;
  sc       jsonb;
  win      public.profiles;
  met      boolean;
  lot      text;
begin
  select * into a from public.auctions where id = p_auction for update;
  if not found or a.status not in ('live','scheduled') then return; end if;
  if a.ends_at > now() then return; end if;

  met := a.leader_id is not null
         and (a.reserve_price is null or a.current_price >= a.reserve_price);

  update public.auctions set
    status        = 'ended',
    winner_id     = case when met then a.leader_id end,
    winning_price = case when met then a.current_price end,
    reserve_met   = met,
    settled_at    = now()
  where id = a.id;

  if not met then return; end if;

  select * into win from public.profiles where id = a.leader_id;
  sc  := public.seller_contact(a);
  lot := coalesce('Lodd ' || a.lot_no || ' — ', '') || a.title;

  -- Til kjøperen
  perform public.enqueue_mail(
    win.email, win.full_name,
    'Du vant: ' || lot,
    'Gratulerer — du vant budrunden',
    array[
      'Du hadde høyeste bud på <strong>' || lot || '</strong>.',
      'Tilslag: <strong>kr ' || public.kr(a.current_price) || '</strong>',
      'Selgeren har fått kontaktopplysningene dine og tar kontakt om oppgjør og henting.',
      'Selger: <strong>' || coalesce(nullif(sc->>'name',''), 'oppgis av arrangør') || '</strong>'
        || case when coalesce(sc->>'email','') <> '' then ' — ' || (sc->>'email') else '' end
        || case when coalesce(sc->>'phone','') <> '' then ' — tlf. ' || (sc->>'phone') else '' end
    ],
    'winner', a.id);

  -- Til selgeren, med full kontaktinfo på vinneren
  perform public.enqueue_mail(
    sc->>'email', sc->>'name',
    'Solgt: ' || lot,
    'Loddet ditt er solgt',
    array[
      '<strong>' || lot || '</strong> er solgt for <strong>kr '
        || public.kr(a.current_price) || '</strong> etter ' || a.bid_count || ' bud.',
      'Kjøper: <strong>' || win.full_name || '</strong>',
      'E-post: ' || win.email,
      'Telefon: ' || win.phone,
      'Adresse: ' || win.address || ', ' || win.postal_code || ' ' || win.city || ', ' || win.country,
      case when win.club <> '' then 'Forening: ' || win.club else '' end,
      'Du sender faktura direkte til kjøperen.'
    ],
    'seller', a.id);
end;
$$;

-- ---------------------------------------------------------------------
--  KLOKKESLAG: åpne det som skal åpne, lukke det som har gått ut.
--  Kalles av pg_cron hvis du skrur det på, og av nettsiden ved hvert
--  sidevisning. Den er trygg å kalle så ofte man vil.
-- ---------------------------------------------------------------------
create or replace function public.tick_auctions()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  update public.auctions
     set status = 'live'
   where status = 'scheduled' and starts_at <= now() and ends_at > now();

  for r in
    select id from public.auctions
     where status in ('live','scheduled') and ends_at <= now()
     order by ends_at
     limit 200
  loop
    perform public.settle_auction(r.id);
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- ---------------------------------------------------------------------
--  BUDMOTOREN
--  p_max  = høyeste beløp brukeren er villig til å gi.
--           Ved enkeltbud sender nettsiden inn minste lovlige bud her,
--           så de to budformene deler samme kode.
--
--  Returnerer jsonb:
--    { result: 'leading' | 'outbid' | 'limit_raised',
--      price, min_bid, ends_at, extended, message }
-- ---------------------------------------------------------------------
create or replace function public.place_bid(p_auction uuid, p_max numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a           public.auctions;
  me          public.profiles;
  uid         uuid := auth.uid();
  leader_max  numeric;
  my_max      numeric;
  new_price   numeric;
  new_leader  uuid;
  added       integer := 0;
  extended    boolean := false;
  outcome     text;
  prev_leader uuid;
  prev_prof   public.profiles;
  lot         text;
begin
  if uid is null then
    raise exception 'Du må være innlogget for å by.' using errcode = '28000';
  end if;

  select * into me from public.profiles where id = uid;
  if not found or not public.profile_is_complete(me) then
    raise exception 'Fyll ut navn, telefon og adresse på kontoen din før du byr. Selgeren trenger dette for å sende faktura.'
      using errcode = 'P0001';
  end if;

  -- Lås loddet. Alle samtidige bud på samme lodd står i kø her, og
  -- det er derfor to personer ikke kan vinne samme runde.
  select * into a from public.auctions where id = p_auction for update;
  if not found then raise exception 'Fant ikke auksjonen.'; end if;

  if a.status = 'scheduled' and a.starts_at <= now() and a.ends_at > now() then
    a.status := 'live';
    update public.auctions set status = 'live' where id = a.id;
  end if;

  if a.ends_at <= now() then
    perform public.settle_auction(a.id);
    raise exception 'Auksjonen er avsluttet.';
  end if;
  if a.status <> 'live' then
    raise exception 'Auksjonen er ikke åpen for bud ennå.';
  end if;
  if a.seller_id is not null and a.seller_id = uid then
    raise exception 'Du kan ikke by på ditt eget lodd.';
  end if;

  p_max := round(p_max, 2);
  if p_max is null or p_max < a.min_bid then
    raise exception 'Minste gyldige bud er kr %.', public.kr(a.min_bid);
  end if;

  prev_leader := a.leader_id;
  select max_amount into leader_max from public.bid_limits
   where auction_id = a.id and bidder_id = prev_leader;
  select max_amount into my_max from public.bid_limits
   where auction_id = a.id and bidder_id = uid;

  if my_max is not null and p_max <= my_max then
    raise exception 'Du har allerede et maksbud på kr %. Nytt maksbud må være høyere.',
      public.kr(my_max);
  end if;

  insert into public.bid_limits (auction_id, bidder_id, max_amount)
  values (a.id, uid, p_max)
  on conflict (auction_id, bidder_id)
    do update set max_amount = excluded.max_amount, updated_at = now();

  if a.bid_count = 0 then
    -- Første bud i runden: prisen settes til utropsprisen.
    new_price  := a.starting_price;
    new_leader := uid;
    outcome    := 'leading';
    insert into public.bids (auction_id, bidder_id, bidder_alias, amount, is_auto)
    values (a.id, uid, me.display_name, new_price, false);
    added := 1;

  elsif prev_leader = uid then
    -- Du leder allerede og hever bare taket ditt. Prisen skal ikke røres.
    return jsonb_build_object(
      'result',  'limit_raised',
      'price',   a.current_price,
      'min_bid', a.min_bid,
      'ends_at', a.ends_at,
      'extended', false,
      'message', 'Maksbudet ditt er hevet til kr ' || public.kr(p_max)
                 || '. Du leder fortsatt på kr ' || public.kr(a.current_price) || '.');

  elsif p_max > coalesce(leader_max, 0) then
    -- Du slår den som ledet. Først svarer deres automatikk med alt de hadde,
    -- så legges du inn ett trinn over — men aldri høyere enn taket ditt.
    if leader_max is not null and leader_max > a.current_price then
      insert into public.bids (auction_id, bidder_id, bidder_alias, amount, is_auto)
      select a.id, prev_leader, p.display_name, leader_max, true
        from public.profiles p where p.id = prev_leader;
      added := added + 1;
    end if;

    new_price := least(p_max, greatest(coalesce(leader_max, 0) + public.bid_step(coalesce(leader_max, 0)), a.min_bid));
    new_price := greatest(new_price, a.min_bid);
    new_price := least(new_price, p_max);
    new_leader := uid;
    outcome := 'leading';

    insert into public.bids (auction_id, bidder_id, bidder_alias, amount, is_auto)
    values (a.id, uid, me.display_name, new_price, false);
    added := added + 1;

  else
    -- Taket ditt når ikke opp. Budet ditt registreres, og automatikken til
    -- den som leder svarer ett trinn over — begrenset av deres eget tak.
    insert into public.bids (auction_id, bidder_id, bidder_alias, amount, is_auto)
    values (a.id, uid, me.display_name, p_max, false);
    added := added + 1;

    new_price := least(leader_max, greatest(p_max + public.bid_step(p_max), a.min_bid));
    new_price := greatest(new_price, a.min_bid);
    new_price := least(new_price, leader_max);
    new_leader := prev_leader;
    outcome := 'outbid';

    insert into public.bids (auction_id, bidder_id, bidder_alias, amount, is_auto)
    select a.id, prev_leader, p.display_name, new_price, true
      from public.profiles p where p.id = prev_leader;
    added := added + 1;
  end if;

  -- Antisniping: bud helt på tampen forlenger runden, slik at alle
  -- rekker å svare. Da vinner man ikke på treg nettlinje.
  if a.soft_close_seconds > 0
     and a.ends_at - now() < make_interval(secs => a.soft_close_seconds) then
    extended := true;
  end if;

  update public.auctions set
    current_price   = new_price,
    leader_id       = new_leader,
    bid_count       = bid_count + added,
    ends_at         = case when extended then now() + make_interval(secs => soft_close_seconds) else ends_at end,
    extension_count = extension_count + case when extended then 1 else 0 end
  where id = a.id
  returning * into a;

  -- Varsel til den som mistet ledelsen
  if prev_leader is not null and new_leader <> prev_leader then
    select * into prev_prof from public.profiles where id = prev_leader;
    lot := coalesce('Lodd ' || a.lot_no || ' — ', '') || a.title;
    perform public.enqueue_mail(
      prev_prof.email, prev_prof.full_name,
      'Du er overbudt: ' || lot,
      'Noen har budt over deg',
      array[
        'Det er lagt inn et høyere bud på <strong>' || lot || '</strong>.',
        'Prisen står nå på <strong>kr ' || public.kr(a.current_price) || '</strong>.',
        'Neste gyldige bud er kr ' || public.kr(a.min_bid) || '.',
        'Runden avsluttes ' || to_char(a.ends_at at time zone 'Europe/Oslo', 'DD.MM.YYYY "kl." HH24:MI') || '.'
      ],
      'outbid', a.id);
  end if;

  return jsonb_build_object(
    'result',   outcome,
    'price',    a.current_price,
    'min_bid',  a.min_bid,
    'ends_at',  a.ends_at,
    'extended', extended,
    'message',  case
      when outcome = 'leading' then 'Du leder på kr ' || public.kr(a.current_price) || '.'
      else 'Du er allerede overbudt. Maksbudet til den som leder er høyere enn ditt.'
    end);
end;
$$;

-- ---------------------------------------------------------------------
--  Mitt eget maksbud på et lodd (brukes til å vise "ditt tak: kr X")
-- ---------------------------------------------------------------------
create or replace function public.my_max_bid(p_auction uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select max_amount from public.bid_limits
   where auction_id = p_auction and bidder_id = auth.uid();
$$;
