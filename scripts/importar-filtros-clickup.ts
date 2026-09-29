// Importa a wms_filtro_productos (Panamá) los productos activos de la lista de ClickUp «Productos y
// Filtro 🇵🇦», a partir del manifiesto ya armado en .scratch-fotos/manifest.json (cada objeto trae los
// campos ya mapeados a nuestros valores + la URL directa de la foto en ClickUp). Sube cada foto al bucket
// wms-productos y crea el registro correspondiente.
//
// Por defecto NO escribe nada: solo dice qué haría y para cuántos productos. Para aplicar de verdad:
//
// Uso: npx tsx scripts/importar-filtros-clickup.ts [--aplicar]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const BUCKET = "wms-productos";
const PAIS_ID_PANAMA = "d558eb6f-601c-4f1d-84f0-10b6c0c491da";
const MANIFEST_PATH = ".scratch-fotos/manifest.json";

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

interface Registro {
  clickup_id: string;
  nombre: string;
  estado: string;
  prioridad: string;
  asignado_a: string | null;
  estado_registro: string;
  tipo_envio: string | null;
  qty_producto: number | null;
  precio_total: number | null;
  aprobacion_gestionada: boolean;
  comentarios: string | null;
  foto_url: string | null;
}

const urlPublica = (ruta: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta}`;

function extensionDeUrl(url: string): string {
  const limpia = url.split("?")[0];
  const punto = limpia.lastIndexOf(".");
  const ext = punto >= 0 ? limpia.slice(punto + 1).toLowerCase() : "jpg";
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : "jpg";
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

async function subirFoto(clickupId: string, fotoUrl: string): Promise<string | null> {
  const resp = await fetch(fotoUrl);
  if (!resp.ok) {
    console.log(`    ! No se pudo descargar la foto (HTTP ${resp.status}): ${fotoUrl}`);
    return null;
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const ext = extensionDeUrl(fotoUrl);
  const ruta = `filtros/${clickupId}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, buffer, { contentType: CONTENT_TYPES[ext] ?? "image/jpeg", upsert: true });
  if (error) {
    console.log(`    ! Error subiendo la foto de ${clickupId}: ${error.message}`);
    return null;
  }
  return urlPublica(ruta);
}

async function main() {
  const registros: Registro[] = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  console.log(`${registros.length} producto(s) en el manifiesto.`);

  const { data: existentes, error: errorExistentes } = await supabase
    .from("wms_filtro_productos")
    .select("nombre")
    .eq("pais_id", PAIS_ID_PANAMA);
  if (errorExistentes) throw new Error(`Error leyendo productos existentes: ${errorExistentes.message}`);
  const nombresExistentes = new Set((existentes ?? []).map((r) => r.nombre));

  let insertados = 0;
  let saltados = 0;
  let conFoto = 0;
  let sinFoto = 0;
  let errores = 0;

  for (const r of registros) {
    if (nombresExistentes.has(r.nombre)) {
      console.log(`  = "${r.nombre}" ya existe, se salta.`);
      saltados++;
      continue;
    }

    const precioUnitario =
      r.precio_total !== null && r.qty_producto ? Math.round((r.precio_total / r.qty_producto) * 100) / 100 : null;

    console.log(`  + "${r.nombre}" (${r.clickup_id}) — ${r.estado_registro}/${r.estado}, foto: ${r.foto_url ? "sí" : "NO"}`);

    if (!aplicar) {
      if (r.foto_url) conFoto++;
      else sinFoto++;
      continue;
    }

    let fotoUrlFinal: string | null = null;
    if (r.foto_url) {
      fotoUrlFinal = await subirFoto(r.clickup_id, r.foto_url);
      if (fotoUrlFinal) conFoto++;
      else sinFoto++;
    } else {
      sinFoto++;
    }

    const { error: errorInsert } = await supabase.from("wms_filtro_productos").insert({
      pais_id: PAIS_ID_PANAMA,
      nombre: r.nombre,
      foto_url: fotoUrlFinal,
      estado_registro: r.estado_registro,
      estado: r.estado,
      tipo_envio: r.tipo_envio,
      qty_producto: r.qty_producto,
      precio_total: r.precio_total,
      precio_unitario: precioUnitario,
      prioridad: r.prioridad,
      asignado_a: r.asignado_a,
      aprobacion_gestionada: r.aprobacion_gestionada,
      comentarios: r.comentarios,
    });
    if (errorInsert) {
      console.log(`    ! Error insertando "${r.nombre}": ${errorInsert.message}`);
      errores++;
      continue;
    }
    insertados++;
  }

  console.log(
    aplicar
      ? `Listo: ${insertados} insertado(s), ${saltados} saltado(s) (ya existían), ${errores} error(es). Con foto: ${conFoto}, sin foto: ${sinFoto}.`
      : `Modo de prueba (sin --aplicar): se insertarían ${registros.length - saltados} producto(s) (${saltados} ya existen y se saltarían). Con foto: ${conFoto}, sin foto: ${sinFoto}. Corre con --aplicar para guardarlo de verdad.`
  );
}

main();
