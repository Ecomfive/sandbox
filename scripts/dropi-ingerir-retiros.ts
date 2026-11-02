// Lee el archivo de retiros ya extraído (ver dropi-extraer-retiros.ts o dropi-diario.ts) y los concilia con `ingerirRetiros`
// (src/lib/dropi-actualizar/ingerir-retiros.ts, lo mismo que usa «Actualizar Dropi»): vincula cada retiro de Dropi al del equipo
// por su correlativo, deja aparte los que no se pueden vincular y actualiza el saldo de la billetera.
//
// Uso: npx tsx scripts/dropi-ingerir-retiros.ts <cr|pa|mx> <archivo.json>

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { ingerirRetiros, type FilaRetiro } from "../src/lib/dropi-actualizar/ingerir-retiros";

const pais = process.argv[2];
const archivo = process.argv[3];
if (!["cr", "pa", "mx"].includes(pais ?? "") || !archivo) {
  console.error("Uso: npx tsx scripts/dropi-ingerir-retiros.ts <cr|pa|mx> <archivo.json>");
  process.exit(1);
}

async function main() {
  const filas = JSON.parse(readFileSync(archivo, "utf8")) as FilaRetiro[];
  console.log(`Leídos ${filas.length} retiros de ${archivo}`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const r = await ingerirRetiros(supabase, pais, filas, (t) => console.log(`  ${t}`));
  console.log(`Vinculados ahora: ${r.vinculadosAhora}. Ya vinculados (actualizados): ${r.actualizados}. Sin vincular: ${r.sinVincular}.`);
  if (r.saldo !== null) console.log(`Saldo de wallet actualizado: ${r.saldo}.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
