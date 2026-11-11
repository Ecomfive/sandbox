// Rearma los clientes de Clientes y marketing (migración 0920) desde las órdenes de Ventas por tienda: normaliza los
// teléfonos, arma las llaves (HMAC con CLIENTES_LLAVE_SECRETO o, si no está, la clave de servicio) y las guarda.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/finanzas/recalcular-clientes.ts            # prueba: lee y resume, no escribe
//   npx tsx --env-file=.env.local scripts/finanzas/recalcular-clientes.ts --aplicar  # escribe
//
// Es seguro repetirlo: con las mismas órdenes deja lo mismo. Nunca imprime teléfonos, nombres ni llaves.

import { createClient } from "@supabase/supabase-js";
import { armarIdentidades, CALIDADES, ETIQUETA_CALIDAD, secretoLlaves } from "../../src/lib/clientes/identidad";
import { leerOrdenesIdentidad, recalcularClientes } from "../../src/lib/clientes/recalcular";

const APLICAR = process.argv.includes("--aplicar");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local).");
  process.exit(1);
}
const supabase = createClient(url, clave, { auth: { persistSession: false } });
const secreto = secretoLlaves();
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)} %` : "—");

async function main() {
  if (!APLICAR) {
    const ordenes = await leerOrdenesIdentidad(supabase);
    const { resumen } = armarIdentidades(ordenes, secreto);
    console.log(`Órdenes: ${resumen.ordenes}`);
    for (const c of CALIDADES) console.log(`  ${ETIQUETA_CALIDAD[c]}: ${resumen.porCalidad[c]} (${pct(resumen.porCalidad[c], resumen.ordenes)})`);
    console.log(`Teléfonos compartidos por muchos nombres: ${resumen.telefonosCompartidos} (${resumen.ordenesTelefonoCompartido} órdenes)`);
    console.log(`Clientes: ${resumen.clientes} (${resumen.clientesIdentificados} por teléfono o correo)`);
    console.log("Prueba en seco: no se escribió nada. Agrega --aplicar para guardar.");
    return;
  }
  const r = await recalcularClientes(supabase, secreto, (hechas, total) => process.stdout.write(`\rGuardando ${hechas}/${total}`));
  process.stdout.write("\n");
  const q = r.resumen.porCalidad;
  console.log(`Clientes: ${r.clientes} · órdenes vinculadas: ${r.ordenesVinculadas}`);
  console.log(`Órdenes sin teléfono válido: ${q.invalido + q.sospechoso + q.sin_dato} (${pct(q.invalido + q.sospechoso + q.sin_dato, r.resumen.ordenes)})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
