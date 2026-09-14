/* =====================================================================
   ØKT — hvem er innlogget, og hva har vi lov til
   ===================================================================== */
import { sb, feiltekst } from "./supabase.js";

let _profil = null;
let _lest = false;

export async function bruker() {
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

export async function profil(tvingNyLesing = false) {
  if (_lest && !tvingNyLesing) return _profil;
  const u = await bruker();
  if (!u) { _profil = null; _lest = true; return null; }
  const { data, error } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
  if (error) console.warn("Klarte ikke å hente profil:", feiltekst(error));
  _profil = data ?? null;
  _lest = true;
  return _profil;
}

export function glemProfil() { _profil = null; _lest = false; }

/* Har brukeren fylt ut nok til å kunne by? Samme krav som i databasen. */
export function kanBy(p) {
  if (!p) return false;
  const fylt = (v, min) => (v || "").trim().length > min;
  return fylt(p.full_name, 1) && fylt(p.email, 3) && fylt(p.phone, 5)
      && fylt(p.address, 3) && fylt(p.postal_code, 3) && fylt(p.city, 1);
}

export async function erAdmin() {
  const p = await profil();
  return !!p?.is_admin;
}

/* Sender brukeren til innlogging hvis de ikke er der de skal være. */
export async function krevInnlogging(returTil = location.pathname + location.search) {
  const u = await bruker();
  if (!u) {
    location.replace(`logg-inn.html?retur=${encodeURIComponent(returTil)}`);
    return null;
  }
  return u;
}

export async function krevAdmin() {
  const u = await krevInnlogging();
  if (!u) return false;
  if (!(await erAdmin())) {
    document.querySelector("main").innerHTML =
      `<div class="ramme"><div class="tomt"><h3>Ingen tilgang</h3>
       <p>Denne siden er bare for arrangøren.</p>
       <a class="knapp knapp-ramme" href="auksjoner.html">Til auksjonene</a></div></div>`;
    return false;
  }
  return true;
}

export async function loggUt() {
  await sb.auth.signOut();
  glemProfil();
  location.href = "index.html";
}
