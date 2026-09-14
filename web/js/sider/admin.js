/* =====================================================================
   ARRANGØRSIDEN — legge ut lodd, styre runder, se e-postkøen.
   Alt her krever is_admin i databasen; knappene er bare bekvemmelighet.
   ===================================================================== */
import { start } from "../lib/ramme.js";
import { sb, feiltekst } from "../lib/supabase.js";
import { $, $$, sett, esc, varsle, jobber } from "../lib/dom.js";
import { kr, dato, tilstand, TILSTAND_TEKST } from "../lib/format.js";
import { merkelapp, nedtellingStart } from "../lib/lodd.js";
import { krevAdmin } from "../lib/okt.js";

await start();
nedtellingStart();

let runder = [];
let medlemmer = [];

if (await krevAdmin()) {
  const [r, m] = await Promise.all([
    sb.from("collections").select("*").order("sort_order"),
    sb.from("profiles").select("id, display_name, full_name, email").order("full_name"),
  ]);
  runder = r.data ?? [];
  medlemmer = m.data ?? [];

  byttFane("lodd");
  $$("[data-fane]").forEach((k) => k.addEventListener("click", () => byttFane(k.dataset.fane)));
}

function byttFane(navn) {
  for (const n of ["lodd", "runder", "post"]) {
    $(`#fane-${n}`).hidden = n !== navn;
    $(`[data-fane="${n}"]`)?.setAttribute("aria-selected", String(n === navn));
  }
  ({ lodd: visLodd, runder: visRunder, post: visPost })[navn]();
}

/* --- Tid fram og tilbake mellom ISO og feltet i nettleseren ---------- */
function tilLokal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fraLokal = (v) => (v ? new Date(v).toISOString() : null);

/* ==================== LODD ========================================== */
async function visLodd() {
  sett("#fane-lodd", '<div class="skjelett" style="height:14rem"></div>');

  const { data: lodd, error } = await sb.from("auctions").select("*")
    .order("status").order("ends_at", { ascending: true });
  if (error) {
    sett("#fane-lodd", `<div class="beskjed beskjed-feil"><p>${esc(feiltekst(error))}</p></div>`);
    return;
  }

  const rad = (a) => `
    <tr>
      <td class="tall">${a.lot_no ?? "—"}</td>
      <td><a href="auksjon.html?id=${esc(a.id)}">${esc(a.title)}</a>
          ${a.status === "draft" ? '<span class="merkelapp" style="margin-left:.4rem">Kladd</span>' : ""}</td>
      <td>${merkelapp(a)}</td>
      <td class="tall">${kr(a.bid_count > 0 ? a.current_price : a.starting_price)}</td>
      <td class="tall">${a.bid_count}</td>
      <td class="tall">${esc(dato(a.ends_at))}</td>
      <td style="white-space:nowrap">
        <button class="knapp knapp-ramme knapp-tynn" data-rediger="${esc(a.id)}">Rediger</button>
        ${a.status === "draft"
          ? `<button class="knapp knapp-tynn" data-publiser="${esc(a.id)}">Publiser</button>` : ""}
        ${["live", "scheduled"].includes(a.status)
          ? `<button class="knapp knapp-ramme knapp-tynn" data-avslutt="${esc(a.id)}">Avslutt nå</button>` : ""}
        ${a.bid_count === 0
          ? `<button class="knapp knapp-ramme knapp-tynn" data-slett="${esc(a.id)}">Slett</button>` : ""}
      </td>
    </tr>`;

  sett("#fane-lodd", `
    <div style="display:flex;justify-content:space-between;gap:var(--s-3);flex-wrap:wrap;
                align-items:center;margin-bottom:var(--s-3)">
      <p class="dempet-2" style="margin:0">${lodd.length} lodd totalt</p>
      <button class="knapp" id="nytt-lodd">+ Nytt lodd</button>
    </div>
    ${lodd.length ? `<div class="tabell-rull"><table class="tabell">
      <thead><tr><th>Nr</th><th>Tittel</th><th>Tilstand</th><th>Pris</th>
                 <th>Bud</th><th>Slutter</th><th></th></tr></thead>
      <tbody>${lodd.map(rad).join("")}</tbody></table></div>`
      : `<div class="tomt"><h3>Ingen lodd ennå</h3>
           <p class="dempet-2" style="margin:0">Trykk «Nytt lodd» for å legge ut den første duen.</p></div>`}`);

  $("#nytt-lodd").addEventListener("click", () => skjema(null));
  $$("[data-rediger]").forEach((k) => k.addEventListener("click",
    () => skjema(lodd.find((a) => a.id === k.dataset.rediger))));
  $$("[data-publiser]").forEach((k) => k.addEventListener("click", () => publiser(k)));
  $$("[data-avslutt]").forEach((k) => k.addEventListener("click", () => avsluttNa(k)));
  $$("[data-slett]").forEach((k) => k.addEventListener("click", () => slett(k)));
}

