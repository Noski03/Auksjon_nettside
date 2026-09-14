/* Siden man havner på fra lenken i «glemt passord»-e-posten. */
import { start } from "../lib/ramme.js";
import { sb, feiltekst } from "../lib/supabase.js";
import { $, sett, esc, jobber } from "../lib/dom.js";

await start({ klokke: false });

function melding(tekst, type = "feil") {
  sett("#melding", `<div class="beskjed beskjed-${type}"><p>${esc(tekst)}</p></div>`);
}

/* Lenken i e-posten gir oss en midlertidig økt. Uten den kan vi ikke bytte passord. */
const { data } = await sb.auth.getSession();
if (!data.session) {
  melding("Denne lenken er brukt opp eller utløpt. Be om en ny fra innloggingssiden.", "info");
  $("#skjema").hidden = true;
}

$("#skjema").addEventListener("submit", async (h) => {
  h.preventDefault();
  sett("#melding", "");
  const knapp = h.submitter;
  const p1 = $("#passord").value, p2 = $("#passord2").value;

  if (p1.length < 8) { melding("Passordet må ha minst 8 tegn."); return; }
  if (p1 !== p2) { melding("De to passordene er ikke like."); return; }

  jobber(knapp, true, "Lagrer …");
  const { error } = await sb.auth.updateUser({ password: p1 });
  jobber(knapp, false);

  if (error) { melding(feiltekst(error)); return; }
  $("#skjema").hidden = true;
  melding("Passordet er endret. Du er innlogget.", "ok");
  setTimeout(() => location.replace("auksjoner.html"), 1800);
});
