/* Innlogging, og «glemt passord». */
import { start } from "../lib/ramme.js";
import { sb, feiltekst } from "../lib/supabase.js";
import { $, sett, esc, jobber, varsle } from "../lib/dom.js";
import { bruker, glemProfil } from "../lib/okt.js";

await start({ klokke: false });

const retur = new URLSearchParams(location.search).get("retur") || "auksjoner.html";

/* Allerede innlogget? Da er det ingen grunn til å vise skjemaet. */
if (await bruker()) location.replace(retur);

function melding(tekst, type = "feil") {
  sett("#melding", `<div class="beskjed beskjed-${type}"><p>${esc(tekst)}</p></div>`);
}

$("#skjema").addEventListener("submit", async (h) => {
  h.preventDefault();
  sett("#melding", "");
  const knapp = h.submitter;
  const epost = $("#epost").value.trim();
  const passord = $("#passord").value;

  if (!epost || !passord) { melding("Fyll ut både e-post og passord."); return; }

  jobber(knapp, true, "Logger inn …");
  const { error } = await sb.auth.signInWithPassword({ email: epost, password: passord });
  jobber(knapp, false);

  if (error) { melding(feiltekst(error)); return; }
  glemProfil();
  location.replace(retur);
});

$("#glemt").addEventListener("click", async () => {
  const epost = $("#epost").value.trim();
  if (!epost) {
    melding("Skriv inn e-postadressen din i feltet over først, så sender vi en lenke.", "info");
    $("#epost").focus();
    return;
  }
  const { error } = await sb.auth.resetPasswordForEmail(epost, {
    redirectTo: new URL("nytt-passord.html", location.href).href,
  });
  if (error) { melding(feiltekst(error)); return; }
  melding(`Vi har sendt en lenke til ${epost}. Sjekk innboksen — og søppelposten.`, "ok");
});
