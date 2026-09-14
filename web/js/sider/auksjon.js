/* =====================================================================
   LODDSIDEN — detaljer, budgivning og sanntid.

   To ting skjer her samtidig:
     1. Du legger inn et bud. Det går til databasefunksjonen place_bid,
        som er den eneste som avgjør hva som er lov.
     2. Du lytter på endringer. Når noen andre byr, kommer den nye
        prisen inn av seg selv — ingen oppfriskning av siden.
   ===================================================================== */
import { start } from "../lib/ramme.js";
import { sb, feiltekst } from "../lib/supabase.js";
import { $, $$, sett, esc, avsnitt, varsle, jobber, parameter } from "../lib/dom.js";
import { kr, dato, klokke, siden, tilstand, TILSTAND_TEKST } from "../lib/format.js";
import { bildeErstatning, merkelapp, nedtellingStart } from "../lib/lodd.js";
import { bruker, profil, kanBy } from "../lib/okt.js";
import { ER_SATT_OPP } from "../config.js";

await start();
nedtellingStart();

const id = parameter("id");
const rot = $("#lodd-innhold");

let auksjon = null;
let budliste = [];
let meg = null;
let minProfil = null;
let mittTak = null;
let folger = false;
let budmodus = "enkelt";           // "enkelt" eller "maks"
let visBilde = 0;

if (!id) {
  sett(rot, tomt("Mangler loddnummer", "Lenken peker ikke på et bestemt lodd."));
} else if (!ER_SATT_OPP) {
  sett(rot, tomt("Ikke koblet til database", "Fyll ut web/js/config.js først."));
} else {
  await hentAlt();
  lyttTilEndringer();
}

/* ------------------------------------------------------------------ */
function tomt(tittel, tekst) {
  return `<div class="tomt"><h3>${esc(tittel)}</h3>
    <p class="dempet-2" style="margin:0 0 var(--s-3)">${esc(tekst)}</p>
    <a class="knapp knapp-ramme" href="auksjoner.html">Til katalogen</a></div>`;
}

async function hentAlt() {
  sett(rot, `<div class="auksjon-oppsett">
      <div class="skjelett" style="height:26rem;border-radius:var(--radius-stor)"></div>
      <div class="skjelett" style="height:20rem;border-radius:var(--radius-stor)"></div>
    </div>`);

  meg = await bruker();
  minProfil = meg ? await profil() : null;

  const { data, error } = await sb.from("auctions").select("*").eq("id", id).maybeSingle();
  if (error || !data) {
    sett(rot, tomt("Fant ikke loddet", "Det kan være fjernet, eller lenken er feil."));
    return;
  }
  auksjon = data;

  const jobb = [
    sb.from("bids").select("*").eq("auction_id", id)
      .order("id", { ascending: false }).limit(60),
  ];
  if (meg) {
    jobb.push(sb.rpc("my_max_bid", { p_auction: id }));
    jobb.push(sb.from("watchlist").select("auction_id").eq("auction_id", id).maybeSingle());
  }
  const svar = await Promise.all(jobb);
  budliste = svar[0].data ?? [];
  if (meg) {
    mittTak = svar[1]?.data ?? null;
    folger = !!svar[2]?.data;
  }
  tegn();
}

