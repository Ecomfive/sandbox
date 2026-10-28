// CRM Dropshippers › Plantillas de WhatsApp (28 oct 2026): manda a Meta las plantillas sugeridas para retomar conversaciones, **una cada
// dos minutos**. Meta deja crear hasta 100 plantillas por hora y no documenta un mínimo entre una y otra; los dos minutos son una
// precaución nuestra para no parecer un envío en masa. Las que todavía no están en el sistema las agrega como borrador; las que ya están
// en Meta (en revisión, aprobadas…) no las toca.
// Uso: npx tsx scripts/crear-plantillas-sugeridas.ts [--aplicar] [--espera=120]   (sin --aplicar solo dice qué haría)
// Necesita WhatsApp conectado en el servidor (`D360_API_KEY`, o `WHATSAPP_TOKEN` y `WHATSAPP_WABA_ID`) y la migración 0169.

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { conexionPlantillas } from "../src/lib/whatsapp/api-plantillas";
import { ESPERA_ENTRE_PLANTILLAS_S } from "../src/lib/whatsapp/plantillas";
import { PLANTILLAS_SUGERIDAS } from "../src/lib/whatsapp/plantillas-sugeridas";
import { enviarPlantillaAMeta } from "../src/lib/whatsapp/plantillas-servidor";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const aplicar = process.argv.includes("--aplicar");
const espera = Math.max(0, Number(process.argv.find((a) => a.startsWith("--espera="))?.split("=")[1] ?? ESPERA_ENTRE_PLANTILLAS_S)) * 1000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const conexion = conexionPlantillas();
  if (!conexion.conectado) {
    console.error(`WhatsApp no está conectado: ${conexion.motivo}`);
    process.exit(1);
  }
  const { data, error } = await supabase.from("whatsapp_plantillas").select("id, nombre, idioma, estado, error_envio, meta_id");
  if (error) throw new Error(`${error.message} (¿falta la migración 0169?)`);
  const existentes = data ?? [];

  let enviadas = 0;
  for (const s of PLANTILLAS_SUGERIDAS) {
    let fila = existentes.find((p) => p.nombre === s.nombre && p.idioma === "es");
    if (fila && fila.estado !== "borrador" && !fila.error_envio) {
      console.log(`· ${s.nombre}: ya está en Meta (${fila.estado}). No se toca.`);
      continue;
    }
    if (!aplicar) {
      console.log(`· ${s.nombre}: ${fila ? "se manda a Meta" : "se agrega como borrador y se manda a Meta"}.`);
      continue;
    }
    if (enviadas > 0) {
      console.log(`  …esperando ${Math.round(espera / 1000)} s antes de la siguiente.`);
      // Unos segundos de margen: el sistema no deja mandar otra plantilla con menos de dos minutos de diferencia.
      await dormir(espera + 3000);
    }
    if (!fila) {
      const { data: nueva, error: e } = await supabase
        .from("whatsapp_plantillas")
        .insert({ nombre: s.nombre, idioma: "es", categoria: s.categoria, cuerpo: s.cuerpo, botones: s.botones, variables: s.variables, sugerida: s.clave, creado_por_nombre: "Script" })
        .select("id, nombre, idioma, estado, error_envio, meta_id")
        .single();
      if (e || !nueva) {
        console.error(`· ${s.nombre}: no se pudo agregar (${e?.message}).`);
        continue;
      }
      fila = nueva;
    }
    const r = await enviarPlantillaAMeta(supabase, fila.id as string);
    console.log("error" in r ? `· ${s.nombre}: ERROR — ${r.error}` : `· ${s.nombre}: enviada a Meta (en revisión).`);
    enviadas++;
  }
  console.log(aplicar ? `\n${enviadas} plantillas enviadas a Meta. Meta responde en minutos u horas; el sistema avisa.` : "\nSin --aplicar no se cambió nada.");
})();
