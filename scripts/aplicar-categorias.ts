// Guarda en Producto la categoría (taxonomía de Shopify, migración 0113) que se le asignó a cada producto por su foto y su
// nombre. Lee un JSON con `[{ id, categoria_id, revisar }]` (por defecto `datos-privados/categorias-ia.json`, que no se
// versiona). Nunca pisa una categoría puesta a mano (`categoria_origen = 'manual'`) y rechaza ids que no estén en la taxonomía.
//
//   npx tsx scripts/aplicar-categorias.ts [archivo.json]            → informe: cuántos pondría, cuántos por revisar
//   npx tsx scripts/aplicar-categorias.ts [archivo.json] --aplicar  → los guarda (origen «ia»)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const archivo = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "datos-privados/categorias-ia.json";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  type Fila = { id: string; categoria_id: string | null; revisar: boolean };
  const filas = JSON.parse(readFileSync(archivo, "utf8")) as Fila[];

  async function todas<T>(tabla: string, columnas: string): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await supabase.from(tabla).select(columnas).order("id").range(i, i + 999);
      if (error) throw error;
      out.push(...(data as T[]));
      if (data.length < 1000) return out;
    }
  }

  const taxonomia = new Set((await todas<{ id: string }>("categorias_productos", "id")).map((c) => c.id));
  if (!taxonomia.size) throw new Error("La taxonomía está vacía: corre antes scripts/cargar-taxonomia-shopify.ts --aplicar");
  const productos = new Map((await todas<{ id: string; categoria_origen: string | null }>("skus_maestros", "id, categoria_origen")).map((p) => [p.id, p]));

  const cambios: Fila[] = [];
  let manuales = 0, invalidas = 0, sinProducto = 0;
  for (const f of filas) {
    const p = productos.get(f.id);
    if (!p) { sinProducto++; continue; }
    if (p.categoria_origen === "manual") { manuales++; continue; }
    if (f.categoria_id && !taxonomia.has(f.categoria_id)) { invalidas++; console.log("Categoría que no existe:", f.id, f.categoria_id); continue; }
    cambios.push(f);
  }
  console.log(`${filas.length} en el archivo · ${cambios.length} se guardarían (${cambios.filter((c) => c.revisar || !c.categoria_id).length} por revisar, ${cambios.filter((c) => !c.categoria_id).length} sin categoría)`);
  console.log(`No se tocan: ${manuales} puestas a mano · ${invalidas} con categoría inexistente · ${sinProducto} productos que ya no existen`);
  if (!aplicar) return;

  let hechos = 0;
  for (let i = 0; i < cambios.length; i += 25) {
    await Promise.all(
      cambios.slice(i, i + 25).map(async (c) => {
        const { error } = await supabase
          .from("skus_maestros")
          .update({ categoria_id: c.categoria_id, categoria_origen: c.categoria_id ? "ia" : null, categoria_revisar: c.revisar || !c.categoria_id })
          .eq("id", c.id)
          .or("categoria_origen.is.null,categoria_origen.eq.ia");
        if (error) console.log("Error en", c.id, error.message);
        else hechos++;
      }),
    );
  }
  console.log(`Guardados: ${hechos}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
