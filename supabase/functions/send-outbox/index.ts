/* =====================================================================
   send-outbox — tømmer e-postkøen
   Supabase Edge Function (Deno).

   Databasen legger alle varsler i tabellen public.outbox. Denne
   funksjonen henter de usendte og sender dem via Resend.

   Se supabase/functions/send-outbox/LESMEG.md for oppsett.
   ===================================================================== */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY");
const AVSENDER          = Deno.env.get("AVSENDER") ?? "Dueauksjonen <onboarding@resend.dev>";
const MAKS_PER_KJORING  = 40;

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function send(til: string, emne: string, html: string, tekst: string) {
  const svar = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: AVSENDER, to: [til], subject: emne, html, text: tekst }),
  });
  if (!svar.ok) throw new Error(`Resend svarte ${svar.status}: ${await svar.text()}`);
}

Deno.serve(async () => {
  if (!RESEND_API_KEY) {
    return Response.json({ feil: "RESEND_API_KEY mangler i miljøvariablene." }, { status: 500 });
  }

  // Først lar vi databasen lukke runder som har gått ut. Da er denne
  // funksjonen alene nok til å drive auksjonen videre uten pg_cron.
  await db.rpc("tick_auctions");

  const { data: ko, error } = await db
    .from("outbox")
    .select("*")
    .is("sent_at", null)
    .lt("attempts", 5)
    .order("id", { ascending: true })
    .limit(MAKS_PER_KJORING);

  if (error) return Response.json({ feil: error.message }, { status: 500 });

  let sendt = 0, feilet = 0;

  for (const m of ko ?? []) {
    try {
      await send(m.to_email, m.subject, m.body_html, m.body_text);
      await db.from("outbox")
        .update({ sent_at: new Date().toISOString(), error: null })
        .eq("id", m.id);
      sendt++;
    } catch (e) {
      feilet++;
      await db.from("outbox")
        .update({ attempts: (m.attempts ?? 0) + 1, error: String(e).slice(0, 500) })
        .eq("id", m.id);
    }
  }

  return Response.json({ sendt, feilet, i_ko: (ko ?? []).length });
});
