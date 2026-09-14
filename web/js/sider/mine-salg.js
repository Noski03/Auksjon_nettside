/* For selgere: loddene mine, og kontaktinfoen til kjøperne. */
import { start } from "../lib/ramme.js";
import { sb, feiltekst } from "../lib/supabase.js";
import { sett, esc } from "../lib/dom.js";
import { kr, dato, tilstand, TILSTAND_TEKST } from "../lib/format.js";
import { merkelapp, nedtellingStart } from "../lib/lodd.js";
import { krevInnlogging } from "../lib/okt.js";

await start();
nedtellingStart();

const meg = await krevInnlogging();
if (meg) await vis();

async function vis() {
  sett("#salg", '<div class="skjelett" style="height:12rem"></div>');

  const { data: lodd, error } = await sb.from("auctions").select("*")
    .eq("seller_id", meg.id).order("ends_at", { ascending: false });

  if (error) {
    sett("#salg", `<div class="beskjed beskjed-feil"><p>${esc(feiltekst(error))}</p></div>`);
    return;
  }
  if (!lodd?.length) {
    sett("#salg", `<div class="tomt">
      <h3>Ingen lodd registrert på deg</h3>
      <p class="dempet-2" style="margin:0">
        Arrangøren legger ut loddene og knytter dem til deg som selger.
        Ta kontakt hvis du har duer du vil ha med i neste auksjon.</p></div>`);
    return;
  }

  /* Kontaktinfoen til vinnerne. Databasen slipper oss bare inn på dem
     som faktisk har vunnet et av våre egne lodd. */
  const vinnere = lodd.map((a) => a.winner_id).filter(Boolean);
  let kart = new Map();
  if (vinnere.length) {
    const { data: profiler } = await sb.from("profiles").select("*").in("id", vinnere);
    kart = new Map((profiler ?? []).map((p) => [p.id, p]));
  }

  const solgt = lodd.filter((a) => a.winner_id);
  const sum = solgt.reduce((t, a) => t + Number(a.winning_price || 0), 0);

  const oppsummering = `
    <div style="display:flex;gap:var(--s-5);flex-wrap:wrap;
                border-top:3px double var(--line-strong);border-bottom:3px double var(--line-strong);
                padding:var(--s-3) 0;margin-bottom:var(--s-4)">
      ${[[lodd.length, "lodd totalt"], [solgt.length, "solgt"], [kr(sum), "samlet tilslag"]]
        .map(([v, m]) => `<div>
            <div class="tall" style="font-size:var(--t-2);font-weight:600">${esc(v)}</div>
            <div class="dempet-2">${esc(m)}</div></div>`).join("")}
    </div>`;

  sett("#salg", oppsummering + lodd.map((a) => kort(a, kart.get(a.winner_id))).join(""));
}

function kort(a, vinner) {
  const t = tilstand(a);
  const pris = a.winner_id ? a.winning_price
             : a.bid_count > 0 ? a.current_price : a.starting_price;
  const prisMerk = a.winner_id ? "Tilslag" : a.bid_count > 0 ? "Høyeste bud" : "Utropspris";

  let boks = "";
  if (t === "avsluttet" && vinner) {
    boks = `
      <div class="kontaktkort" style="margin-top:var(--s-3)">
        <h4>Kjøperens opplysninger — send faktura hit</h4>
        <dl>
          <dt>Navn</dt><dd>${esc(vinner.full_name || vinner.display_name)}</dd>
          <dt>E-post</dt><dd><a href="mailto:${esc(vinner.email)}">${esc(vinner.email)}</a></dd>
          <dt>Telefon</dt><dd><a href="tel:${esc((vinner.phone || "").replace(/\s/g, ""))}">${esc(vinner.phone)}</a></dd>
          <dt>Adresse</dt><dd>${esc(vinner.address)}<br>${esc(vinner.postal_code)} ${esc(vinner.city)}<br>${esc(vinner.country)}</dd>
          ${vinner.club ? `<dt>Forening</dt><dd>${esc(vinner.club)}</dd>` : ""}
        </dl>
      </div>`;
  } else if (t === "avsluttet" && a.bid_count > 0) {
    boks = `<div class="bud-status bud-status-info" style="margin-top:var(--s-3)">
        Minsteprisen ble ikke nådd. Loddet er usolgt.</div>`;
  } else if (t === "avsluttet") {
    boks = `<div class="bud-status bud-status-info" style="margin-top:var(--s-3)">
        Runden gikk ut uten bud.</div>`;
  }

  return `<div class="kort" style="margin-bottom:var(--s-3)">
    <div style="display:flex;justify-content:space-between;gap:var(--s-3);flex-wrap:wrap;align-items:flex-start">
      <div>
        <div style="margin-bottom:var(--s-2)">${merkelapp(a)}</div>
        <h3 style="margin-bottom:var(--s-1)">
          <a href="auksjon.html?id=${esc(a.id)}">${esc(a.title)}</a></h3>
        <p class="dempet-2" style="margin:0">
          ${a.lot_no != null ? `Lodd ${esc(a.lot_no)} · ` : ""}${a.bid_count} bud ·
          ${t === "live" ? `slutter om <span class="nedtelling" data-slutt="${esc(a.ends_at)}">–</span>`
                         : esc(dato(a.ends_at, false))}
        </p>
      </div>
      <div style="text-align:right">
        <span class="lodd-pris-merk">${prisMerk}</span>
        <span class="lodd-pris">${kr(pris)}</span>
      </div>
    </div>
    ${boks}
  </div>`;
}
