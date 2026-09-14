/* Min side: budene mine, kjøpene mine, hva jeg følger, og opplysningene mine. */
import { start } from "../lib/ramme.js";
import { sb, feiltekst } from "../lib/supabase.js";
import { $, $$, sett, esc, varsle, jobber } from "../lib/dom.js";
import { kr, dato, tilstand } from "../lib/format.js";
import { loddkort, nedtellingStart } from "../lib/lodd.js";
import { krevInnlogging, profil, glemProfil, kanBy } from "../lib/okt.js";

await start();
nedtellingStart();

const meg = await krevInnlogging();
if (meg) {
  const p = await profil();
  $("#hilsen").textContent = p?.display_name ? `Hei, ${p.display_name}` : "Min side";

  if (!kanBy(p)) varsle("Fyll ut kontaktopplysningene dine for å kunne by.", "feil", 9);

  byttFane(location.hash.replace("#", "") || "bud");
  $$("[data-fane]").forEach((k) => k.addEventListener("click", () => byttFane(k.dataset.fane)));
}

function byttFane(navn) {
  const gyldig = ["bud", "kjop", "folger", "profil"];
  if (!gyldig.includes(navn)) navn = "bud";
  for (const n of gyldig) {
    $(`#fane-${n}`).hidden = n !== navn;
    $(`[data-fane="${n}"]`)?.setAttribute("aria-selected", String(n === navn));
  }
  history.replaceState(null, "", `#${navn}`);
  ({ bud: visBud, kjop: visKjop, folger: visFolger, profil: visProfil })[navn]();
}

function laster(mal) { sett(mal, '<div class="skjelett" style="height:12rem"></div>'); }
function ingenting(tittel, tekst, knapp = true) {
  return `<div class="tomt"><h3>${esc(tittel)}</h3>
    <p class="dempet-2" style="margin:0 0 var(--s-3)">${esc(tekst)}</p>
    ${knapp ? '<a class="knapp knapp-ramme" href="auksjoner.html">Se auksjonene</a>' : ""}</div>`;
}

/* ---------------- Budene mine --------------------------------------- */
async function visBud() {
  laster("#fane-bud");

  const { data: mine, error } = await sb.from("bids")
    .select("auction_id, amount, created_at")
    .eq("bidder_id", meg.id).order("id", { ascending: false }).limit(500);
  if (error) { sett("#fane-bud", ingenting("Klarte ikke å hente budene", feiltekst(error))); return; }

  const ider = [...new Set((mine ?? []).map((b) => b.auction_id))];
  if (!ider.length) {
    sett("#fane-bud", ingenting("Du har ikke budt ennå",
      "Når du legger inn ditt første bud, dukker loddet opp her.")); return;
  }

  const { data: lodd } = await sb.from("auctions").select("*").in("id", ider);
  const sisteBud = new Map();
  for (const b of mine) if (!sisteBud.has(b.auction_id)) sisteBud.set(b.auction_id, b);

  const sortert = (lodd ?? []).sort((a, b) => {
    const rang = (x) => (tilstand(x) === "live" ? 0 : 1);
    return rang(a) - rang(b) || new Date(a.ends_at) - new Date(b.ends_at);
  });

  const rad = (a) => {
    const t = tilstand(a);
    const leder = a.leader_id === meg.id;
    const vant = t === "avsluttet" && a.winner_id === meg.id;
    const merke = vant ? '<span class="merkelapp merkelapp-leder">Du vant</span>'
      : t === "avsluttet" ? '<span class="merkelapp merkelapp-slutt">Ikke ditt</span>'
      : leder ? '<span class="merkelapp merkelapp-leder"><span class="prikk"></span>Du leder</span>'
      : '<span class="merkelapp merkelapp-overbudt">Overbudt</span>';
    return `<tr>
      <td><a href="auksjon.html?id=${esc(a.id)}">${esc(a.title)}</a>
          ${a.lot_no != null ? `<span class="dempet-2"> · lodd ${esc(a.lot_no)}</span>` : ""}</td>
      <td>${merke}</td>
      <td class="tall">${kr(sisteBud.get(a.id)?.amount)}</td>
      <td class="tall">${kr(a.current_price)}</td>
      <td>${t === "live"
            ? `<span class="nedtelling" data-slutt="${esc(a.ends_at)}">–</span>`
            : `<span class="dempet-2">${esc(dato(a.ends_at, false))}</span>`}</td>
    </tr>`;
  };

  sett("#fane-bud", `
    <div class="tabell-rull"><table class="tabell">
      <thead><tr><th>Lodd</th><th>Status</th><th>Ditt siste bud</th>
                 <th>Står på</th><th>Slutter</th></tr></thead>
      <tbody>${sortert.map(rad).join("")}</tbody>
    </table></div>`);
}

