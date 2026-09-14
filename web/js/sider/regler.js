/* Reglene, forklart på norsk. Budtrinnene hentes fra databasen, slik at
   teksten her ikke kan komme i utakt med det som faktisk gjelder. */
import { start } from "../lib/ramme.js";
import { sb } from "../lib/supabase.js";
import { sett, esc } from "../lib/dom.js";
import { kr } from "../lib/format.js";
import { ER_SATT_OPP, SIDE } from "../config.js";

await start({ klokke: false });

const INTERVALLER = [
  [0, 499], [500, 999], [1000, 2499], [2500, 4999], [5000, 9999], [10000, null],
];
const RESERVE = [25, 50, 100, 250, 500, 1000];   // brukes bare hvis databasen ikke svarer

async function trinn() {
  if (!ER_SATT_OPP) return RESERVE;
  const svar = await Promise.all(
    INTERVALLER.map(([fra]) => sb.rpc("bid_step", { p: fra })));
  return svar.map((s, i) => (s.error ? RESERVE[i] : Number(s.data)));
}

const steg = await trinn();

const trinntabell = `
<div class="tabell-rull">
  <table class="tabell">
    <thead><tr><th>Når prisen står på</th><th>øker budet med</th></tr></thead>
    <tbody>
      ${INTERVALLER.map(([fra, til], i) => `
        <tr>
          <td class="tall">${til === null ? `${kr(fra)} og oppover` : `${kr(fra)} – ${kr(til)}`}</td>
          <td class="tall">${kr(steg[i])}</td>
        </tr>`).join("")}
    </tbody>
  </table>
</div>`;

const AVSNITT = [
  ["Du må være registrert for å by", `
    <p>Et bud er bindende, og selgeren skal kunne sende deg faktura. Derfor må
    du opprette bruker med fullt navn, adresse, postnummer og telefon før du
    kan legge inn bud.</p>
    <p>Opplysningene er skjult for alle andre brukere. I budhistorikken vises
    bare visningsnavnet du selv velger. Først når en budrunde er avgjort, og
    bare da, får selgeren og vinneren se hverandres kontaktopplysninger.</p>`],

  ["To måter å by på", `
    <p><strong>Neste trinn.</strong> Du byr nøyaktig det minste beløpet som er
    lovlig akkurat nå. Enkelt og forutsigbart, men du må følge med: blir du
    overbudt, må du by på nytt.</p>
    <p><strong>Maksbud.</strong> Du oppgir det høyeste du er villig til å gi.
    Systemet byr for deg, ett trinn av gangen, og bare så mye som trengs for at
    du skal lede. Byr noen 1&nbsp;200 mens taket ditt er 3&nbsp;000, går budet
    ditt automatisk til 1&nbsp;300 — ikke til 3&nbsp;000.</p>
    <p>Beløpet du har satt som tak er hemmelig. Verken selgeren eller de andre
    budgiverne får se det, og det vises aldri i budhistorikken.</p>
    <p>Byr to personer det samme maksbeløpet, beholder den som var først
    ledelsen. Det lønner seg altså å legge inn maksbudet tidlig.</p>`],

  ["Budtrinn", `
    <p>Hvor mye et bud må øke med avhenger av hvor høyt prisen ligger:</p>
    ${trinntabell}`],

  ["Runden forlenges hvis noen byr på tampen", `
    <p>Kommer det et bud rett før tiden er ute, forlenges runden automatisk.
    Slik kan ingen vinne bare fordi de klikket i siste sekund, og alle som vil
    være med rekker å svare.</p>
    <p>Forlengelsen gjentas så lenge det kommer nye bud, og runden er først
    over når det har vært stille gjennom hele forlengelsen. Hvor lang den er
    står på hvert enkelt lodd.</p>`],

  ["Minstepris", `
    <p>Noen lodd har en minstepris som ikke vises offentlig. Når budene har
    passert den, står det «nådd» i budpanelet. Blir minsteprisen ikke nådd før
    tiden går ut, er loddet usolgt og ingen forpliktelser oppstår.</p>`],

  ["Oppgjør og henting", `
    <p>Når en runde er avgjort får både kjøper og selger e-post med den andres
    kontaktopplysninger. Faktura, betaling og henting eller sending avtales
    direkte mellom dere to.</p>
    <p>Arrangøren driver budrunden og står ikke som mellommann i oppgjøret,
    og har ikke ansvar for duenes helse, avstamning eller resultater.</p>`],

  ["Angrer du?", `
    <p>Et bud kan ikke trekkes tilbake. Har du budt feil — for eksempel tastet
    inn et siffer for mye — ta kontakt med arrangøren så raskt som mulig på
    <a href="mailto:${esc(SIDE.epost)}">${esc(SIDE.epost)}</a>. Arrangøren kan
    rette åpenbare feil så lenge runden pågår.</p>`],
];

sett("#regeltekst", AVSNITT.map(([tittel, tekst], i) => `
  <section style="margin-top:var(--s-5)">
    <div class="seksjonstittel">
      <h2 style="font-size:var(--t-2)">
        <span class="tall" style="color:var(--copper);font-size:var(--t-0);
              margin-right:var(--s-2)">${String(i + 1).padStart(2, "0")}</span>${esc(tittel)}
      </h2>
    </div>
    <div class="dempet">${tekst}</div>
  </section>`).join("") + `
  <div class="kort" style="margin-top:var(--s-6);text-align:center">
    <h3>Klar til å by?</h3>
    <p class="dempet" style="margin:0 auto var(--s-3);max-width:40ch">
      Registreringen tar et minutt, og du trenger den bare én gang.</p>
    <a class="knapp" href="registrer.html">Bli medlem</a>
    <a class="knapp knapp-ramme" href="auksjoner.html">Se loddene</a>
  </div>`);
