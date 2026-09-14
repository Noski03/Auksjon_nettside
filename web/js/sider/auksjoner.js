/* Katalogsiden: alle lodd med søk, filter og sortering. */
import { start } from "../lib/ramme.js";
import { sb, feiltekst } from "../lib/supabase.js";
import { $, sett, esc, varsle } from "../lib/dom.js";
import { tilstand } from "../lib/format.js";
import { loddkort, nedtellingStart } from "../lib/lodd.js";
import { ER_SATT_OPP } from "../config.js";

await start();
nedtellingStart();

let alle = [];

async function hent() {
  sett("#liste", Array.from({ length: 6 },
    () => '<div class="skjelett skjelett-kort"></div>').join(""));

  const [lodd, runder] = await Promise.all([
    sb.from("auctions").select("*").neq("status", "draft")
      .order("ends_at", { ascending: true }).limit(500),
    sb.from("collections").select("*").eq("is_published", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (lodd.error) {
    varsle(feiltekst(lodd.error), "feil");
    sett("#liste", `<div class="tomt" style="grid-column:1/-1"><h3>Klarte ikke å hente loddene</h3>
      <p class="dempet-2">${esc(feiltekst(lodd.error))}</p></div>`);
    return;
  }
  alle = lodd.data ?? [];

  if (runder.data?.length) {
    const v = $("#filter-runde");
    for (const r of runder.data) {
      v.append(new Option(r.title, r.id));
    }
  }
  tegn();
}

function tegn() {
  const sok = $("#sok").value.trim().toLowerCase();
  const filterTilstand = $("#filter-tilstand").value;
  const runde = $("#filter-runde").value;
  const sortering = $("#sortering").value;

  let liste = alle.filter((a) => {
    if (filterTilstand !== "alle" && tilstand(a) !== filterTilstand) return false;
    if (runde !== "alle" && a.collection_id !== runde) return false;
    if (!sok) return true;
    return [a.title, a.ring_number, a.breed, a.color, a.description, a.lot_no]
      .filter(Boolean).join(" ").toLowerCase().includes(sok);
  });

  const pris = (a) => (a.bid_count > 0 ? Number(a.current_price) : Number(a.starting_price));
  const sorter = {
    slutt:      (a, b) => new Date(a.ends_at) - new Date(b.ends_at),
    lodd:       (a, b) => (a.lot_no ?? 1e9) - (b.lot_no ?? 1e9),
    "pris-opp": (a, b) => pris(a) - pris(b),
    "pris-ned": (a, b) => pris(b) - pris(a),
    bud:        (a, b) => b.bid_count - a.bid_count,
  }[sortering];
  liste = [...liste].sort(sorter);

  $("#treff").textContent =
    liste.length === 0 ? "" :
    `${liste.length} ${liste.length === 1 ? "lodd" : "lodd"} vises`;

  sett("#liste", liste.length
    ? liste.map((a) => loddkort(a)).join("")
    : `<div class="tomt" style="grid-column:1/-1">
         <h3>Ingen lodd passer</h3>
         <p class="dempet-2" style="margin:0 0 var(--s-3)">Prøv et annet søk eller fjern filtrene.</p>
         <button class="knapp knapp-ramme" id="nullstill">Nullstill filtre</button>
       </div>`);

  $("#nullstill")?.addEventListener("click", () => {
    $("#sok").value = "";
    $("#filter-tilstand").value = "alle";
    $("#filter-runde").value = "alle";
    tegn();
  });
}

for (const id of ["#sok", "#filter-tilstand", "#filter-runde", "#sortering"]) {
  $(id).addEventListener("input", tegn);
}

/* Ta imot ?tilstand=... fra lenker andre steder på siden. */
const onske = new URLSearchParams(location.search).get("tilstand");
if (onske) $("#filter-tilstand").value = onske;

if (ER_SATT_OPP) {
  await hent();

  /* Sanntid: prisen i katalogen skal stemme uten at man laster på nytt. */
  sb.channel("katalog")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "auctions" }, ({ new: rad }) => {
      const i = alle.findIndex((a) => a.id === rad.id);
      if (i === -1) return;
      alle[i] = { ...alle[i], ...rad };
      tegn();
    })
    .subscribe();
} else {
  sett("#liste", "");
}
