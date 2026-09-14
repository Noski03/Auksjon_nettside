#!/usr/bin/env python3
"""
Skriver HTML-sidene i web/ ut fra en felles mal.

Hele poenget er at <head> bare finnes ett sted. Endrer du skrifttype
eller legger til en CSS-fil, gjør du det her og kjører:

    python3 tools/bygg-sider.py

Sidene er vanlige statiske HTML-filer etterpå — du trenger ikke dette
skriptet for å bruke nettsiden, bare for å slippe å redigere elleve
<head> for hånd.
"""
import pathlib

WEB = pathlib.Path(__file__).resolve().parent.parent / "web"

FONTS = ("https://fonts.googleapis.com/css2?"
         "family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600"
         "&family=IBM+Plex+Mono:wght@400;500;600"
         "&family=IBM+Plex+Sans:wght@400;500;600&display=swap")

MAL = """<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{tittel}</title>
<meta name="description" content="{beskrivelse}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="assets/merke.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/layout.css">
<link rel="stylesheet" href="css/komponenter.css">
<!-- Supabase-biblioteket ligger i repoet, ikke på en CDN. Se js/vendor/LESMEG.md -->
<script src="js/vendor/supabase.js"></script>
</head>
<body>
<a class="hopp-til-innhold" href="#innhold">Hopp til innhold</a>
<main id="innhold">
{innhold}
</main>
<script type="module" src="js/sider/{skript}.js"></script>
</body>
</html>
"""


def skriv(fil, tittel, beskrivelse, skript, innhold):
    html = MAL.format(tittel=tittel + " | Dueauksjonen", beskrivelse=beskrivelse,
                      fonts=FONTS, skript=skript, innhold=innhold.rstrip())
    (WEB / fil).write_text(html, encoding="utf-8")
    return fil


# ---------------------------------------------------------------------
SIDER = []

SIDER.append(skriv("index.html", "Brevduer på auksjon",
    "Auksjon av brevduer med bud i sanntid. Registrer deg, følg budrundene live og by på duene du vil ha.",
    "forside", """
<section class="ramme" id="velkomst"></section>

<section class="ramme" style="margin-top:var(--s-6)">
  <div class="seksjonstittel">
    <div>
      <p class="stikkord">Pågår nå</p>
      <h2>Åpne budrunder</h2>
    </div>
    <a class="knapp knapp-ramme knapp-tynn" href="auksjoner.html">Se alle lodd</a>
  </div>
  <div id="live-lodd" class="lodd-rutenett"></div>
</section>

<section class="ramme" style="margin-top:var(--s-6)" id="kommer-seksjon" hidden>
  <div class="seksjonstittel">
    <div>
      <p class="stikkord">Snart</p>
      <h2>Åpner om kort tid</h2>
    </div>
  </div>
  <div id="kommer-lodd" class="lodd-rutenett"></div>
</section>

<section class="ramme" style="margin-top:var(--s-7)">
  <div class="seksjonstittel"><h2>Tre steg</h2></div>
  <ol id="steg" class="lodd-rutenett" style="list-style:none;padding:0;margin:0"></ol>
</section>
"""))

SIDER.append(skriv("auksjoner.html", "Alle auksjoner",
    "Alle lodd i auksjonen: pågående, kommende og avsluttede budrunder.",
    "auksjoner", """
<div class="ramme">
  <p class="stikkord">Katalog</p>
  <h1>Auksjoner</h1>
  <p class="dempet" style="margin-bottom:var(--s-4)">
    Bud registreres i samme øyeblikk de legges inn, og prisen oppdateres
    hos alle som ser på loddet.
  </p>

  <div class="filterlinje">
    <input class="sok" type="search" id="sok" placeholder="Søk på tittel, ringnummer eller stamme"
           aria-label="Søk i loddene">
    <select id="filter-tilstand" aria-label="Filtrer på tilstand">
      <option value="alle">Alle tilstander</option>
      <option value="live" selected>Pågår nå</option>
      <option value="kommer">Åpner snart</option>
      <option value="avsluttet">Avsluttet</option>
    </select>
    <select id="filter-runde" aria-label="Filtrer på auksjonsrunde">
      <option value="alle">Alle runder</option>
    </select>
    <select id="sortering" aria-label="Sortering">
      <option value="slutt">Slutter først</option>
      <option value="lodd">Loddnummer</option>
      <option value="pris-opp">Laveste pris</option>
      <option value="pris-ned">Høyeste pris</option>
      <option value="bud">Flest bud</option>
    </select>
  </div>

  <p id="treff" class="dempet-2" aria-live="polite"></p>
  <div id="liste" class="lodd-rutenett"></div>
</div>
"""))

