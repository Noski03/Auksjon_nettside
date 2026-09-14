/* ---------------------------------------------------------------------
   Enkel lokal webserver for web/-mappa. Ingen avhengigheter.

       node tools/server.mjs          → http://localhost:5173
       node tools/server.mjs 8080     → annen port

   Du trenger en server (ikke bare å dobbeltklikke index.html), fordi
   nettleseren nekter å laste JavaScript-moduler fra file://.
   --------------------------------------------------------------------- */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "web");
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 5173);

const TYPER = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  try {
    let sti = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (sti.endsWith("/")) sti += "index.html";

    const fil = join(ROT, normalize(sti).replace(/^(\.\.[/\\])+/, ""));
    if (!fil.startsWith(ROT)) { res.writeHead(403).end("Nei."); return; }

    const info = await stat(fil).catch(() => null);
    if (!info?.isFile()) {
      const fireNullFire = await readFile(join(ROT, "404.html")).catch(() => null);
      res.writeHead(404, { "content-type": TYPER[".html"] });
      res.end(fireNullFire ?? "Fant ikke siden.");
      return;
    }

    res.writeHead(200, {
      "content-type": TYPER[extname(fil).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(await readFile(fil));
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, () => {
  console.log(`Dueauksjonen kjører på http://localhost:${PORT}`);
  console.log("Avslutt med Ctrl+C");
});
