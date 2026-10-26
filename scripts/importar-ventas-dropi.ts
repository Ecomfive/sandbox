// Desempeño › Ventas Dropi: carga a la base (migraciones 0120 y 0122) el Historial de Existencia de Dropi que se bajó a
// datos-privados/dropi-historial-movimientos.json y dropi-historial-resumen.json, con `ingerirVentas`
// (src/lib/dropi-actualizar/ingerir-ventas.ts, lo mismo que usa «Actualizar Dropi»). Cada día lo corre
// `scripts/ventas-dropi.ts cargar` (tarea «ventas-dropi-diario»), después de bajar la lectura del navegador.
//
//   npx tsx scripts/importar-ventas-dropi.ts            → informe (no escribe)
//   npx tsx scripts/importar-ventas-dropi.ts --aplicar  → carga

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { armarVentas, ingerirVentas, type MovimientosDropi, type ResumenDropi } from "../src/lib/dropi-actualizar/ingerir-ventas";

const aplicar = process.argv.includes("--aplicar");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const M = JSON.parse(readFileSync("datos-privados/dropi-historial-movimientos.json", "utf8")) as MovimientosDropi;
const R = JSON.parse(readFileSync("datos-privados/dropi-historial-resumen.json", "utf8")) as ResumenDropi;

async function main() {
  const v = armarVentas(M, R, "informe");
  console.log(`Corte ${v.corteFecha}: ${v.productos.length} productos, ${v.movimientos} movimientos, ${v.diarias.length} filas por día, ${v.dropshippers.length} dropshippers (${v.porMes.length} filas por producto y mes), ${v.netasTotal} unidades netas.`);
  if (!aplicar) return console.log("Con --aplicar se cargan (reemplazan lo de estos productos; los que ya no vienen conservan su historia).");
  await ingerirVentas(supabase, M, R, (t) => console.log(t));
  console.log("Cargado.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