async function publiser(knapp) {
  const id = knapp.dataset.publiser;
  jobber(knapp, true, "…");
  const { error } = await sb.from("auctions").update({ status: "scheduled" }).eq("id", id);
  if (error) varsle(feiltekst(error), "feil");
  else { varsle("Loddet er publisert. Det åpner av seg selv på starttidspunktet.", "ok"); }
  await sb.rpc("tick_auctions");
  visLodd();
}

async function avsluttNa(knapp) {
  if (!confirm("Avslutte budrunden nå? Høyeste bud får tilslaget, og e-post går ut."))
    return;
  jobber(knapp, true, "…");
  const { error } = await sb.from("auctions")
    .update({ ends_at: new Date().toISOString() }).eq("id", knapp.dataset.avslutt);
  if (error) { varsle(feiltekst(error), "feil"); jobber(knapp, false); return; }
  await sb.rpc("tick_auctions");
  varsle("Runden er avsluttet.", "ok");
  visLodd();
}

async function slett(knapp) {
  if (!confirm("Slette loddet for godt? Dette kan ikke angres.")) return;
  const { error } = await sb.from("auctions").delete().eq("id", knapp.dataset.slett);
  if (error) varsle(feiltekst(error), "feil");
  else varsle("Loddet er slettet.", "ok");
  visLodd();
}

