/* =====================================================================
   FELLES RAMME — topplinje og bunnlinje settes inn av denne filen,
   slik at menyen bare finnes ett sted.
   ===================================================================== */
import { SIDE, ER_SATT_OPP } from "../config.js";
import { sb } from "./supabase.js";
import { $, lag, esc } from "./dom.js";
import { bruker, profil, erAdmin, loggUt } from "./okt.js";

/* Duemerket. Ring om foten, og fuglen inni. */
export const MERKE = `
<svg viewBox="0 0 32 32" aria-hidden="true">
  <g fill="currentColor">
    <ellipse cx="15.2" cy="18.4" rx="8.6" ry="5.2" transform="rotate(-14 15.2 18.4)"/>
    <circle cx="22.4" cy="11.8" r="3.7"/>
    <path d="M25.6 11.5 L28.9 12.7 L25.6 14.1 Z"/>
    <path d="M8.6 14.8 L1.9 11.1 L6.4 17.8 Z"/>
  </g>
  <path d="M10.4 16.9q5.2-2.4 9.4.7-4.4 4.4-9.4-.7z" fill="var(--petrol)" opacity=".9"/>
</svg>`;

const SIDER = [
  { href: "auksjoner.html", tekst: "Auksjoner" },
  { href: "regler.html", tekst: "Slik fungerer det" },
];

function naverende() {
  const f = location.pathname.split("/").pop() || "index.html";
  return f === "" ? "index.html" : f;
}

export async function byggRamme() {
  const her = naverende();
  const u = await bruker();
  const p = u ? await profil() : null;
  const admin = u ? await erAdmin() : false;

  const lenke = (l) =>
    `<a href="${l.href}"${her === l.href ? ' aria-current="page"' : ""}>${esc(l.tekst)}</a>`;

  const lenker = [...SIDER];
  if (u) lenker.push({ href: "konto.html", tekst: "Min side" });
  if (u) lenker.push({ href: "mine-salg.html", tekst: "Mine salg" });
  if (admin) lenker.push({ href: "admin.html", tekst: "Arrangør" });

  const hoyre = u
    ? `<button class="knapp knapp-ramme knapp-tynn" id="logg-ut-knapp">Logg ut${
        p?.display_name ? ` (${esc(p.display_name)})` : ""
      }</button>`
    : `<a class="knapp knapp-ramme knapp-tynn" href="logg-inn.html">Logg inn</a>
       <a class="knapp knapp-tynn" href="registrer.html">Bli medlem</a>`;

  const topp = lag(`
    <header class="topp">
      <div class="ramme topp-rad">
        <a class="merke" href="index.html">
          ${MERKE}
          <span>
            <span class="merke-navn">${esc(SIDE.navn)}</span>
            <span class="merke-under">${esc(SIDE.undertittel)}</span>
          </span>
        </a>
        <button class="meny-knapp" aria-expanded="false" aria-controls="hovedmeny">
          <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
            <path d="M0 1h16M0 6h16M0 11h16" stroke="currentColor" stroke-width="1.5"/>
          </svg> Meny
        </button>
        <nav class="meny" id="hovedmeny" aria-label="Hovedmeny">
          ${lenker.map(lenke).join("")}
          ${hoyre}
        </nav>
      </div>
    </header>`);

  const aar = new Date().getFullYear();
  const bunn = lag(`
    <footer class="bunn">
      <div class="ramme">
        <div class="bunn-rutenett">
          <div>
            <h4>${esc(SIDE.navn)}</h4>
            <p style="max-width:34ch;opacity:.85;margin:0">
              Auksjon av brevduer for ${esc(SIDE.arrangor)}. Bud er bindende.
              Oppgjør og henting avtales direkte mellom kjøper og selger.
            </p>
          </div>
          <div>
            <h4>Sider</h4>
            <ul>
              <li><a href="auksjoner.html">Alle auksjoner</a></li>
              <li><a href="regler.html">Slik fungerer det</a></li>
              <li><a href="konto.html">Min side</a></li>
            </ul>
          </div>
          <div>
            <h4>Kontakt</h4>
            <ul>
              <li><a href="mailto:${esc(SIDE.epost)}">${esc(SIDE.epost)}</a></li>
              <li>${esc(SIDE.arrangor)}</li>
            </ul>
          </div>
        </div>
        <div class="bunn-strek">
          <span>© ${aar} ${esc(SIDE.arrangor)}</span>
          <span>Alle klokkeslett i norsk tid</span>
        </div>
      </div>
    </footer>`);

  document.body.prepend(topp);
  document.body.append(bunn);

  const knapp = $(".meny-knapp");
  const meny = $(".meny");
  const smal = () => window.matchMedia("(max-width: 55rem)").matches;
  const still = () => { if (meny) meny.hidden = smal() && knapp.getAttribute("aria-expanded") !== "true"; };
  knapp?.addEventListener("click", () => {
    knapp.setAttribute("aria-expanded", knapp.getAttribute("aria-expanded") === "true" ? "false" : "true");
    still();
  });
  window.addEventListener("resize", still);
  still();

  $("#logg-ut-knapp")?.addEventListener("click", loggUt);

  if (!ER_SATT_OPP) visOppsettsvarsel();
}

function visOppsettsvarsel() {
  const b = lag(`
    <div class="ramme" style="padding-top:var(--s-3)">
      <div class="beskjed beskjed-varsel">
        <p><strong>Nettsiden er ikke koblet til en database ennå.</strong></p>
        <p style="margin:0">Åpne <code>web/js/config.js</code> og fyll inn
        <code>SUPABASE_URL</code> og <code>SUPABASE_ANON_KEY</code> fra Supabase
        (Project Settings → API). Se <code>README.md</code> for framgangsmåten.</p>
      </div>
    </div>`);
  document.querySelector("main")?.prepend(b);
}

/* Be databasen åpne og lukke det som skal åpnes og lukkes.
   Kalles ved sidevisning og med jevne mellomrom. */
export function startKlokke() {
  if (!ER_SATT_OPP) return;
  const tikk = () => sb.rpc("tick_auctions").then(
    () => {}, (e) => console.debug("klokke:", e.message)
  );
  tikk();
  setInterval(tikk, Math.max(20, SIDE.klokkeIntervallSek) * 1000);
}

/* Kalles øverst i hver sidefil. */
export async function start({ klokke = true } = {}) {
  await byggRamme();
  if (klokke) startKlokke();
}
