/* Formatering: kroner, klokkeslett og nedtelling. */

export function kr(n, medEnhet = true) {
  if (n === null || n === undefined || n === "") return "—";
  const tall = Number(n);
  if (!Number.isFinite(tall)) return "—";
  const s = Math.round(tall).toLocaleString("nb-NO").replace(/ /g, " ");
  return medEnhet ? `kr ${s}` : s;
}

export function dato(iso, medTid = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  const opt = medTid
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" };
  return d.toLocaleString("nb-NO", opt).replace(",", "");
}

export function klokke(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

/* "for 2 min siden" */
export function siden(iso) {
  const sek = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sek < 10) return "nettopp";
  if (sek < 60) return `${sek} sek siden`;
  const min = Math.floor(sek / 60);
  if (min < 60) return `${min} min siden`;
  const t = Math.floor(min / 60);
  if (t < 24) return `${t} ${t === 1 ? "time" : "timer"} siden`;
  const d = Math.floor(t / 24);
  if (d < 30) return `${d} ${d === 1 ? "dag" : "dager"} siden`;
  return dato(iso, false);
}

/* Tid igjen som "2 d 04:11" / "04:11:09" / "11:09". */
export function tidIgjen(sluttISO) {
  const ms = new Date(sluttISO).getTime() - Date.now();
  const sek = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(sek / 86400);
  const t = Math.floor((sek % 86400) / 3600);
  const m = Math.floor((sek % 3600) / 60);
  const s = sek % 60;
  const to = (n) => String(n).padStart(2, "0");

  let tekst;
  if (sek === 0) tekst = "avsluttet";
  else if (d > 0) tekst = `${d} d ${to(t)}:${to(m)}`;
  else if (t > 0) tekst = `${to(t)}:${to(m)}:${to(s)}`;
  else tekst = `${to(m)}:${to(s)}`;

  return { sekunder: sek, tekst, ferdig: sek === 0 };
}

/* Hva slags tilstand er loddet i, sett fra klokka nå? */
export function tilstand(auksjon) {
  const na = Date.now();
  if (auksjon.status === "cancelled") return "avlyst";
  if (auksjon.status === "ended") return "avsluttet";
  if (auksjon.status === "draft") return "kladd";
  if (new Date(auksjon.ends_at).getTime() <= na) return "avsluttet";
  if (new Date(auksjon.starts_at).getTime() > na) return "kommer";
  return "live";
}

export const TILSTAND_TEKST = {
  live: "Pågår nå",
  kommer: "Åpner snart",
  avsluttet: "Avsluttet",
  avlyst: "Avlyst",
  kladd: "Kladd",
};