SIDER.append(skriv("auksjon.html", "Lodd",
    "Detaljer, bilder og budhistorikk for loddet — med bud i sanntid.",
    "auksjon", """
<div class="ramme">
  <p style="margin-bottom:var(--s-3)"><a class="knapp-blank" href="auksjoner.html">&larr; Alle lodd</a></p>
  <div id="lodd-innhold" aria-live="polite"></div>
</div>
"""))

SIDER.append(skriv("logg-inn.html", "Logg inn", "Logg inn for å legge inn bud.", "logg-inn", """
<div class="ramme ramme-smal">
  <p class="stikkord">Velkommen tilbake</p>
  <h1>Logg inn</h1>
  <div class="kort" style="margin-top:var(--s-4)">
    <div id="melding"></div>
    <form id="skjema" novalidate>
      <div class="felt">
        <label for="epost">E-post</label>
        <input type="email" id="epost" name="epost" autocomplete="email" required>
      </div>
      <div class="felt">
        <label for="passord">Passord</label>
        <input type="password" id="passord" name="passord" autocomplete="current-password" required>
      </div>
      <button class="knapp knapp-stor" type="submit">Logg inn</button>
    </form>
    <p style="margin:var(--s-3) 0 0;font-size:var(--t--1)">
      <button class="knapp-blank" id="glemt" type="button">Glemt passordet?</button>
    </p>
  </div>
  <p class="dempet" style="margin-top:var(--s-4);text-align:center">
    Ikke medlem ennå? <a href="registrer.html">Opprett bruker</a>
  </p>
</div>
"""))

SIDER.append(skriv("registrer.html", "Bli medlem",
    "Opprett bruker for å kunne by. Kontaktopplysningene deles bare med selgeren hvis du vinner.",
    "registrer", """
<div class="ramme ramme-smal">
  <p class="stikkord">Ny bruker</p>
  <h1>Bli medlem</h1>
  <p class="dempet">
    For å by trenger vi kontaktopplysningene dine. De er skjult for alle
    andre, og deles med selgeren først når du faktisk har vunnet et lodd —
    da må de kunne sende deg faktura og avtale henting.
  </p>

  <div class="kort" style="margin-top:var(--s-4)">
    <div id="melding"></div>
    <form id="skjema" novalidate>
      <p class="stikkord" style="margin-top:0">Innlogging</p>
      <div class="felt">
        <label for="epost">E-post</label>
        <input type="email" id="epost" autocomplete="email" required>
      </div>
      <div class="felt-rad">
        <div class="felt">
          <label for="passord">Passord</label>
          <input type="password" id="passord" autocomplete="new-password" minlength="8" required>
          <p class="felt-hjelp">Minst 8 tegn.</p>
        </div>
        <div class="felt">
          <label for="passord2">Gjenta passord</label>
          <input type="password" id="passord2" autocomplete="new-password" required>
        </div>
      </div>

      <p class="stikkord" style="margin-top:var(--s-4)">Vises offentlig</p>
      <div class="felt">
        <label for="visningsnavn">Visningsnavn</label>
        <input type="text" id="visningsnavn" maxlength="28" required>
        <p class="felt-hjelp">
          Dette er det eneste andre ser om deg i budhistorikken. Velg gjerne
          noe annet enn fullt navn, for eksempel «Slagvik» eller «OlaN».
        </p>
      </div>

      <p class="stikkord" style="margin-top:var(--s-4)">Privat — bare for oppgjør</p>
      <div class="felt">
        <label for="navn">Fullt navn</label>
        <input type="text" id="navn" autocomplete="name" required>
      </div>
      <div class="felt-rad">
        <div class="felt">
          <label for="telefon">Telefon</label>
          <input type="tel" id="telefon" autocomplete="tel" required>
        </div>
        <div class="felt">
          <label for="forening">Forening <span class="valgfritt">(valgfritt)</span></label>
          <input type="text" id="forening" autocomplete="organization">
        </div>
      </div>
      <div class="felt">
        <label for="adresse">Adresse</label>
        <input type="text" id="adresse" autocomplete="street-address" required>
      </div>
      <div class="felt-rad">
        <div class="felt">
          <label for="postnr">Postnummer</label>
          <input type="text" id="postnr" inputmode="numeric" autocomplete="postal-code"
                 maxlength="4" required>
        </div>
        <div class="felt">
          <label for="sted">Poststed</label>
          <input type="text" id="sted" autocomplete="address-level2" required>
        </div>
        <div class="felt">
          <label for="land">Land</label>
          <input type="text" id="land" value="Norge" autocomplete="country-name" required>
        </div>
      </div>

      <div class="avkryss felt" style="margin-top:var(--s-4)">
        <input type="checkbox" id="godta" required>
        <label for="godta">
          Jeg har lest <a href="regler.html" target="_blank">reglene</a> og forstår
          at et bud er bindende, og at kontaktopplysningene mine sendes til
          selgeren hvis jeg vinner et lodd.
        </label>
      </div>

      <button class="knapp knapp-stor" type="submit">Opprett bruker</button>
    </form>
  </div>
  <p class="dempet" style="margin-top:var(--s-4);text-align:center">
    Har du allerede bruker? <a href="logg-inn.html">Logg inn</a>
  </p>
</div>
"""))

