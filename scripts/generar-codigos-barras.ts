// Genera el código de barras INTERNO (EAN-13 con prefijo 20) a todos los productos que no tienen ninguno (pedido de Hernán,
// 8 oct 2026), con la misma función que el botón de la ficha (`wms_asignar_codigo_barras_interno`). Deja la línea en la
// actividad de cada producto. Quedan fuera los compuestos y los productos padre con variantes (no se escanean).
//
//   npx tsx scripts/generar-codigos-barras.ts            → cuántos y cuáles
//   npx tsx scripts/generar-codigos-barras.ts --aplicar  → los genera

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data, error } = await supabase.from("skus_maestros").select("id, codigo, tipo, padre_id, codigo_barras").order("numero");
  if (error) throw error;
  const padres = new Set(data.filter((p) => p.padre_id).map((p) => p.padre_id));
  const objetivo = data.filter((p) => !p.codigo_barras && p.tipo === "simple" && !padres.has(p.id));
  console.log(`${objetivo.length} productos sin código de barras.`);
  if (!aplicar) return console.log("Sin --aplicar no se generó nada.");
  let hechos = 0;
  for (const p of objetivo) {
    const { data: codigo, error: e } = await supabase.rpc("wms_asignar_codigo_barras_interno", { p_sku: p.id });
    if (e) {
      console.log(`⚠ ${p.codigo}: ${e.message}`);
      continue;
    }
    await supabase.from("historial_auditoria").insert({
      usuario_nombre: "Carga de códigos de barras",
      accion: "generar_codigo_barras",
      entidad: "skus_maestros",
      entidad_id: p.id,
      detalle: `${p.codigo} · ${codigo}`,
      despues: { "Código de barras": String(codigo) },
    });
    hechos++;
  }
  console.log(`Generados: ${hechos}.`);
})();
