// Lee un archivo de pedidos de Dropi ya extraído (ver dropi-extraer-ordenes.ts o dropi-diario.ts) y lo guarda con
// `ingerirPedidos` (src/lib/dropi-actualizar/ingerir-pedidos.ts, lo mismo que usa «Actualizar Dropi»).
//
// Uso: npx tsx scripts/dropi-ingerir-ordenes.ts <cr|pa|mx> <archivo.json>

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { ingerirPedidos, type PedidoDropi } from "../src/lib/dropi-actualizar/ingerir-pedidos";

const pais = process.argv[2];
const archivo = process.argv[3];
if (!["cr", "pa", "mx"].includes(pais ?? "") || !archivo) {
  console.error("Uso: npx tsx scripts/dropi-ingerir-ordenes.ts <cr|pa|mx> <archivo.json>");
  process.exit(1);
}

async function main() {
  const ordenes = JSON.parse(readFileSync(archivo, "utf8")) as PedidoDropi[];
  console.log(`Leídas ${ordenes.length} órdenes de ${archivo}`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const r = await ingerirPedidos(supabase, pais, ordenes, (t) => console.log(`Aviso: ${t}`));
  if (r.productosNuevos) console.log(`Creados ${r.productosNuevos} productos nuevos (lista interna de pedidos).`);
  console.log(`Normalizadas ${r.normalizados} órdenes.`);
  if (r.crm !== null) console.log(`Pedidos del CRM actualizados: ${r.crm}.`);
  if (r.copiasBorradas !== null) console.log(`Copias viejas de pedidos borradas de staging: ${r.copiasBorradas}.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