/* ------------------------------------------------------------------ */
function tegn() {
  const t = tilstand(auksjon);
  const harBud = auksjon.bid_count > 0;
  const jegLeder = meg && auksjon.leader_id === meg.id;
  const jegHarBudt = meg && budliste.some((b) => b.bidder_id === meg.id);

  const bilder = auksjon.image_urls ?? [];
  const hovedbilde = bilder.length
    ? `<img src="${esc(bilder[visBilde] ?? bilder[0])}" alt="${esc(auksjon.title)}"
         style="width:100%;aspect-ratio:1.618;object-fit:cover;border-radius:var(--radius-stor);border:var(--ramme)">`
    : `<div style="aspect-ratio:1.618;border-radius:var(--radius-stor);border:var(--ramme);overflow:hidden">
         ${bildeErstatning(auksjon)}</div>`;

  const smabilder = bilder.length > 1
    ? `<div style="display:flex;gap:var(--s-2);margin-top:var(--s-2);flex-wrap:wrap">
         ${bilder.map((u, i) => `
           <button type="button" data-bilde="${i}" aria-label="Vis bilde ${i + 1}"
             style="width:5rem;aspect-ratio:1.618;padding:0;cursor:pointer;border-radius:var(--radius);
                    overflow:hidden;border:2px solid ${i === visBilde ? "var(--copper)" : "var(--line)"}">
             <img src="${esc(u)}" alt="" style="width:100%;height:100%;object-fit:cover">
           </button>`).join("")}
       </div>`
    : "";

  const fakta = [
    ["Ringnummer", auksjon.ring_number],
    ["Stamme", auksjon.breed],
    ["Kjønn", auksjon.sex && auksjon.sex !== "ukjent" ? auksjon.sex : ""],
    ["Klekkeår", auksjon.hatch_year],
    ["Farge", auksjon.color],
    ["Far", auksjon.sire_ring],
    ["Mor", auksjon.dam_ring],
    ["Selger", auksjon.seller_label],
    ["Utropspris", kr(auksjon.starting_price)],
    ["Minstepris", auksjon.reserve_price ? "Ja" : "Nei"],
    ["Åpnet", dato(auksjon.starts_at)],
    [t === "avsluttet" ? "Avsluttet" : "Avsluttes", dato(auksjon.ends_at)],
  ].filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== "—");

  sett(rot, `
    <header style="margin-bottom:var(--s-4)">
      <div style="display:flex;gap:var(--s-2);align-items:center;flex-wrap:wrap;margin-bottom:var(--s-2)">
        ${auksjon.lot_no != null
          ? `<span class="merkelapp" style="font-family:var(--font-mono)">Lodd ${esc(auksjon.lot_no)}</span>` : ""}
        ${merkelapp(auksjon)}
        ${auksjon.extension_count > 0
          ? `<span class="merkelapp" title="Bud på tampen har forlenget runden">
               Forlenget ${auksjon.extension_count}×</span>` : ""}
      </div>
      <h1 style="font-size:clamp(var(--t-2),4.4vw,var(--t-4));margin-bottom:var(--s-2)">${esc(auksjon.title)}</h1>
      <p class="dempet-2" style="margin:0">
        ${esc([auksjon.breed, auksjon.ring_number].filter(Boolean).join(" · "))}
      </p>
    </header>

    <div class="auksjon-oppsett">
      <div>
        ${hovedbilde}${smabilder}
        ${auksjon.description ? `
          <section style="margin-top:var(--s-5)">
            <div class="seksjonstittel"><h2 style="font-size:var(--t-2)">Om duen</h2></div>
            <div class="dempet">${avsnitt(auksjon.description)}</div>
          </section>` : ""}
        <section style="margin-top:var(--s-5)">
          <div class="seksjonstittel"><h2 style="font-size:var(--t-2)">Opplysninger</h2></div>
          <table class="fakta"><tbody>
            ${fakta.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}
          </tbody></table>
          ${auksjon.pedigree_url ? `
            <p style="margin-top:var(--s-3)">
              <a class="knapp knapp-ramme knapp-tynn" href="${esc(auksjon.pedigree_url)}"
                 target="_blank" rel="noopener">Se stamtavle</a></p>` : ""}
        </section>
      </div>

      <aside class="auksjon-sidefelt">
        ${budpanel(t, harBud, jegLeder, jegHarBudt)}
        <section style="margin-top:var(--s-4)">
          <div class="seksjonstittel" style="margin-bottom:var(--s-2)">
            <h2 style="font-size:var(--t-1)">Budhistorikk</h2>
            <span class="dempet-2">${auksjon.bid_count} bud</span>
          </div>
          <div class="budlogg-ramme"><ul class="budlogg" id="budlogg">${budloggRader()}</ul></div>
        </section>
      </aside>
    </div>`);

  koble();
}

