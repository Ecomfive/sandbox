// Rellena landing_url + las 9 columnas metrica_* de wms_filtro_productos (Panamá) a partir de:
//   - .scratch-metricas/manifest-metricas.json (clickup_id -> métricas, ya parseado de la descripción de cada tarea)
//   - .scratch-metricas/nombres.json (clickup_id -> nombre de la tarea en ClickUp, para poder emparejar por nombre,
//     que es la misma clave que usó la importación original)
//
// Por defecto NO escribe nada: solo dice qué haría y para cuántos productos. Para aplicar de verdad:
//
// Uso: npx tsx scripts/backfill-metricas-filtros.ts [--aplicar]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const PAIS_ID_PANAMA = "d558eb6f-601c-4f1d-84f0-10b6c0c491da";
const MANIFEST_PATH = ".scratch-metricas/manifest-metricas.json";
const NOMBRES_PATH = ".scratch-metricas/nombres.json";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

interface Metrica {
  clickup_id: string;
  landing_url: string | null;
  oferta: number | null;
  cpm: number | null;
  efectividad: number | null;
  hook_rate: number | null;
  ctr: number | null;
  cpa: number | null;
  gasto: number | null;
  compras: number | null;
  cvr: number | null;
}

async function main() {
  const metricas: Metrica[] = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const nombres: Record<string, string> = JSON.parse(readFileSync(NOMBRES_PATH, "utf8"));
  console.log(`${metricas.length} tarea(s) en el manifiesto de métricas.`);

  const { data: existentes, error: errorExistentes } = await supabase
    .from("wms_filtro_productos")
    .select("id, nombre")
    .eq("pais_id", PAIS_ID_PANAMA);
  if (errorExistentes) throw new Error(`Error leyendo productos existentes: ${errorExistentes.message}`);
  const idPorNombre = new Map((existentes ?? []).map((r) => [r.nombre, r.id]));

  let actualizados = 0;
  let sinDatos = 0;
  let sinCoincidencia = 0;
  let errores = 0;

  for (const m of metricas) {
    const nombre = nombres[m.clickup_id];
    if (!nombre) {
      console.log(`  ! Sin nombre para clickup_id ${m.clickup_id}, se salta.`);
      sinCoincidencia++;
      continue;
    }
    if (m.landing_url === null) {
      sinDatos++;
      continue;
    }
    const id = idPorNombre.get(nombre);
    if (!id) {
      console.log(`  ! "${nombre}" (${m.clickup_id}) no existe en wms_filtro_productos, se salta.`);
      sinCoincidencia++;
      continue;
    }

    console.log(`  + "${nombre}" (${m.clickup_id}) — landing: sí, oferta: ${m.oferta}, gasto: ${m.gasto}, compras: ${m.compras}`);

    if (!aplicar) {
      actualizados++;
      continue;
    }

    const { error: errorUpdate } = await supabase
      .from("wms_filtro_productos")
      .update({
        landing_url: m.landing_url,
        metrica_oferta: m.oferta,
        metrica_cpm: m.cpm,
        metrica_efectividad: m.efectividad,
        metrica_hook_rate: m.hook_rate,
        metrica_ctr: m.ctr,
        metrica_cpa: m.cpa,
        metrica_gasto: m.gasto,
        metrica_compras: m.compras,
        metrica_cvr: m.cvr,
      })
      .eq("id", id);
    if (errorUpdate) {
      console.log(`    ! Error actualizando "${nombre}": ${errorUpdate.message}`);
      errores++;
      continue;
    }
    actualizados++;
  }

  console.log(
    aplicar
      ? `Listo: ${actualizados} actualizado(s), ${sinDatos} sin datos en ClickUp, ${sinCoincidencia} sin coincidencia, ${errores} error(es).`
      : `Modo de prueba (sin --aplicar): se actualizarían ${actualizados} producto(s). ${sinDatos} sin datos en ClickUp, ${sinCoincidencia} sin coincidencia. Corre con --aplicar para guardarlo de verdad.`
  );
}

main();
