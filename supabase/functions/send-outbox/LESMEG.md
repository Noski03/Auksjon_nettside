# send-outbox — automatisk e-post

Dette er valgfritt. **Nettsiden fungerer helt uten.** Uten denne
funksjonen blir varslene liggende i tabellen `outbox`, synlig for deg
under Arrangør → E-postkø, og kjøper og selger finner hverandres
opplysninger inne på siden.

Skrur du den på, går varslene ut av seg selv:

| Når | Til | Innhold |
|---|---|---|
| Noen byr over deg | Den som mistet ledelsen | Ny pris og neste gyldige bud |
| Runden er avgjort | Vinneren | Tilslagspris og selgerens kontaktinfo |
| Runden er avgjort | Selgeren | Kjøperens navn, adresse, telefon og e-post |

## Oppsett

**1. Skaff en avsender.** [Resend](https://resend.com) har et gratisnivå
på 100 e-poster per dag, som holder lenge for en klubbauksjon. Lag konto
og hent en API-nøkkel. Vil du sende fra din egen adresse må du verifisere
domenet hos dem; til å begynne med kan du bruke `onboarding@resend.dev`.

**2. Installer Supabase CLI** (én gang):

```bash
npm install -g supabase
supabase login
supabase link --project-ref DIN_PROSJEKT_REF
```

Prosjekt-referansen står i Supabase-adressen din:
`https://DIN_PROSJEKT_REF.supabase.co`.

**3. Legg inn hemmelighetene:**

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set AVSENDER="Dueauksjonen <auksjon@dittdomene.no>"
```

`SUPABASE_URL` og `SUPABASE_SERVICE_ROLE_KEY` settes automatisk — du skal
ikke legge dem inn selv, og de skal aldri inn i `web/js/config.js`.

**4. Legg den ut:**

```bash
supabase functions deploy send-outbox
```

**5. Få den til å kjøre av seg selv.** I Supabase → SQL Editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'tom-epostko',
  '* * * * *',                     -- hvert minutt
  $$
  select net.http_post(
    url     := 'https://DIN_PROSJEKT_REF.supabase.co/functions/v1/send-outbox',
    headers := '{"Authorization": "Bearer DIN_SERVICE_ROLE_NOKKEL"}'::jsonb
  );
  $$
);
```

Denne ene planlagte jobben gjør to ting: den sender e-posten, og den
kaller `tick_auctions()` slik at runder blir avsluttet presis selv om
ingen har siden åpen.

Vil du se om den virker:

```bash
supabase functions invoke send-outbox
```

Avlyse den planlagte jobben igjen: `select cron.unschedule('tom-epostko');`