/* ------------------------------------------------------------------ */
function budpanel(t, harBud, jegLeder, jegHarBudt) {
  const pris = t === "avsluttet" && auksjon.winner_id ? auksjon.winning_price
             : harBud ? auksjon.current_price : auksjon.starting_price;
  const prisMerk = t === "avsluttet" && auksjon.winner_id ? "Tilslag"
                 : harBud ? "Høyeste bud" : "Utropspris";

  const topp = `
    <div class="budpanel-topp">
      ${merkelapp(auksjon)}
      ${t === "live"
        ? `<span class="nedtelling" data-slutt="${esc(auksjon.ends_at)}">–</span>`
        : t === "kommer"
        ? `<span class="tall dempet-2">Åpner ${esc(dato(auksjon.starts_at))}</span>`
        : `<span class="tall dempet-2">${esc(dato(auksjon.ends_at, false))}</span>`}
    </div>`;

  const noekkeltall = `
    <p class="lodd-pris-merk">${prisMerk}</p>
    <p class="budpanel-pris" id="pris">${kr(pris)}</p>
    <dl style="margin:var(--s-3) 0 0">
      ${harBud ? `<div class="budpanel-rad"><dt>Antall bud</dt><dd>${auksjon.bid_count}</dd></div>` : ""}
      ${t === "live" ? `<div class="budpanel-rad"><dt>Neste gyldige bud</dt>
        <dd id="minbud">${kr(auksjon.min_bid)}</dd></div>` : ""}
      ${mittTak != null ? `<div class="budpanel-rad"><dt>Maksbudet ditt</dt>
        <dd title="Bare du ser dette">${kr(mittTak)}</dd></div>` : ""}
      ${auksjon.reserve_price && t !== "avsluttet" ? `<div class="budpanel-rad">
        <dt>Minstepris</dt><dd>${auksjon.current_price >= auksjon.reserve_price
          ? '<span style="color:var(--sage)">nådd</span>'
          : '<span class="dempet">ikke nådd</span>'}</dd></div>` : ""}
      ${auksjon.soft_close_seconds > 0 && t === "live" ? `<div class="budpanel-rad">
        <dt>Forlengelse</dt><dd>${Math.round(auksjon.soft_close_seconds / 60)} min</dd></div>` : ""}
    </dl>`;

  let handling = "";

  if (t === "avsluttet") {
    handling = avsluttetBoks();
  } else if (t === "kommer") {
    handling = `<div class="bud-status bud-status-info" style="margin-top:var(--s-3)">
        Budgivningen åpner ${esc(dato(auksjon.starts_at))}.</div>`;
  } else if (t === "avlyst") {
    handling = `<div class="bud-status bud-status-overbudt" style="margin-top:var(--s-3)">
        Dette loddet er trukket fra auksjonen.</div>`;
  } else if (!meg) {
    handling = `
      <div class="bud-status bud-status-info" style="margin-top:var(--s-3)">
        Du må være innlogget for å by. Vi trenger kontaktopplysningene dine
        slik at selgeren kan sende faktura hvis du vinner.
      </div>
      <div style="display:grid;gap:var(--s-2);margin-top:var(--s-3)">
        <a class="knapp knapp-stor" href="registrer.html">Bli medlem</a>
        <a class="knapp knapp-ramme knapp-stor"
           href="logg-inn.html?retur=${encodeURIComponent(location.pathname + location.search)}">Logg inn</a>
      </div>`;
  } else if (!kanBy(minProfil)) {
    handling = `
      <div class="bud-status bud-status-overbudt" style="margin-top:var(--s-3)">
        Før du kan by må du fylle ut navn, telefon og adresse.
      </div>
      <a class="knapp knapp-stor" style="margin-top:var(--s-3)" href="konto.html#profil">
        Fyll ut opplysningene</a>`;
  } else if (auksjon.seller_id && auksjon.seller_id === meg.id) {
    handling = `<div class="bud-status bud-status-info" style="margin-top:var(--s-3)">
        Dette er ditt eget lodd, så du kan ikke by på det.</div>`;
  } else {
    handling = budskjema(jegLeder, jegHarBudt);
  }

  const folgeknapp = meg && t !== "avsluttet"
    ? `<button class="knapp knapp-ramme knapp-stor" id="folg" style="margin-top:var(--s-2)"
         aria-pressed="${folger}">${folger ? "Slutt å følge" : "Følg dette loddet"}</button>`
    : "";

  return `<div class="budpanel">${topp}
    <div class="budpanel-kropp">${noekkeltall}${handling}${folgeknapp}</div></div>`;
}

