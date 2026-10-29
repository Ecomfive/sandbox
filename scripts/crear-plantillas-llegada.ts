// CRM Dropshippers › Plantillas de WhatsApp (29 oct 2026): deja en el sistema, como borrador, las plantillas de aviso de llegada de mercancía (las que todavía no estén). No las manda a Meta:
// eso lo hace el sistema solo, una cada dos minutos, cuando se enciende `PLANTILLAS_LLEGADA_AUTO_META=1`, o a mano desde la pantalla de Plantillas.
// Uso: npx tsx scripts/crear-plantillas-llegada.ts [--aplicar]   (sin --aplicar solo dice qué haría). Necesita la migración 0170.

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { asegurarBorradoresDeLlegada, faltantesDeLlegada } from "../src/lib/whatsapp/plantillas-llegada";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  const { data, error } = await supabase.from("whatsapp_plantillas").select("nombre").eq("idioma", "es");
  if (error) throw new Error(`${error.message} (¿falta la migración 0170?)`);
  const faltan = faltantesDeLlegada((data ?? []).map((p) => p.nombre as string));
  if (!faltan.length) return console.log("Las plantillas de aviso de llegada ya están en el sistema.");
  if (!process.argv.includes("--aplicar")) {
    for (const p of faltan) console.log(`· ${p.nombre}: se agregaría como borrador (${p.categoria}).`);
    return console.log("\nSin --aplicar no se cambió nada.");
  }
  const { creadas } = await asegurarBorradoresDeLlegada(supabase, { id: null, nombre: "Script" });
  console.log(creadas.length ? `Borradores creados: ${creadas.join(", ")}.` : "No se pudo crear ninguno.");
})();
