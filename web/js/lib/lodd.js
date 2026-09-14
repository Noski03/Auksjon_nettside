/* =====================================================================
   LODD — kortet som vises i listene, bilde-erstatning og nedtelling
   ===================================================================== */
import { esc, $$ } from "./dom.js";
import { kr, tidIgjen, tilstand, TILSTAND_TEKST, dato } from "./format.js";
import { SIDE } from "../config.js";

/* Har ikke loddet bilde, tegner vi et. Bedre enn et knust bildeikon,
   og det gir listene en rolig rytme. */
export function bildeErstatning(auksjon) {
  const nr = auksjon.lot_no ?? "";
  return `
  <svg class="lodd-erstatning" viewBox="0 0 320 198" role="img"
       aria-label="Ikke noe bilde av dette loddet" style="width:100%;height:100%">
    <rect width="320" height="198" fill="var(--paper-sunk)"/>
    <g stroke="var(--line)" stroke-width="1" opacity=".75">
      ${Array.from({ length: 11 }, (_, i) =>
        `<line x1="${-40 + i * 34}" y1="198" x2="${40 + i * 34}" y2="0"/>`).join("")}
    </g>
    <g transform="translate(160 99)" opacity=".55">
      <circle r="42" fill="var(--paper-sunk)" stroke="var(--line-strong)" stroke-width="1.5"/>
      <g transform="translate(-24 -24) scale(1.5)" fill="var(--line-strong)">
    <ellipse cx="15.2" cy="18.4" rx="8.6" ry="5.2" transform="rotate(-14 15.2 18.4)"/>
    <circle cx="22.4" cy="11.8" r="3.7"/>
    <path d="M25.6 11.5 L28.9 12.7 L25.6 14.1 Z"/>
    <path d="M8.6 14.8 L1.9 11.1 L6.4 17.8 Z"/>
      </g>
    </g>
    ${nr !== "" ? `<text x="160" y="180" text-anchor="middle"
        font-family="IBM Plex Mono, monospace" font-size="11" letter-spacing="2"
        fill="var(--ink-3)">LODD ${esc(nr)}</text>` : ""}
  </svg>`;
}

export function merkelapp(auksjon) {
  const t = tilstand(auksjon);
  const klasse = { live: "merkelapp-live", kommer: "merkelapp-kommer",
                   avsluttet: "merkelapp-slutt", avlyst: "merkelapp-slutt",
                   kladd: "merkelapp-kommer" }[t];
  const prikk = t === "live" ? '<span class="prikk"></span>' : "";
  return `<span class="merkelapp ${klasse}">${prikk}${TILSTAND_TEKST[t]}</span>`;
}

/* Tekstlinjen nederst til høyre på kortet. */
function tidslinje(auksjon) {
  const t = tilstand(auksjon);
  if (t === "live")
    return `<span class="dempet-2">Slutter om</span><br>
            <span class="nedtelling" data-slutt="${auksjon.ends_at}">–</span>`;
  if (t === "kommer")
    return `<span class="dempet-2">Åpner</span><br>
            <span class="tall">${esc(dato(auksjon.starts_at))}</span>`;
  return `<span class="dempet-2">Avsluttet</span><br>
          <span class="tall">${esc(dato(auksjon.ends_at, false))}</span>`;
}

export function loddkort(auksjon, { favoritt = false, visFavoritt = false } = {}) {
  const t = tilstand(auksjon);
  const harBud = auksjon.bid_count > 0;
  const solgt = t === "avsluttet" && auksjon.winner_id;

  const prisMerk = solgt ? "Tilslag" : harBud ? "Høyeste bud" : "Utropspris";
  const pris = solgt ? auksjon.winning_price
              : harBud ? auksjon.current_price
              : auksjon.starting_price;

  const bilde = auksjon.image_urls?.length
    ? `<img src="${esc(auksjon.image_urls[0])}" alt="${esc(auksjon.title)}" loading="lazy">`
    : bildeErstatning(auksjon);

  const undertekst = [
    auksjon.breed, auksjon.ring_number,
    auksjon.sex && auksjon.sex !== "ukjent" ? auksjon.sex : "",
  ].filter(Boolean).join(" · ");

  return `
  <a class="lodd" href="auksjon.html?id=${esc(auksjon.id)}">
    <div class="lodd-bilde">
      ${bilde}
      ${auksjon.lot_no != null ? `<span class="lodd-nr">${esc(auksjon.lot_no)}</span>` : ""}
      <span class="lodd-merke">${merkelapp(auksjon)}</span>
      ${visFavoritt ? `<button class="lodd-hjerte" type="button" data-favoritt="${esc(auksjon.id)}"
          aria-pressed="${favoritt}" aria-label="Følg dette loddet"
          onclick="event.preventDefault()">
          <svg width="14" height="13" viewBox="0 0 14 13" fill="${favoritt ? "currentColor" : "none"}"
               stroke="currentColor" stroke-width="1.4"><path d="M7 12C3.5 9.4 1 7.3 1 4.7 1 2.7 2.5 1.3 4.3 1.3c1.1 0 2.1.6 2.7 1.4.6-.8 1.6-1.4 2.7-1.4C11.5 1.3 13 2.7 13 4.7 13 7.3 10.5 9.4 7 12z"/></svg>
        </button>` : ""}
    </div>
    <div class="lodd-kropp">
      <h3 class="lodd-tittel">${esc(auksjon.title)}</h3>
      ${undertekst ? `<p class="lodd-meta">${esc(undertekst)}</p>` : ""}
      <div class="lodd-fot">
        <div>
          <span class="lodd-pris-merk">${prisMerk}</span>
          <span class="lodd-pris">${kr(pris)}</span>
          ${harBud ? `<span class="dempet-2"> · ${auksjon.bid_count} bud</span>` : ""}
        </div>
        <div class="lodd-tid">${tidslinje(auksjon)}</div>
      </div>
    </div>
  </a>`;
}

/* ---------------------------------------------------------------------
   NEDTELLING
   Ett eneste intervall oppdaterer alle nedtellinger på siden. Elementer
   merkes med data-slutt="<ISO-tid>".
   --------------------------------------------------------------------- */
let _nedtellingIGang = false;
const _nar0 = new Set();

export function nedtellingStart() {
  if (_nedtellingIGang) return;
  _nedtellingIGang = true;
  const tikk = () => {
    for (const el of $$("[data-slutt]")) {
      const { tekst, sekunder, ferdig } = tidIgjen(el.dataset.slutt);
      if (el.textContent !== tekst) el.textContent = tekst;
      el.classList.toggle("nedtelling-haster", !ferdig && sekunder < SIDE.hasterSek);
      if (ferdig) {
        for (const f of _nar0) f(el);
        el.removeAttribute("data-slutt");
      }
    }
  };
  tikk();
  setInterval(tikk, 1000);
}

/* Kjør noe når en nedtelling treffer null (f.eks. laste siden på nytt). */
export function nedtellingNarFerdig(f) { _nar0.add(f); }