function budskjema(jegLeder, jegHarBudt) {
  const status = jegLeder
    ? `<div class="bud-status bud-status-leder">Du leder budrunden.</div>`
    : jegHarBudt
    ? `<div class="bud-status bud-status-overbudt">Du er overbudt.</div>`
    : "";

  const neste = Number(auksjon.min_bid);

  return `
    ${status ? `<div style="margin-top:var(--s-3)">${status}</div>` : ""}
    <form class="budform" id="budform">
      <div class="bud-bytte" role="group" aria-label="Type bud">
        <button type="button" data-modus="enkelt" aria-pressed="${budmodus === "enkelt"}">By neste trinn</button>
        <button type="button" data-modus="maks" aria-pressed="${budmodus === "maks"}">Sett maksbud</button>
      </div>

      <div id="modus-enkelt" ${budmodus !== "enkelt" ? "hidden" : ""}>
        <button class="knapp knapp-stor" type="submit" data-belop="${neste}">
          By ${kr(neste)}
        </button>
        <p class="felt-hjelp">Du byr nøyaktig neste trinn. Blir du overbudt, må du by på nytt.</p>
      </div>

      <div id="modus-maks" ${budmodus !== "maks" ? "hidden" : ""}>
        <label for="maksbelop">Høyeste beløp du vil gi</label>
        <input type="number" id="maksbelop" class="felt-belop" inputmode="numeric"
               min="${neste}" step="1" value="${neste}" required>
        <button class="knapp knapp-stor" type="submit" style="margin-top:var(--s-2)">
          Legg inn maksbud</button>
        <p class="felt-hjelp">
          Systemet byr for deg, ett trinn av gangen, bare så mye som trengs for
          å lede — og aldri over grensen din. Ingen andre får se beløpet.
        </p>
      </div>
    </form>`;
}

function avsluttetBoks() {
  if (!auksjon.winner_id) {
    return `<div class="bud-status bud-status-info" style="margin-top:var(--s-3)">
      ${auksjon.bid_count > 0
        ? "Runden er over. Minsteprisen ble ikke nådd, så loddet er usolgt."
        : "Runden er over uten bud."}</div>`;
  }
  const jegVant = meg && auksjon.winner_id === meg.id;
  const jegSolgte = meg && auksjon.seller_id === meg.id;

  if (jegVant) {
    return `<div class="bud-status bud-status-leder" style="margin-top:var(--s-3)">
        <strong>Du vant dette loddet.</strong> Selgeren har fått
        kontaktopplysningene dine og tar kontakt om oppgjør.
      </div>
      <a class="knapp knapp-stor" style="margin-top:var(--s-3)" href="konto.html#kjop">
        Se selgerens kontaktinfo</a>`;
  }
  if (jegSolgte) {
    return `<div class="bud-status bud-status-leder" style="margin-top:var(--s-3)">
        <strong>Loddet ditt er solgt.</strong></div>
      <a class="knapp knapp-stor" style="margin-top:var(--s-3)" href="mine-salg.html">
        Se kjøperens kontaktinfo</a>`;
  }
  return `<div class="bud-status bud-status-info" style="margin-top:var(--s-3)">
      Solgt for ${kr(auksjon.winning_price)} etter ${auksjon.bid_count} bud.</div>`;
}

function budloggRader() {
  if (!budliste.length)
    return `<li style="border:0;color:var(--ink-3)">Ingen bud ennå. Bli den første.</li>`;
  return budliste.map((b) => `
    <li class="${meg && b.bidder_id === meg.id ? "budlogg-meg" : ""}">
      <span class="budlogg-navn">${esc(b.bidder_alias)}${
        meg && b.bidder_id === meg.id ? " (deg)" : ""}</span>
      <span class="budlogg-belop">${kr(b.amount)}</span>
      <span class="budlogg-tid" title="${esc(dato(b.created_at))}">${esc(siden(b.created_at))}</span>
      <span class="budlogg-auto">${b.is_auto ? "automatisk" : ""}</span>
    </li>`).join("");
}

