/* =====================================================================
   OPPSETT — den eneste filen du MÅ fylle ut.

   Begge verdiene finner du i Supabase:
     Project Settings → API → Project URL / Project API keys → anon public

   Det er trygt at anon-nøkkelen ligger her i klartekst. Den gir bare
   tilgang til det radsikkerheten i databasen tillater. Service-nøkkelen
   skal derimot ALDRI havne i denne mappen — den hører hjemme i
   Edge Functions, ingen andre steder.
   ===================================================================== */

export const SUPABASE_URL = "DIN_SUPABASE_URL";
export const SUPABASE_ANON_KEY = "DIN_SUPABASE_ANON_KEY";

export const SIDE = {
  navn: "Dueauksjonen",
  undertittel: "Brevduer på auksjon",
  epost: "post@example.com",
  arrangor: "Din dueforening",

  // Hvor ofte nettsiden ber databasen sjekke om noe skal åpne eller
  // lukke. Sanntidsbudene kommer uansett med én gang — dette gjelder
  // bare klokka. 60 sekunder holder.
  klokkeIntervallSek: 60,

  // Under så mange sekunder igjen regnes en runde som "haster"
  // og nedtellingen blir rød.
  hasterSek: 300,
};

export const ER_SATT_OPP =
  !SUPABASE_URL.startsWith("DIN_") && !SUPABASE_ANON_KEY.startsWith("DIN_");
