/* Ny bruker. Kontaktopplysningene følger med inn i profilen. */
import { start } from "../lib/ramme.js";
import { sb, feiltekst } from "../lib/supabase.js";
import { $, sett, esc, jobber } from "../lib/dom.js";
import { bruker, glemProfil } from "../lib/okt.js";

await start({ klokke: false });

if (await bruker()) location.replace("konto.html");

function melding(tekst, type = "feil") {
  sett("#melding", `<div class="beskjed beskjed-${type}"><p>${esc(tekst)}</p></div>`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* Foreslå et visningsnavn ut fra e-posten, men la folk overstyre. */
$("#epost").addEventListener("blur", () => {
  const felt = $("#visningsnavn");
  if (!felt.value.trim()) {
    const f = $("#epost").value.split("@")[0].replace(/[._-]+/g, " ").trim();
    if (f) felt.value = f.charAt(0).toUpperCase() + f.slice(1);
  }
});

$("#skjema").addEventListener("submit", async (h) => {
  h.preventDefault();
  sett("#melding", "");
  const knapp = h.submitter;

  const v = (id) => $(id).value.trim();
  const epost = v("#epost"), passord = $("#passord").value, passord2 = $("#passord2").value;

  const mangler = [
    [!epost, "e-post"], [!passord, "passord"], [!v("#visningsnavn"), "visningsnavn"],
    [!v("#navn"), "fullt navn"], [!v("#telefon"), "telefon"], [!v("#adresse"), "adresse"],
    [!v("#postnr"), "postnummer"], [!v("#sted"), "poststed"],
  ].filter(([m]) => m).map(([, n]) => n);

  if (mangler.length) { melding("Du mangler: " + mangler.join(", ") + "."); return; }
  if (passord.length < 8) { melding("Passordet må ha minst 8 tegn."); return; }
  if (passord !== passord2) { melding("De to passordene er ikke like."); return; }
  if (!/^\d{4}$/.test(v("#postnr"))) { melding("Postnummeret skal være fire siffer."); return; }
  if (!$("#godta").checked) { melding("Du må godta reglene for å opprette bruker."); return; }

  jobber(knapp, true, "Oppretter …");
  const { data, error } = await sb.auth.signUp({
    email: epost,
    password: passord,
    options: {
      emailRedirectTo: new URL("konto.html", location.href).href,
      data: {
        display_name: v("#visningsnavn"),
        full_name: v("#navn"),
        phone: v("#telefon"),
        address: v("#adresse"),
        postal_code: v("#postnr"),
        city: v("#sted"),
        country: v("#land") || "Norge",
        club: v("#forening"),
      },
    },
  });
  jobber(knapp, false);

  if (error) { melding(feiltekst(error)); return; }

  glemProfil();

  /* Har prosjektet skrudd av e-postbekreftelse, er man innlogget med én gang. */
  if (data.session) { location.replace("auksjoner.html"); return; }

  $("#skjema").hidden = true;
  melding(
    `Nesten i mål. Vi har sendt en bekreftelseslenke til ${epost}. ` +
    "Åpne den, så er kontoen klar til bruk. Ligger den ikke i innboksen, se i søppelposten.",
    "ok");
});