/* ------------------------------------------------------------------ */
function koble() {
  $$("[data-bilde]").forEach((k) =>
    k.addEventListener("click", () => { visBilde = Number(k.dataset.bilde); tegn(); }));

  $$("[data-modus]").forEach((k) =>
    k.addEventListener("click", () => { budmodus = k.dataset.modus; tegn(); }));

  $("#budform")?.addEventListener("submit", byLeggInn);
  $("#folg")?.addEventListener("click", folgBytt);
}

async function byLeggInn(hendelse) {
  hendelse.preventDefault();
  const knapp = hendelse.submitter ?? $("#budform button[type=submit]");

  const belop = budmodus === "maks"
    ? Number($("#maksbelop").value)
    : Number(knapp?.dataset.belop ?? auksjon.min_bid);

  if (!Number.isFinite(belop) || belop <= 0) {
    varsle("Skriv inn et gyldig beløp.", "feil");
    return;
  }
  if (belop >= 100000 &&
      !confirm(`Du er i ferd med å by ${kr(belop)}. Er du sikker?`)) return;

  jobber(knapp, true, "Sender bud …");
  const { data, error } = await sb.rpc("place_bid", { p_auction: id, p_max: belop });
  jobber(knapp, false);

  if (error) { varsle(feiltekst(error), "feil", 8); return; }

  varsle(data.message, data.result === "outbid" ? "feil" : "ok", 7);
  if (data.extended) varsle("Budet kom på tampen — runden er forlenget.", "info", 7);

  mittTak = belop;
  await friskOpp();
}

async function folgBytt() {
  if (!meg) return;
  if (folger) {
    await sb.from("watchlist").delete().eq("auction_id", id).eq("user_id", meg.id);
    folger = false;
  } else {
    const { error } = await sb.from("watchlist").insert({ auction_id: id, user_id: meg.id });
    if (error) { varsle(feiltekst(error), "feil"); return; }
    folger = true;
  }
  tegn();
}

async function friskOpp() {
  const [a, b] = await Promise.all([
    sb.from("auctions").select("*").eq("id", id).maybeSingle(),
    sb.from("bids").select("*").eq("auction_id", id).order("id", { ascending: false }).limit(60),
  ]);
  if (a.data) auksjon = a.data;
  if (b.data) budliste = b.data;
  tegn();
}

/* ------------------------------------------------------------------
   SANNTID
   Databasen kringkaster endringer på loddet og nye bud. Vi oppdaterer
   bare de feltene som faktisk er endret, slik at siden ikke hopper
   mens noen skriver inn et beløp.
   ------------------------------------------------------------------ */
function lyttTilEndringer() {
  sb.channel(`lodd:${id}`)
    .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "auctions", filter: `id=eq.${id}` },
        ({ new: rad }) => {
          const gammelPris = auksjon.current_price;
          const gammelSlutt = auksjon.ends_at;
          auksjon = { ...auksjon, ...rad };

          const prisFelt = $("#pris");
          if (prisFelt && Number(rad.current_price) !== Number(gammelPris)) {
            prisFelt.textContent = kr(rad.current_price);
            prisFelt.classList.remove("blinker");
            void prisFelt.offsetWidth;          // tvinger animasjonen til å starte på nytt
            prisFelt.classList.add("blinker");
          }
          const minFelt = $("#minbud");
          if (minFelt) minFelt.textContent = kr(rad.min_bid);

          if (rad.ends_at !== gammelSlutt) {
            const n = document.querySelector("[data-slutt]");
            if (n) n.dataset.slutt = rad.ends_at;
            varsle("Runden er forlenget etter et bud på tampen.", "info", 6);
          }
          // Tegn på nytt hvis noe som endrer knappene har skjedd.
          if (rad.status !== "live" || rad.leader_id !== auksjon.leader_id) tegn();
        })
    .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "bids", filter: `auction_id=eq.${id}` },
        ({ new: bud }) => {
          if (budliste.some((b) => b.id === bud.id)) return;
          budliste = [bud, ...budliste].slice(0, 60);
          const logg = $("#budlogg");
          if (logg) logg.innerHTML = budloggRader();
          if (meg && bud.bidder_id !== meg.id && auksjon.leader_id !== meg.id) {
            // noen andre byr — oppdater knappene så beløpet stemmer
            clearTimeout(window.__budTegn);
            window.__budTegn = setTimeout(tegn, 400);
          }
        })
    .subscribe();
}
