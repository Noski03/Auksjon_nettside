/* Forsiden: velkomst, pågående budrunder og en kort forklaring. */
import { start } from "../lib/ramme.js";
import { sb, feiltekst } from "../lib/supabase.js";
import { $, sett, esc, varsle } from "../lib/dom.js";
import { kr, dato } from "../lib/format.js";
import { loddkort, nedtellingStart } from "../lib/lodd.js";
import { ER_SATT_OPP, SIDE } from "../config.js";

await start();
nedtellingStart();

const STEG = [
  ["01", "Bli medlem",
   "Registrer deg med navn, adresse og telefon. Opplysningene er skjult for alle andre — de går bare til selgeren hvis du vinner."],
  ["02", "Legg inn bud",
   "By neste trinn med ett klikk, eller sett et maksbud og la systemet by for deg opp til grensen din. Taket ditt er hemmelig."],
  ["03", "Gjør opp direkte",
   "Vinner du, får både du og selgeren en e-post med kontaktopplysninger. Faktura og henting avtaler dere dere imellom."],
];

sett("#steg", STEG.map(([nr, tittel, tekst]) => `
  <li class="kort">
    <p class="tall" style="font-size:var(--t-2);color:var(--copper);margin:0 0 var(--s-2)">${nr}</p>
    <h3 style="margin-bottom:var(--s-2)">${esc(tittel)}</h3>
    <p class="dempet" style="margin:0;font-size:var(--t--1)">${esc(tekst)}</p>
  </li>`).join(""));

function velkomst({ antallLive = 0, neste = null, runde = null } = {}) {
  const tikker = neste
    ? `<div class="budpanel" style="max-width:24rem">
         <div class="budpanel-topp">
           <span class="merkelapp merkelapp-live"><span class="prikk"></span>Slutter først</span>
           <span class="nedtelling" data-slutt="${esc(neste.ends_at)}">–</span>
         </div>
         <div class="budpanel-kropp">
           <p class="lodd-pris-merk">${neste.bid_count ? "Høyeste bud" : "Utropspris"}</p>
           <p class="budpanel-pris">${kr(neste.bid_count ? neste.current_price : neste.starting_price)}</p>
           <h3 style="margin:var(--s-3) 0 var(--s-1);font-size:var(--t-1)">${esc(neste.title)}</h3>
           <p class="dempet-2" style="margin:0 0 var(--s-3)">
             ${esc([neste.breed, neste.ring_number].filter(Boolean).join(" · ") || "Lodd i auksjon")}
           </p>
           <a class="knapp knapp-stor" href="auksjon.html?id=${esc(neste.id)}">Se loddet</a>
         </div>
       </div>`
    : `<div class="tomt" style="padding:var(--s-5) var(--s-3)">
         <h3 style="font-size:var(--t-1)">Ingen åpne runder akkurat nå</h3>
         <p class="dempet-2" style="margin:0">Følg med — nye lodd legges ut før hver auksjon.</p>
       </div>`;

  const noekkeltall = [
    [antallLive, antallLive === 1 ? "åpent lodd" : "åpne lodd"],
    runde?.closes_at ? [dato(runde.closes_at, false), "runden stenger"] : null,
  ].filter(Boolean);

  return `
  <div style="display:grid;gap:var(--s-5);align-items:center;grid-template-columns:1.618fr 1fr"
       class="velkomst-rutenett">
    <div>
      <p class="stikkord">${esc(runde?.title || SIDE.undertittel)}</p>
      <h1 style="margin-bottom:var(--s-3)">Budrunder<br>i sanntid.</h1>
      <p class="dempet" style="font-size:var(--t-1);line-height:1.5;max-width:44ch">
        ${esc(runde?.description ||
          "Brevduer fra medlemmenes slag, lagt ut lodd for lodd. Hvert bud registreres med én gang, og prisen oppdateres hos alle som ser på.")}
      </p>
      <div style="display:flex;gap:var(--s-2);flex-wrap:wrap;margin-top:var(--s-4)">
        <a class="knapp" href="auksjoner.html">Se loddene</a>
        <a class="knapp knapp-ramme" href="regler.html">Slik fungerer det</a>
      </div>
      ${noekkeltall.length ? `
        <div style="display:flex;gap:var(--s-5);margin-top:var(--s-5);
                    border-top:3px double var(--line-strong);padding-top:var(--s-3)">
          ${noekkeltall.map(([v, m]) => `
            <div>
              <div class="tall" style="font-size:var(--t-2);font-weight:600">${esc(v)}</div>
              <div class="dempet-2">${esc(m)}</div>
            </div>`).join("")}
        </div>` : ""}
    </div>
    <div>${tikker}</div>
  </div>
  <style>
    @media (max-width: 52rem) {
      .velkomst-rutenett { grid-template-columns: 1fr !important; }
    }
  </style>`;
}

/* --- Hent data -------------------------------------------------------- */

if (!ER_SATT_OPP) {
  sett("#velkomst", velkomst());
  sett("#live-lodd", `<div class="tomt" style="grid-column:1/-1">
      <h3>Venter på databasen</h3>
      <p class="dempet-2" style="margin:0">Fyll ut <code>web/js/config.js</code> for å komme i gang.</p>
    </div>`);
} else {
  sett("#live-lodd", Array.from({ length: 3 },
    () => '<div class="skjelett skjelett-kort"></div>').join(""));

  const na = new Date().toISOString();
  const [live, kommer, runder] = await Promise.all([
    sb.from("auctions").select("*").eq("status", "live").gt("ends_at", na)
      .order("ends_at", { ascending: true }).limit(6),
    sb.from("auctions").select("*").eq("status", "scheduled").gt("starts_at", na)
      .order("starts_at", { ascending: true }).limit(3),
    sb.from("collections").select("*").eq("is_published", true)
      .order("sort_order", { ascending: true }).limit(1),
  ]);

  if (live.error) varsle(feiltekst(live.error), "feil");

  const loddene = live.data ?? [];
  sett("#velkomst", velkomst({
    antallLive: loddene.length,
    neste: loddene[0] ?? null,
    runde: runder.data?.[0] ?? null,
  }));

  sett("#live-lodd", loddene.length
    ? loddene.map((a) => loddkort(a)).join("")
    : `<div class="tomt" style="grid-column:1/-1">
         <h3>Ingen åpne budrunder</h3>
         <p class="dempet-2" style="margin:0 0 var(--s-3)">
           Neste auksjon kunngjøres her. Se gjerne på tidligere lodd i mellomtiden.</p>
         <a class="knapp knapp-ramme" href="auksjoner.html">Til katalogen</a>
       </div>`);

  if (kommer.data?.length) {
    $("#kommer-seksjon").hidden = false;
    sett("#kommer-lodd", kommer.data.map((a) => loddkort(a)).join(""));
  }
}
