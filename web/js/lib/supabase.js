/* =====================================================================
   Én delt tilkobling til Supabase for hele nettstedet.

   Biblioteket lastes fra web/js/vendor/supabase.js via en vanlig
   <script>-tagg i hver side, og legger seg på window.supabase. Det er
   med vilje: laster vi det fra en CDN, og CDN-en er nede, mister hver
   eneste side både meny og bunntekst.
   ===================================================================== */
import { SUPABASE_URL, SUPABASE_ANON_KEY, ER_SATT_OPP } from "../config.js";

const bibliotek = globalThis.supabase;

if (!bibliotek?.createClient) {
  throw new Error(
    "Fant ikke Supabase-biblioteket. Sjekk at <script src=\"js/vendor/supabase.js\"> " +
    "ligger i <head> på siden, før modulskriptet.");
}

export const sb = bibliotek.createClient(
  ER_SATT_OPP ? SUPABASE_URL : "https://ikke-satt-opp.supabase.co",
  ER_SATT_OPP ? SUPABASE_ANON_KEY : "ikke-satt-opp",
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 12 } },
  }
);

/* Gjør feilmeldinger fra databasen leselige. Meldingene fra våre egne
   funksjoner er allerede skrevet på norsk, og slipper gjennom som de er. */
export function feiltekst(error) {
  if (!error) return "Ukjent feil.";
  const m = error.message || String(error);
  const kjente = {
    "Invalid login credentials": "Feil e-post eller passord.",
    "Email not confirmed": "Du må bekrefte e-postadressen din først. Se innboksen.",
    "User already registered": "Det finnes allerede en bruker med denne e-posten.",
    "Password should be at least 6 characters": "Passordet må ha minst 6 tegn.",
    "For security purposes, you can only request this after": "Vent litt før du prøver igjen.",
    "duplicate key value": "Dette finnes allerede.",
    "violates row-level security": "Du har ikke tilgang til dette.",
  };
  for (const [engelsk, norsk] of Object.entries(kjente)) {
    if (m.includes(engelsk)) return norsk;
  }
  if (m.includes("Failed to fetch"))
    return "Fikk ikke kontakt med serveren. Sjekk nettforbindelsen.";
  return m;
}
