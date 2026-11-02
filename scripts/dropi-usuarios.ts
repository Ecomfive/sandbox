// La lista de usuarios de Dropi de un país (id, nombre, apellido, correo, teléfono) para vincularlos con el CRM (3 nov 2026, pedido de
// Hernán). El navegador la lee con `scripts/dropi-usuarios-navegador.js` en app.dropi.<país> (sesión de proveedor) y la sube a una carpeta
// temporal del bucket privado `wms-compras`; este script da la dirección de subida y después la baja a datos-privados/ (ignorada por git:
// son datos de clientes) y borra el temporal.
//
//   npx tsx scripts/dropi-usuarios.ts subida cr   → imprime la dirección firmada de subida (2 horas)
//   npx tsx scripts/dropi-usuarios.ts cargar cr   → baja la última a datos-privados/dropi-usuarios-cr.json y borra el temporal
//
// Después: `npx tsx scripts/vincular-dropshippers-dropi.ts cr` (informe) y, aprobado, `… cr --aplicar`.

process.loadEnvFile(".env.local");
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "wms-compras";
const [orden, pais] = process.argv.slice(2);
if (!["subida", "cargar"].includes(orden ?? "") || !["cr", "mx", "pa"].includes(pais ?? "")) {
  console.error("Uso: npx tsx scripts/dropi-usuarios.ts subida|cargar cr|mx|pa");
  process.exit(1);
}
const CARPETA = `tmp-dropi-usuarios-${pais}`;

async function subida() {
  const sello = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(`${CARPETA}/${sello}.json`, { upsert: true });
  if (error) throw new Error(`No se pudo preparar la subida: ${error.message}`);
  console.log(data.signedUrl);
}

async function cargar() {
  const { data: lista, error } = await supabase.storage.from(BUCKET).list(CARPETA, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error) throw new Error(error.message);
  const nombres = (lista ?? []).map((f) => f.name).filter((n) => n.endsWith(".json"));
  if (!nombres.length) throw new Error("No hay ninguna lista subida (falta correr la función del navegador o falló la subida).");
  const { data, error: e } = await supabase.storage.from(BUCKET).download(`${CARPETA}/${nombres[0]}`);
  if (e || !data) throw new Error(`No se pudo bajar la lista: ${e?.message}`);
  const usuarios = JSON.parse(await data.text()) as unknown[];
  mkdirSync("datos-privados", { recursive: true });
  writeFileSync(`datos-privados/dropi-usuarios-${pais}.json`, JSON.stringify(usuarios, null, 1));
  await supabase.storage.from(BUCKET).remove(nombres.map((n) => `${CARPETA}/${n}`));
  console.log(`${usuarios.length} usuarios en datos-privados/dropi-usuarios-${pais}.json (temporal borrado).`);
}

(orden === "subida" ? subida() : cargar()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
