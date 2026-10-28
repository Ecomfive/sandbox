// Lee el archivo de historial de cartera ya extraído (ver dropi-extraer-cartera.ts o dropi-diario.ts) y lo guarda con
// `ingerirCartera` (src/lib/dropi-actualizar/ingerir-cartera.ts, lo mismo que usa «Actualizar Dropi»).
//
// Uso: npx tsx scripts/dropi-ingerir-cartera.ts <cr|pa|mx> <archivo.json>

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { ingerirCartera, type FilaCartera } from "../src/lib/dropi-actualizar/ingerir-cartera";

const pais = process.argv[2];
const archivo = process.argv[3];
if (!["cr", "pa", "mx"].includes(pais ?? "") || !archivo) {
  console.error("Uso: npx tsx scripts/dropi-ingerir-cartera.ts <cr|pa|mx> <archivo.json>");
  process.exit(1);
}

async function main() {
  const filas = JSON.parse(readFileSync(archivo, "utf8")) as FilaCartera[];
  console.log(`Leídas ${filas.length} transacciones de ${archivo}`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const r = await ingerirCartera(supabase, pais, filas);
  console.log(`Guardadas/actualizadas ${r.movimientos} transacciones de cartera.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
