/* Små hjelpere for å bygge og finne elementer uten et rammeverk. */

export const $  = (velger, rot = document) => rot.querySelector(velger);
export const $$ = (velger, rot = document) => Array.from(rot.querySelectorAll(velger));

/* Escaper tekst før den settes inn som HTML. Alt som kommer fra
   databasen — titler, alias, beskrivelser — går gjennom denne. */
export function esc(tekst) {
  if (tekst === null || tekst === undefined) return "";
  return String(tekst)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/* Beskrivelsestekst med linjeskift bevart. */
export function avsnitt(tekst) {
  return esc(tekst || "").split(/\n{2,}/).filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

export function lag(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function sett(mal, html) {
  const n = typeof mal === "string" ? $(mal) : mal;
  if (n) n.innerHTML = html;
  return n;
}

export function vis(node, synlig) { if (node) node.hidden = !synlig; }

/* Sprettvarsel nede på siden. */
export function varsle(tekst, type = "info", sekunder = 5) {
  let felt = $(".varselfelt");
  if (!felt) {
    felt = lag('<div class="varselfelt" role="status" aria-live="polite"></div>');
    document.body.append(felt);
  }
  const v = lag(`<div class="varsel varsel-${type}">${esc(tekst)}</div>`);
  felt.append(v);
  setTimeout(() => {
    v.style.transition = "opacity .3s";
    v.style.opacity = "0";
    setTimeout(() => v.remove(), 320);
  }, sekunder * 1000);
}

/* Knapp som viser at noe skjer, og som ikke kan trykkes to ganger. */
export function jobber(knapp, pa, tekstMensViVenter = "Jobber …") {
  if (!knapp) return;
  if (pa) {
    knapp.dataset.tekst = knapp.innerHTML;
    knapp.disabled = true;
    knapp.innerHTML = esc(tekstMensViVenter);
  } else {
    knapp.disabled = false;
    if (knapp.dataset.tekst) knapp.innerHTML = knapp.dataset.tekst;
  }
}

export function parameter(navn) {
  return new URLSearchParams(location.search).get(navn);
}