/* --- Skjema for ett lodd -------------------------------------------- */
async function skjema(a) {
  const nytt = !a;
  const dlg = $("#lodd-dialog");
  $("#dialog-tittel").textContent = nytt ? "Nytt lodd" : `Rediger lodd ${a.lot_no ?? ""}`;

  let kontakt = { seller_name: "", seller_email: "", seller_phone: "" };
  if (!nytt) {
    const { data } = await sb.from("auction_contacts").select("*").eq("auction_id", a.id).maybeSingle();
    if (data) kontakt = data;
  }

  const om2dager = new Date(Date.now() + 2 * 864e5);
  const v = (felt, fall = "") => esc(a?.[felt] ?? fall);

  sett("#dialog-kropp", `
    <form id="loddskjema">
      <p class="stikkord" style="margin-top:0">Duen</p>
      <div class="felt-rad">
        <div class="felt" style="flex:0 0 7rem">
          <label for="s_nr">Loddnummer</label>
          <input type="number" id="s_nr" value="${v("lot_no")}">
        </div>
        <div class="felt" style="grid-column:span 2">
          <label for="s_tittel">Tittel</label>
          <input type="text" id="s_tittel" value="${v("title")}" required>
        </div>
      </div>
      <div class="felt">
        <label for="s_beskrivelse">Beskrivelse</label>
        <textarea id="s_beskrivelse">${v("description")}</textarea>
      </div>
      <div class="felt-rad">
        <div class="felt"><label for="s_ring">Ringnummer</label>
          <input type="text" id="s_ring" value="${v("ring_number")}"></div>
        <div class="felt"><label for="s_stamme">Stamme</label>
          <input type="text" id="s_stamme" value="${v("breed")}"></div>
        <div class="felt"><label for="s_kjonn">Kjønn</label>
          <select id="s_kjonn">
            ${["ukjent", "hann", "hunn"].map((k) =>
              `<option value="${k}"${(a?.sex ?? "ukjent") === k ? " selected" : ""}>${k}</option>`).join("")}
          </select></div>
      </div>
      <div class="felt-rad">
        <div class="felt"><label for="s_aar">Klekkeår</label>
          <input type="number" id="s_aar" value="${v("hatch_year")}"></div>
        <div class="felt"><label for="s_farge">Farge</label>
          <input type="text" id="s_farge" value="${v("color")}"></div>
      </div>
      <div class="felt-rad">
        <div class="felt"><label for="s_far">Far (ringnr.)</label>
          <input type="text" id="s_far" value="${v("sire_ring")}"></div>
        <div class="felt"><label for="s_mor">Mor (ringnr.)</label>
          <input type="text" id="s_mor" value="${v("dam_ring")}"></div>
      </div>
      <div class="felt">
        <label for="s_stamtavle">Lenke til stamtavle <span class="valgfritt">(valgfritt)</span></label>
        <input type="url" id="s_stamtavle" value="${v("pedigree_url")}">
      </div>

      <p class="stikkord" style="margin-top:var(--s-4)">Bilder</p>
      <div class="felt">
        <input type="file" id="s_filer" accept="image/*" multiple>
        <p class="felt-hjelp">Bildene lastes opp til Supabase. Første bilde brukes i katalogen.</p>
      </div>
      <div class="felt">
        <label for="s_bilder">Bildelenker (én per linje)</label>
        <textarea id="s_bilder" style="min-height:4.5rem;font-family:var(--font-mono);font-size:var(--t--1)"
          >${esc((a?.image_urls ?? []).join("\n"))}</textarea>
      </div>

      <p class="stikkord" style="margin-top:var(--s-4)">Pris og tid</p>
      <div class="felt-rad">
        <div class="felt"><label for="s_utrop">Utropspris</label>
          <input type="number" id="s_utrop" value="${v("starting_price", 100)}" min="0" required></div>
        <div class="felt"><label for="s_minste">Minstepris <span class="valgfritt">(valgfritt)</span></label>
          <input type="number" id="s_minste" value="${v("reserve_price")}" min="0"></div>
      </div>
      <div class="felt-rad">
        <div class="felt"><label for="s_start">Åpner</label>
          <input type="datetime-local" id="s_start"
                 value="${tilLokal(a?.starts_at ?? new Date().toISOString())}" required></div>
        <div class="felt"><label for="s_slutt">Avsluttes</label>
          <input type="datetime-local" id="s_slutt"
                 value="${tilLokal(a?.ends_at ?? om2dager.toISOString())}" required></div>
      </div>
      <div class="felt-rad">
        <div class="felt"><label for="s_forleng">Forlengelse ved bud på tampen (minutter)</label>
          <input type="number" id="s_forleng" min="0" max="60"
                 value="${Math.round((a?.soft_close_seconds ?? 180) / 60)}"></div>
        <div class="felt"><label for="s_runde">Auksjonsrunde</label>
          <select id="s_runde">
            <option value="">(ingen)</option>
            ${runder.map((r) => `<option value="${esc(r.id)}"${a?.collection_id === r.id ? " selected" : ""}
              >${esc(r.title)}</option>`).join("")}
          </select></div>
      </div>
      <div class="felt">
        <label for="s_status">Tilstand</label>
        <select id="s_status">
          ${[["draft", "Kladd — ikke synlig"], ["scheduled", "Publisert — åpner på klokkeslettet"],
             ["live", "Åpen for bud nå"], ["cancelled", "Avlyst"]]
            .map(([k, t]) => `<option value="${k}"${(a?.status ?? "draft") === k ? " selected" : ""}>${t}</option>`).join("")}
        </select>
      </div>

      <p class="stikkord" style="margin-top:var(--s-4)">Selger</p>
      <div class="felt">
        <label for="s_selger">Registrert bruker <span class="valgfritt">(valgfritt)</span></label>
        <select id="s_selger">
          <option value="">(ingen bruker — bruk feltene under)</option>
          ${medlemmer.map((m) => `<option value="${esc(m.id)}"${a?.seller_id === m.id ? " selected" : ""}
            >${esc(m.full_name || m.display_name)} — ${esc(m.email)}</option>`).join("")}
        </select>
        <p class="felt-hjelp">Velges en bruker, ser vedkommende loddet under «Mine salg»
          og får kjøperens opplysninger automatisk.</p>
      </div>
      <div class="felt">
        <label for="s_merke">Selgernavn som vises offentlig</label>
        <input type="text" id="s_merke" value="${v("seller_label")}" placeholder="Ola N., Sandefjord">
      </div>
      <div class="felt-rad">
        <div class="felt"><label for="s_knavn">Selgerens navn (privat)</label>
          <input type="text" id="s_knavn" value="${esc(kontakt.seller_name)}"></div>
        <div class="felt"><label for="s_kepost">Selgerens e-post (privat)</label>
          <input type="email" id="s_kepost" value="${esc(kontakt.seller_email)}"></div>
        <div class="felt"><label for="s_ktlf">Selgerens telefon (privat)</label>
          <input type="tel" id="s_ktlf" value="${esc(kontakt.seller_phone)}"></div>
      </div>
      <p class="felt-hjelp" style="margin-bottom:var(--s-4)">
        Disse tre feltene er skjult for publikum. De brukes til varselet når
        loddet er solgt, og vises for vinneren etterpå.</p>

      <button class="knapp knapp-stor" type="submit">${nytt ? "Opprett loddet" : "Lagre endringer"}</button>
    </form>`);

  dlg.showModal();
  $("#loddskjema").addEventListener("submit", (h) => lagre(h, a));
}