/* ---------------- Kjøpene mine -------------------------------------- */
async function visKjop() {
  laster("#fane-kjop");

  const { data: lodd, error } = await sb.from("auctions").select("*")
    .eq("winner_id", meg.id).eq("status", "ended")
    .order("settled_at", { ascending: false });
  if (error) { sett("#fane-kjop", ingenting("Klarte ikke å hente kjøpene", feiltekst(error))); return; }
  if (!lodd?.length) {
    sett("#fane-kjop", ingenting("Ingen kjøp ennå",
      "Vinner du en budrunde, finner du selgerens kontaktopplysninger her.")); return;
  }

  /* Radsikkerheten slipper oss inn i kontaktinfoen først nå — fordi vi vant. */
  const { data: kontakter } = await sb.from("auction_contacts").select("*")
    .in("auction_id", lodd.map((a) => a.id));
  const kart = new Map((kontakter ?? []).map((k) => [k.auction_id, k]));

  sett("#fane-kjop", lodd.map((a) => {
    const k = kart.get(a.id);
    return `<div class="kort" style="margin-bottom:var(--s-3)">
      <div style="display:flex;justify-content:space-between;gap:var(--s-3);flex-wrap:wrap">
        <div>
          <h3 style="margin-bottom:var(--s-1)">
            <a href="auksjon.html?id=${esc(a.id)}">${esc(a.title)}</a></h3>
          <p class="dempet-2" style="margin:0">
            ${a.lot_no != null ? `Lodd ${esc(a.lot_no)} · ` : ""}Avsluttet ${esc(dato(a.settled_at || a.ends_at, false))}</p>
        </div>
        <div style="text-align:right">
          <span class="lodd-pris-merk">Tilslag</span>
          <span class="lodd-pris">${kr(a.winning_price)}</span>
        </div>
      </div>
      <div class="kontaktkort" style="margin-top:var(--s-3)">
        <h4>Selgerens kontaktopplysninger</h4>
        ${k ? `<dl>
          ${k.seller_name  ? `<dt>Navn</dt><dd>${esc(k.seller_name)}</dd>` : ""}
          ${k.seller_email ? `<dt>E-post</dt><dd><a href="mailto:${esc(k.seller_email)}">${esc(k.seller_email)}</a></dd>` : ""}
          ${k.seller_phone ? `<dt>Telefon</dt><dd><a href="tel:${esc(k.seller_phone.replace(/\s/g, ""))}">${esc(k.seller_phone)}</a></dd>` : ""}
        </dl>` : `<p style="margin:0;font-size:var(--t--1)">
            Selgeren har ikke registrert kontaktopplysninger. Ta kontakt med arrangøren.</p>`}
        <p style="margin:var(--s-2) 0 0;font-size:var(--t--2);color:var(--ink-2)">
          Selgeren har også fått dine opplysninger og sender faktura.</p>
      </div>
    </div>`;
  }).join(""));
}

/* ---------------- Følger -------------------------------------------- */
async function visFolger() {
  laster("#fane-folger");
  const { data } = await sb.from("watchlist").select("auction_id").eq("user_id", meg.id);
  const ider = (data ?? []).map((r) => r.auction_id);
  if (!ider.length) {
    sett("#fane-folger", ingenting("Du følger ingen lodd",
      "Trykk «Følg dette loddet» på et lodd for å samle dem her.")); return;
  }
  const { data: lodd } = await sb.from("auctions").select("*").in("id", ider)
    .order("ends_at", { ascending: true });
  sett("#fane-folger",
    `<div class="lodd-rutenett">${(lodd ?? []).map((a) => loddkort(a)).join("")}</div>`);
}

/* ---------------- Opplysninger -------------------------------------- */
async function visProfil() {
  const p = await profil(true);
  const felt = (id, merke, verdi, type = "text", auto = "", hjelp = "") => `
    <div class="felt">
      <label for="${id}">${esc(merke)}</label>
      <input type="${type}" id="${id}" value="${esc(verdi ?? "")}" autocomplete="${auto}">
      ${hjelp ? `<p class="felt-hjelp">${hjelp}</p>` : ""}
    </div>`;

  sett("#fane-profil", `
    ${kanBy(p) ? "" : `<div class="beskjed beskjed-varsel">
      <p style="margin:0"><strong>Du kan ikke by ennå.</strong> Alle feltene under
      «Privat» må være fylt ut, slik at selgeren kan sende faktura hvis du vinner.</p></div>`}
    <form id="profilskjema" class="kort" style="max-width:38rem">
      <p class="stikkord" style="margin-top:0">Vises offentlig</p>
      ${felt("f_visning", "Visningsnavn", p?.display_name, "text", "nickname",
             "Det eneste andre ser om deg i budhistorikken.")}

      <p class="stikkord" style="margin-top:var(--s-4)">Privat — bare for oppgjør</p>
      ${felt("f_navn", "Fullt navn", p?.full_name, "text", "name")}
      <div class="felt-rad">
        ${felt("f_tlf", "Telefon", p?.phone, "tel", "tel")}
        ${felt("f_forening", "Forening", p?.club, "text", "organization")}
      </div>
      ${felt("f_adresse", "Adresse", p?.address, "text", "street-address")}
      <div class="felt-rad">
        ${felt("f_postnr", "Postnummer", p?.postal_code, "text", "postal-code")}
        ${felt("f_sted", "Poststed", p?.city, "text", "address-level2")}
        ${felt("f_land", "Land", p?.country || "Norge", "text", "country-name")}
      </div>
      <div class="felt">
        <label for="f_epost">E-post</label>
        <input type="email" id="f_epost" value="${esc(p?.email ?? "")}" disabled>
        <p class="felt-hjelp">E-postadressen er knyttet til innloggingen og kan ikke endres her.</p>
      </div>
      <button class="knapp" type="submit">Lagre opplysningene</button>
    </form>`);

  $("#profilskjema").addEventListener("submit", async (h) => {
    h.preventDefault();
    const knapp = h.submitter;
    const v = (id) => $(id).value.trim();

    if (!v("#f_visning")) { varsle("Visningsnavn kan ikke stå tomt.", "feil"); return; }

    jobber(knapp, true, "Lagrer …");
    const { error } = await sb.from("profiles").update({
      display_name: v("#f_visning"), full_name: v("#f_navn"), phone: v("#f_tlf"),
      club: v("#f_forening"), address: v("#f_adresse"), postal_code: v("#f_postnr"),
      city: v("#f_sted"), country: v("#f_land") || "Norge",
    }).eq("id", meg.id);
    jobber(knapp, false);

    if (error) { varsle(feiltekst(error), "feil"); return; }
    glemProfil();
    varsle("Opplysningene er lagret.", "ok");
    visProfil();
  });
}
