# Dueauksjonen

Nettside for auksjon av brevduer, med bud i sanntid. Byr noen, ser alle
andre den nye prisen med én gang — ingen trenger å laste siden på nytt.
Vinner du, får selgeren kontaktopplysningene dine automatisk, så de kan
sende faktura.

Bygget som en helt vanlig statisk nettside (HTML, CSS og JavaScript) med
**Supabase** som database, innlogging og sanntidsmotor. Ingen byggesteg,
ingen rammeverk, ingen `npm install` for å kjøre den.

---

## Er dette overkommelig?

Ja. De tre tingene du lurte på, og hvordan de er løst:

**Bud i sanntid.** Supabase sender endringer i databasen rett ut til alle
nettlesere som ser på loddet. Prisen, nedtellingen og budhistorikken
oppdateres av seg selv.

**At bud faktisk registreres riktig.** Dette er den delen som er lett å
gjøre feil, og derfor ligger hele budlogikken inne i databasen — ikke i
JavaScript. Nettleseren spør bare «jeg vil by så mye», og databasen
avgjør resten. Det betyr at ingen kan jukse ved å åpne konsollen, og at
to personer som byr i samme sekund ikke kan vinne samme runde. Logikken
er dekket av 45 automatiske prøver, se [Prøvene](#prøvene).

**At selgeren får kontaktinfo.** Man må registrere seg med navn, adresse
og telefon før man kan by — databasen nekter bud fra ufullstendige
profiler. Opplysningene er skjult for alle andre. Først når en runde er
avgjort åpner databasen for at nettopp selgeren og nettopp vinneren kan
se hverandre. Det er også dekket av prøver.

---

## Kom i gang

### 1. Lag et Supabase-prosjekt

Gå til [supabase.com](https://supabase.com) → **New project**. Gratis.
Velg region **Frankfurt** eller **Stockholm** (nærmest Norge = raskest).
Ta vare på databasepassordet.

### 2. Kjør oppsettfilene

Åpne **SQL Editor** i Supabase. Kjør filene i denne rekkefølgen — én om
gangen, lim inn hele innholdet og trykk **Run**:

| # | Fil | Hva den gjør |
|---|---|---|
| 1 | `supabase/01_schema.sql` | Tabellene |
| 2 | `supabase/02_functions.sql` | Budmotoren og avslutningen |
| 3 | `supabase/03_policies.sql` | Hvem får se hva, og sanntid |
| 4 | `supabase/04_seed.sql` | Demodata *(valgfritt — slett når du har ekte lodd)* |

### 3. Koble nettsiden til databasen

I Supabase: **Project Settings → API**. Kopier `Project URL` og nøkkelen
som heter `anon` `public`. Lim dem inn i `web/js/config.js`:

```js
export const SUPABASE_URL = "https://abcdefgh.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

Samme sted setter du navnet på foreningen og kontaktadressen.

> **Er det trygt at nøkkelen ligger i koden?** Ja. `anon`-nøkkelen er
> ment å være offentlig — den gir bare tilgang til det radsikkerheten i
> databasen tillater. Nøkkelen som heter `service_role` er en helt annen
> sak: **den skal aldri inn i `web/`-mappa.** Den hører bare hjemme i
> Edge Functions.

### 4. Start siden lokalt

```bash
node tools/server.mjs
```

Åpne <http://localhost:5173>. (Du trenger en server — åpner du
`index.html` rett fra filutforskeren, nekter nettleseren å laste
JavaScript-modulene.)

### 5. Gjør deg selv til arrangør

Registrer deg på siden først. Så, i Supabase → SQL Editor:

```sql
update public.profiles set is_admin = true where email = 'din@epost.no';
```

Last siden på nytt. Nå har du en **Arrangør**-fane der du legger ut lodd.

---

## Legge ut siden

Siden er statiske filer. `web/`-mappa er alt som skal ut.

### GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → velg grein og
mappe `/web` hvis den er tilgjengelig. Er den ikke det, er det enkleste
å legge innholdet i `web/` i en mappe som heter `docs/` og velge den.

### Cloudflare Pages

Connect to Git → velg repoet →
**Build command:** (tom) · **Build output directory:** `web`

Cloudflare er raskere for norske besøkende enn GitHub Pages, og du får
eget domene gratis.

**Uansett hvor du legger den:** gå til Supabase →
**Authentication → URL Configuration** og legg inn adressen til
nettsiden som `Site URL`, ellers virker ikke lenkene i
bekreftelses-e-postene.

---

## Slik virker budgivningen

### To måter å by på

**Neste trinn** — du byr nøyaktig det minste som er lov akkurat nå.

**Maksbud** — du oppgir det høyeste du vil gi, og systemet byr for deg,
ett trinn av gangen, bare så mye som trengs. Byr noen 1 200 mens taket
ditt er 3 000, går budet ditt til 1 300 — ikke til 3 000.

Begge går gjennom den samme databasefunksjonen `place_bid`. Et enkeltbud
er bare et maksbud som tilfeldigvis er lik minstebudet.

### Budtrinn

| Når prisen står på | øker budet med |
|---|---|
| under 500 | 25 |
| 500 – 999 | 50 |
| 1 000 – 2 499 | 100 |
| 2 500 – 4 999 | 250 |
| 5 000 – 9 999 | 500 |
| 10 000 og oppover | 1 000 |

Vil du endre dette, er det bare funksjonen `bid_step` i
`supabase/02_functions.sql` du trenger å røre. Regeltabellen på nettsiden
leser tallene rett fra databasen og retter seg selv.

### Forlengelse på tampen

Kommer det et bud rett før tiden er ute, forlenges runden — som standard
med tre minutter, og du kan sette det per lodd. Da vinner ingen bare
fordi de klikket i siste sekund.

### Når runden er over

Funksjonen `tick_auctions()` avslutter runder som har gått ut, kårer
vinneren, sjekker minsteprisen og legger varsler i e-postkøen. Den kalles
fra nettsiden hvert minutt så lenge noen har siden åpen. Vil du at runder
skal lukke presis selv når ingen ser på, sett opp den planlagte jobben
beskrevet i `supabase/functions/send-outbox/LESMEG.md`.

---

## E-post

**Dette er valgfritt.** Uten e-postoppsett virker alt annet som normalt:
varslene blir liggende i tabellen `outbox` (synlig for deg under
Arrangør → E-postkø), og kjøper og selger finner hverandres opplysninger
inne på siden under «Mine kjøp» og «Mine salg».

Skrur du det på, går tre varsler ut automatisk: *du er overbudt*, *du
vant* og *loddet ditt er solgt*. Framgangsmåten står i
[`supabase/functions/send-outbox/LESMEG.md`](supabase/functions/send-outbox/LESMEG.md).

---

## Mappene

```
web/                    ← dette er nettsiden
  *.html                  én fil per side
  css/
    tokens.css            farger, skriftstørrelser, avstander — start her
    base.css              nullstilling, typografi, skjemaer
    layout.css            topp, bunn, rutenett
    komponenter.css       knapper, kort, budpanel, tabeller
  js/
    config.js             ← den eneste filen du MÅ fylle ut
    lib/                  delte hjelpere (supabase, formatering, økt, ramme)
    sider/                én fil per side
    vendor/               Supabase-biblioteket, lagt i repoet med vilje
  assets/

supabase/               ← kjøres i SQL Editor, i nummerrekkefølge
  01_schema.sql   02_functions.sql   03_policies.sql   04_seed.sql
  functions/send-outbox/  e-postutsending (valgfritt)

tests/                  ← automatiske prøver på budmotoren
tools/                  ← lokal server og sidegenerator
```

CSS og JavaScript ligger i hver sin mappe, med én fil per side under
`js/sider/`. HTML-filene må ligge i toppen av `web/` for at adressene
skal bli pene.

`<head>` er lik på alle sidene, og genereres av `tools/bygg-sider.py`.
Skal du legge til en CSS-fil eller endre skrifttype, gjør du det der og
kjører `python3 tools/bygg-sider.py`. Du trenger ikke skriptet for å
bruke siden — bare for å slippe å redigere elleve `<head>` for hånd.

---

## Prøvene

Budmotoren er dekket av automatiske prøver som kjører mot en ekte
PostgreSQL. De rører ikke Supabase-prosjektet ditt.

```bash
sudo apt install postgresql     # én gang
bash tests/run.sh
```

De sjekker blant annet at maksbud aldri lekker ut, at den som var først
beholder ledelsen ved likt bud, at bud på tampen forlenger runden, at
minstepris stopper salget — og at en utenforstående ikke får se noens
kontaktopplysninger.

Endrer du noe i `supabase/02_functions.sql` eller `03_policies.sql`, kjør
prøvene før du legger det ut.

---

## Ting du fort kommer til å lure på

**Hvordan legger jeg til en selger som ikke har bruker?**
I loddskjemaet lar du «Registrert bruker» stå tom og fyller ut de tre
private selgerfeltene. Varslene går dit.

**Hvorfor ser jeg ikke kontaktinfoen til vinneren?**
Den åpnes først når loddet har status `ended` *og* minsteprisen er nådd.
Er runden avsluttet uten at minsteprisen ble nådd, er loddet usolgt og
ingen opplysninger utveksles.

**Kan jeg avslutte en runde tidlig?**
Ja — Arrangør → Lodd → «Avslutt nå». Høyeste bud får tilslaget.

**Kan noen by på sitt eget lodd?**
Nei, hvis du har knyttet loddet til dem som registrert bruker.

**Hvor endrer jeg farger?**
`web/css/tokens.css`. Alt annet leser derfra, også mørk drakt.

---

## Merk

Dette er et auksjonssystem der folk forplikter seg til å betale. Før du
slipper ekte penger løs på det:

* Test en hel runde fra ende til annen med to brukere i hver sin
  nettleser — også at e-posten kommer fram.
* Skru på **Email confirmations** i Supabase → Authentication, ellers kan
  hvem som helst registrere seg på en adresse de ikke eier.
* Skriv auksjonsreglene i `web/js/sider/regler.js` slik *din* forening
  faktisk praktiserer dem. Teksten som ligger der nå er et utgangspunkt,
  ikke juridisk rådgivning.