async function lastOppBilder(filer) {
  const lenker = [];
  for (const fil of filer) {
    const navn = `${Date.now()}-${fil.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await sb.storage.from("lots").upload(navn, fil, { upsert: false });
    if (error) { varsle(`Kunne ikke laste opp ${fil.name}: ${feiltekst(error)}`, "feil", 8); continue; }
    lenker.push(sb.storage.from("lots").getPublicUrl(navn).data.publicUrl);
  }
  return lenker;
}

async function lagre(hendelse, a) {
  hendelse.preventDefault();
  const knapp = hendelse.submitter;
  const v = (id) => $(id).value.trim();
  const tall = (id) => (v(id) === "" ? null : Number(v(id)));

  if (new Date(v("#s_slutt")) <= new Date(v("#s_start"))) {
    varsle("Sluttidspunktet må være etter starttidspunktet.", "feil"); return;
  }

  jobber(knapp, true, "Lagrer …");

  const nye = $("#s_filer").files.length ? await lastOppBilder($("#s_filer").files) : [];
  const bilder = [...v("#s_bilder").split("\n").map((s) => s.trim()).filter(Boolean), ...nye];

  const rad = {
    lot_no: tall("#s_nr"), title: v("#s_tittel"), description: v("#s_beskrivelse"),
    ring_number: v("#s_ring"), breed: v("#s_stamme"), sex: v("#s_kjonn"),
    hatch_year: tall("#s_aar"), color: v("#s_farge"),
    sire_ring: v("#s_far"), dam_ring: v("#s_mor"), pedigree_url: v("#s_stamtavle"),
    image_urls: bilder,
    starting_price: tall("#s_utrop") ?? 100, reserve_price: tall("#s_minste"),
    starts_at: fraLokal(v("#s_start")), ends_at: fraLokal(v("#s_slutt")),
    soft_close_seconds: Math.round((tall("#s_forleng") ?? 3) * 60),
    collection_id: v("#s_runde") || null, status: v("#s_status"),
    seller_id: v("#s_selger") || null, seller_label: v("#s_merke"),
  };

  let id = a?.id;
  let feil;
  if (a) {
    ({ error: feil } = await sb.from("auctions").update(rad).eq("id", a.id));
  } else {
    const { data, error } = await sb.from("auctions").insert(rad).select("id").single();
    feil = error; id = data?.id;
  }

  if (!feil && id) {
    ({ error: feil } = await sb.from("auction_contacts").upsert({
      auction_id: id, seller_name: v("#s_knavn"),
      seller_email: v("#s_kepost"), seller_phone: v("#s_ktlf"),
      updated_at: new Date().toISOString(),
    }));
  }

  jobber(knapp, false);
  if (feil) { varsle(feiltekst(feil), "feil", 8); return; }

  $("#lodd-dialog").close();
  varsle(a ? "Endringene er lagret." : "Loddet er opprettet.", "ok");
  visLodd();
}

/* ==================== AUKSJONSRUNDER ================================ */
async function visRunder() {
  const { data } = await sb.from("collections").select("*").order("sort_order");
  runder = data ?? [];

  sett("#fane-runder", `
    <p class="dempet" style="max-width:56ch">
      En runde er en samling lodd, for eksempel «Høstauksjon 2026». Den er
      bare til for å gruppere loddene i katalogen — budene styres av
      tidspunktene på hvert enkelt lodd.</p>

    ${runder.length ? `<div class="tabell-rull"><table class="tabell">
      <thead><tr><th>Tittel</th><th>Kortnavn</th><th>Synlig</th><th>Stenger</th><th></th></tr></thead>
      <tbody>${runder.map((r) => `<tr>
        <td>${esc(r.title)}</td>
        <td class="tall">${esc(r.slug)}</td>
        <td>${r.is_published ? "ja" : "nei"}</td>
        <td class="tall">${esc(r.closes_at ? dato(r.closes_at, false) : "—")}</td>
        <td><button class="knapp knapp-ramme knapp-tynn" data-slett-runde="${esc(r.id)}">Slett</button></td>
      </tr>`).join("")}</tbody></table></div>` : ""}

    <form id="ny-runde" class="kort" style="margin-top:var(--s-4);max-width:34rem">
      <h3>Ny runde</h3>
      <div class="felt"><label for="r_tittel">Tittel</label>
        <input type="text" id="r_tittel" required placeholder="Høstauksjon 2026"></div>
      <div class="felt"><label for="r_slug">Kortnavn</label>
        <input type="text" id="r_slug" required placeholder="host-2026" pattern="[a-z0-9-]+">
        <p class="felt-hjelp">Bare små bokstaver, tall og bindestrek.</p></div>
      <div class="felt"><label for="r_beskrivelse">Beskrivelse</label>
        <textarea id="r_beskrivelse" style="min-height:5rem"></textarea></div>
      <div class="felt-rad">
        <div class="felt"><label for="r_apner">Åpner</label>
          <input type="datetime-local" id="r_apner"></div>
        <div class="felt"><label for="r_stenger">Stenger</label>
          <input type="datetime-local" id="r_stenger"></div>
      </div>
      <button class="knapp" type="submit">Opprett runde</button>
    </form>`);

  $("#ny-runde").addEventListener("submit", async (h) => {
    h.preventDefault();
    const knapp = h.submitter;
    jobber(knapp, true, "…");
    const { error } = await sb.from("collections").insert({
      title: $("#r_tittel").value.trim(),
      slug: $("#r_slug").value.trim().toLowerCase(),
      description: $("#r_beskrivelse").value.trim(),
      opens_at: fraLokal($("#r_apner").value),
      closes_at: fraLokal($("#r_stenger").value),
      sort_order: runder.length + 1,
    });
    jobber(knapp, false);
    if (error) { varsle(feiltekst(error), "feil"); return; }
    varsle("Runden er opprettet.", "ok");
    visRunder();
  });

  $$("[data-slett-runde]").forEach((k) => k.addEventListener("click", async () => {
    if (!confirm("Slette runden? Loddene blir liggende, men mister grupperingen.")) return;
    const { error } = await sb.from("collections").delete().eq("id", k.dataset.slettRunde);
    if (error) varsle(feiltekst(error), "feil"); else visRunder();
  }));
}

/* ==================== E-POSTKØ ====================================== */
async function visPost() {
  sett("#fane-post", '<div class="skjelett" style="height:10rem"></div>');
  const { data, error } = await sb.from("outbox").select("*")
    .order("id", { ascending: false }).limit(100);

  if (error) {
    sett("#fane-post", `<div class="beskjed beskjed-feil"><p>${esc(feiltekst(error))}</p></div>`);
    return;
  }
  const venter = (data ?? []).filter((m) => !m.sent_at).length;

  sett("#fane-post", `
    <div class="beskjed beskjed-info">
      <p style="margin:0">Databasen skriver alle varsler hit. Har du satt opp
      Edge-funksjonen <code>send-outbox</code>, tømmes køen automatisk. Har du
      ikke gjort det, blir meldingene liggende her — og du kan sende dem manuelt.
      ${venter ? `<strong>${venter} venter på å bli sendt.</strong>` : "Ingen venter akkurat nå."}</p>
    </div>
    ${data?.length ? `<div class="tabell-rull"><table class="tabell">
      <thead><tr><th>Til</th><th>Emne</th><th>Type</th><th>Laget</th><th>Sendt</th></tr></thead>
      <tbody>${data.map((m) => `<tr>
        <td>${esc(m.to_email)}</td>
        <td>${esc(m.subject)}</td>
        <td><span class="merkelapp">${esc(m.kind)}</span></td>
        <td class="tall">${esc(dato(m.created_at))}</td>
        <td>${m.sent_at
              ? `<span class="tall" style="color:var(--sage)">${esc(dato(m.sent_at))}</span>`
              : m.error ? `<span style="color:var(--alert)">${esc(m.error.slice(0, 40))}</span>`
              : '<span class="dempet-2">venter</span>'}</td>
      </tr>`).join("")}</tbody></table></div>`
      : '<div class="tomt"><h3>Køen er tom</h3><p class="dempet-2" style="margin:0">Ingen varsler er laget ennå.</p></div>'}`);
}
