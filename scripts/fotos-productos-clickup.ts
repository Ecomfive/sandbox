// Pone a cada producto (skus_maestros) la foto de su tarea en la lista de ClickUp «Inventario 🇵🇦 Ecomfive Panamá»
// (campo «📸 Foto del Producto»), emparejando por nombre. Solo lee de ClickUp.
//
// Antes: bajar la lista a datos-privados/clickup-inventario-pa.json (tareas con sus adjuntos).
//   npx tsx scripts/fotos-productos-clickup.ts            → informe de coincidencias (no escribe nada)
//   npx tsx scripts/fotos-productos-clickup.ts --aplicar  → copia las fotos al bucket público `wms-productos` y las guarda
//
// Empareja: el mismo nombre (sin mayúsculas, acentos ni signos) o el nombre de ClickUp más el código de la compra
// («… - ECOM-0012»), y los pares confirmados a mano en CONFIRMADOS. No toca un producto que ya tenga foto. Requiere la
// migración 0086 (columna foto_url).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tokenClickup = (env.CLICKUP_TOKEN ?? "").replace(/^["']|["']$/g, "");

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** SKU del producto → nombre exacto de la tarea de ClickUp, revisados a mano (los nombres no son idénticos). */
const CONFIRMADOS: Record<string, string> = {
  "1054": "Crema Terapia Articular Bee Venom 100g - ECOM-0012",
  "1168": "Spray Bee Venom para Eliminar Verrugas - ECOM-0011",
  "1166": "Shilajit en Capsula (8 en 1) - ECOM-0017",
  "1158": "Banda de Ejercicio con Pedales Rosa",
};

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*-\s*(ecom\d*|pa)-\d+\s*$/i, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
const EXT = ["jpg", "jpeg", "png", "webp", "gif", "avif", "jfif"];
const TIPO: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };

function fotoDe(t: Json): Json | null {
  const campo = (t.custom_fields ?? []).find((f: Json) => /foto/i.test(String(f.name)) && f.type === "attachment");
  const deCampo = ((campo?.value as Json[] | undefined) ?? []).find((a) => EXT.includes(String(a.extension ?? "").toLowerCase()));
  return deCampo ?? (t.attachments ?? []).find((a: Json) => EXT.includes(String(a.extension ?? "").toLowerCase())) ?? null;
}

async function main() {
  const tareas: Json[] = JSON.parse(readFileSync("datos-privados/clickup-inventario-pa.json", "utf8"));
  const porNombre = new Map<string, Json>();
  const porNombreExacto = new Map<string, Json>();
  for (const t of tareas) {
    const foto = fotoDe(t);
    if (!foto) continue;
    porNombreExacto.set(String(t.name).trim(), { t, foto });
    if (!porNombre.has(normal(t.name))) porNombre.set(normal(t.name), { t, foto });
  }
  let { data: productos, error } = (await supabase.from("skus_maestros").select("id, codigo, nombre, foto_url").order("codigo")) as { data: Json[] | null; error: { message: string } | null };
  if (error && !aplicar) ({ data: productos, error } = (await supabase.from("skus_maestros").select("id, codigo, nombre").order("codigo")) as { data: Json[] | null; error: { message: string } | null });
  if (error) throw new Error(`${error.message} (¿falta la migración 0086?)`);

  const pares: { p: Json; t: Json; foto: Json }[] = [];
  const sinPar: string[] = [];
  for (const p of productos ?? []) {
    const m = CONFIRMADOS[p.codigo] ? porNombreExacto.get(CONFIRMADOS[p.codigo]) : porNombre.get(normal(p.nombre));
    if (m) pares.push({ p, t: m.t, foto: m.foto });
    else sinPar.push(`${p.codigo} · ${p.nombre}`);
  }
  console.log(`Productos: ${productos?.length}; con foto en ClickUp: ${pares.length}; sin pareja: ${sinPar.length}`);
  for (const s of sinPar) console.log(`  sin foto: ${s}`);
  if (!aplicar) return console.log("\n(Solo informe. Para copiar las fotos: --aplicar)");

  let ok = 0;
  let saltadas = 0;
  for (const { p, foto } of pares) {
    if (p.foto_url) {
      saltadas++;
      continue;
    }
    try {
      const r = await fetch(foto.url, { headers: { Authorization: tokenClickup } });
      if (!r.ok) throw new Error(`ClickUp ${r.status}`);
      const ext = String(foto.extension).toLowerCase() === "jfif" ? "jpg" : String(foto.extension).toLowerCase();
      const ruta = `productos/${p.id}.${ext}`;
      const subida = await supabase.storage.from("wms-productos").upload(ruta, Buffer.from(await r.arrayBuffer()), { upsert: true, contentType: TIPO[ext] ?? "image/jpeg" });
      if (subida.error) throw new Error(subida.error.message);
      const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wms-productos/${ruta}`;
      const { error: e } = await supabase.from("skus_maestros").update({ foto_url: url }).eq("id", p.id).is("foto_url", null);
      if (e) throw new Error(e.message);
      ok++;
    } catch (e) {
      console.error(`✗ ${p.codigo} ${p.nombre}: ${(e as Error).message}`);
    }
  }
  console.log(`\nFotos puestas: ${ok}; ya tenían foto: ${saltadas}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
