// Desempeño › Ventas Dropi y las ventas de cada publicación en Gestión de IDs Dropi, cada día (tarea programada
// «ventas-dropi-diario»): el navegador lee en app.dropi.pa, con la sesión de ECOMFIVE, el Historial de Existencia de todos
// los productos (`scripts/ventas-dropi-navegador.js`) y lo sube a una carpeta temporal del bucket privado `wms-compras`;
// este script le da las direcciones de subida y después baja las lecturas a datos-privados/ y las carga.
//
//   npx tsx scripts/ventas-dropi.ts subida   → imprime { resumen, movimientos }: dos direcciones firmadas de subida (2 horas)
//   npx tsx scripts/ventas-dropi.ts cargar   → baja la última lectura subida, borra los temporales y corre
//                                              `importar-ventas-dropi.ts --aplicar` (reemplaza la carga anterior de Panamá)
//   `subida cr` / `cargar cr` (28 oct 2026): lo mismo con Costa Rica (la función del navegador en app.dropi.cr); otra carpeta temporal
//   y otros archivos en datos-privados/ (…-cr.json), así nunca se cruzan con los de Panamá. Sin país, Panamá.

process.loadEnvFile(".env.local");
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "wms-compras";
const PAIS = process.argv[3] === "cr" ? "cr" : "pa";
const CARPETA = PAIS === "pa" ? "tmp-dropi" : `tmp-dropi-${PAIS}`;
const sufijo = PAIS === "pa" ? "" : `-${PAIS}`;

async function subida() {
  const sello = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const out: Record<string, string> = {};
  for (const tipo of ["resumen", "movimientos"]) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(`${CARPETA}/${sello}-${tipo}.json`, { upsert: true });
    if (error) throw new Error(`No se pudo preparar la subida: ${error.message}`);
    out[tipo] = data.signedUrl;
  }
  console.log(JSON.stringify(out));
}

async function cargar() {
  const { data: lista, error } = await supabase.storage.from(BUCKET).list(CARPETA, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error) throw new Error(error.message);
  const nombres = (lista ?? []).map((f) => f.name);
  const sello = nombres.find((n) => n.endsWith("-movimientos.json") && nombres.includes(n.replace("-movimientos", "-resumen")))?.replace("-movimientos.json", "");
  if (!sello) throw new Error("No hay ninguna lectura subida (falta correr la función del navegador o falló la subida).");
  for (const [tipo, destino] of [["resumen", `datos-privados/dropi-historial-resumen${sufijo}.json`], ["movimientos", `datos-privados/dropi-historial-movimientos${sufijo}.json`]]) {
    const { data, error: e } = await supabase.storage.from(BUCKET).download(`${CARPETA}/${sello}-${tipo}.json`);
    if (e || !data) throw new Error(`No se pudo bajar ${tipo}: ${e?.message}`);
    writeFileSync(destino, Buffer.from(await data.arrayBuffer()));
  }
  // Los temporales (también los de lecturas viejas que hayan quedado) se borran: el bucket no es para esto.
  const { error: eb } = await supabase.storage.from(BUCKET).remove(nombres.map((n) => `${CARPETA}/${n}`));
  if (eb) console.warn(`Aviso: no se borraron los temporales (${eb.message}).`);
  console.log(`Lectura ${sello} bajada a datos-privados/.`);
  const r = spawnSync(process.execPath, [require.resolve("tsx/cli"), join(__dirname, "importar-ventas-dropi.ts"), "--aplicar", ...(PAIS === "pa" ? [] : [`--pais=${PAIS}`])], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const orden = process.argv[2];
(orden === "subida" ? subida() : orden === "cargar" ? cargar() : Promise.reject(new Error("Uso: npx tsx scripts/ventas-dropi.ts subida [cr]|cargar [cr]"))).catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
