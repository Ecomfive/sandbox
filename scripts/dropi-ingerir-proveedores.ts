// Lee un archivo de proveedores competidores ya extraido (ver
// dropi-extraer-proveedores.ts) y lo guarda como snapshot del dia en
// Supabase: crea/actualiza el proveedor y registra su cantidad de
// productos para hoy.
//
// Uso: npx tsx scripts/dropi-ingerir-proveedores.ts <cr|pa> <archivo.json>

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const pais = process.argv[2];
const archivo = process.argv[3];

if (!["cr", "pa"].includes(pais ?? "") || !archivo) {
  console.error("Uso: npx tsx scripts/dropi-ingerir-proveedores.ts <cr|pa> <archivo.json>");
  process.exit(1);
}

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

interface ProveedorDropi {
  id: number;
  name: string;
  store_name: string | null;
  products_count: number;
  categories_name: string[];
  warehouses: { city: { name: string } }[];
}

async function main() {
  const proveedores: ProveedorDropi[] = JSON.parse(readFileSync(archivo, "utf8"));
  console.log(`Leidos ${proveedores.length} proveedores de ${archivo}`);

  const { data: paisRow } = await supabase.from("paises").select("id").eq("codigo", pais.toUpperCase()).single();
  if (!paisRow) throw new Error("Pais no encontrado.");
  const paisId = paisRow.id;

  const filas = proveedores.map((p) => ({
    pais_id: paisId,
    dropi_id: p.id,
    nombre: p.name,
    tienda: p.store_name,
    ciudad: p.warehouses?.[0]?.city?.name ?? null,
    categorias: p.categories_name ?? [],
  }));

  const { data: guardados, error: errProveedores } = await supabase
    .from("proveedores_competencia")
    .upsert(filas, { onConflict: "pais_id,dropi_id" })
    .select("id, dropi_id");
  if (errProveedores) throw new Error(`Error guardando proveedores: ${errProveedores.message}`);

  const idPorDropiId = new Map((guardados ?? []).map((g) => [g.dropi_id, g.id]));
  const hoy = new Date().toISOString().slice(0, 10);

  const snapshots = proveedores
    .filter((p) => idPorDropiId.has(p.id))
    .map((p) => ({
      proveedor_id: idPorDropiId.get(p.id),
      fecha: hoy,
      productos_count: p.products_count,
    }));

  const { error: errSnapshots } = await supabase
    .from("snapshots_proveedor_competencia")
    .upsert(snapshots, { onConflict: "proveedor_id,fecha" });
  if (errSnapshots) throw new Error(`Error guardando snapshots: ${errSnapshots.message}`);

  console.log(`Guardados/actualizados ${filas.length} proveedores y ${snapshots.length} snapshots del ${hoy}.`);
}

main();