SIDER.append(skriv("nytt-passord.html", "Nytt passord", "Velg et nytt passord.", "nytt-passord", """
<div class="ramme ramme-smal">
  <p class="stikkord">Kontoen din</p>
  <h1>Velg nytt passord</h1>
  <div class="kort" style="margin-top:var(--s-4)">
    <div id="melding"></div>
    <form id="skjema" novalidate>
      <div class="felt">
        <label for="passord">Nytt passord</label>
        <input type="password" id="passord" autocomplete="new-password" minlength="8" required>
      </div>
      <div class="felt">
        <label for="passord2">Gjenta nytt passord</label>
        <input type="password" id="passord2" autocomplete="new-password" required>
      </div>
      <button class="knapp knapp-stor" type="submit">Lagre nytt passord</button>
    </form>
  </div>
</div>
"""))

SIDER.append(skriv("konto.html", "Min side", "Budene dine, kjøpene dine og kontaktopplysningene dine.",
    "konto", """
<div class="ramme">
  <p class="stikkord">Min side</p>
  <h1 id="hilsen">Min side</h1>

  <div class="faner" role="tablist">
    <button role="tab" data-fane="bud" aria-selected="true">Budene mine</button>
    <button role="tab" data-fane="kjop" aria-selected="false">Kjøpene mine</button>
    <button role="tab" data-fane="folger" aria-selected="false">Følger</button>
    <button role="tab" data-fane="profil" aria-selected="false">Opplysninger</button>
  </div>

  <section id="fane-bud"></section>
  <section id="fane-kjop" hidden></section>
  <section id="fane-folger" hidden></section>
  <section id="fane-profil" hidden></section>
</div>
"""))

SIDER.append(skriv("mine-salg.html", "Mine salg",
    "Loddene dine og kontaktopplysningene til kjøperne.", "mine-salg", """
<div class="ramme">
  <p class="stikkord">For selgere</p>
  <h1>Mine salg</h1>
  <p class="dempet">
    Her ligger loddene som er registrert på deg. Når en budrunde er over og
    minsteprisen er nådd, får du fullt navn, adresse, telefon og e-post til
    kjøperen — det du trenger for å sende faktura.
  </p>
  <div id="salg" style="margin-top:var(--s-4)"></div>
</div>
"""))

SIDER.append(skriv("admin.html", "Arrangør", "Opprett og administrer lodd.", "admin", """
<div class="ramme">
  <p class="stikkord">Arrangør</p>
  <h1>Administrasjon</h1>

  <div class="faner" role="tablist">
    <button role="tab" data-fane="lodd" aria-selected="true">Lodd</button>
    <button role="tab" data-fane="runder" aria-selected="false">Auksjonsrunder</button>
    <button role="tab" data-fane="post" aria-selected="false">E-postkø</button>
  </div>

  <section id="fane-lodd"></section>
  <section id="fane-runder" hidden></section>
  <section id="fane-post" hidden></section>
</div>

<dialog id="lodd-dialog">
  <form method="dialog" class="dialog-topp">
    <h3 id="dialog-tittel">Nytt lodd</h3>
    <button class="knapp knapp-ramme knapp-tynn" value="lukk">Lukk</button>
  </form>
  <div class="dialog-kropp" id="dialog-kropp"></div>
</dialog>
"""))

SIDER.append(skriv("regler.html", "Slik fungerer det",
    "Budregler, maksbud, forlengelse på tampen og oppgjør.", "regler", """
<div class="ramme ramme-smal">
  <p class="stikkord">Auksjonsregler</p>
  <h1>Slik fungerer det</h1>
  <div id="regeltekst"></div>
</div>
"""))

SIDER.append(skriv("404.html", "Fant ikke siden", "Siden finnes ikke.", "ikke-funnet", """
<div class="ramme">
  <div class="tomt" style="margin-top:var(--s-5)">
    <p class="stikkord">404</p>
    <h1 style="font-size:var(--t-3)">Duen fant ikke hjem</h1>
    <p class="dempet">Denne siden finnes ikke, eller loddet er fjernet.</p>
    <a class="knapp" href="auksjoner.html">Se auksjonene</a>
  </div>
</div>
"""))

print("Skrev", len(SIDER), "sider:", ", ".join(SIDER))
