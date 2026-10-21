// Gestión de publicaciones Dropi › vincular los SKU (21 oct 2026). Calcula la huella de la foto de las publicaciones que no la
// tienen (migración 0117), sugiere el producto de Producto de cada publicación sin vincular (src/lib/publicaciones/vincular.ts) y,
// con --aplicar, vincula **solo las coincidencias exactas** (SKU o nombre idéntico; decisión de Hernán): las demás se confirman
// en el panel. Cada vínculo queda en la actividad de la publicación. Se puede repetir: no toca las ya vinculadas.
//
//   npx tsx scripts/vincular-skus-publicaciones.ts            → calcula huellas que falten e informa (no vincula)
//   npx tsx scripts/vincular-skus-publicaciones.ts --aplicar  → además vincula las exactas

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { sugerirSku, prepararContexto, ETIQUETA_SUGERENCIA, type TipoSugerencia } from "../src/lib/publicaciones/vincular";
import { traerTodasLasFilas } from "../src/lib/supabase/paginar";
import { huellaFoto } from "../src/lib/wms/huella-foto";

const aplicar = process.argv.includes("--aplicar");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Pub = { id: string; pais_id: string; nombre: string; dropi_id: string | null; foto_url: string | null; foto_huella: string | null; sku_maestro_id: string | null };

async function main() {
  const pubs = await traerTodasLasFilas<Pub>((d, h) => supabase.from("dropi_publicaciones").select("id, pais_id, nombre, dropi_id, foto_url, foto_huella, sku_maestro_id").order("id").range(d, h));

  // 1. Huellas de las fotos que faltan (la foto ya está en nuestro Storage).
  let huellas = 0;
  for (const p of pubs.filter((x) => x.foto_url && !x.foto_huella)) {
    try {
      const r = await fetch(p.foto_url!);
      const h = r.ok ? await huellaFoto(new Uint8Array(await r.arrayBuffer())) : null;
      if (h) {
        p.foto_huella = h;
        huellas++;
        const { error } = await supabase.from("dropi_publicaciones").update({ foto_huella: h }).eq("id", p.id);
        if (error) throw new Error(`Falta correr la migración 0117: ${error.message}`);
      }
    } catch (e) {
      if (String(e).includes("migración")) throw e;
    }
  }

  // 2. Sugerencias para las que no están vinculadas.
  const skus = await traerTodasLasFilas<{ id: string; codigo: string; nombre: string; tipo: string; foto_huella: string | null }>((d, h) =>
    supabase.from("skus_maestros").select("id, codigo, nombre, tipo, foto_huella").is("padre_id", null).order("id").range(d, h),
  );
  const comps = await traerTodasLasFilas<{ combo_id: string; componente_id: string; cantidad: number }>((d, h) =>
    supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").order("combo_id").order("componente_id").range(d, h),
  );
  const catalogo = await traerTodasLasFilas<{ pais_id: string; dropi_producto_id: number; sku: string | null; nombre: string }>((d, h) =>
    supabase.from("competencia_productos").select("pais_id, dropi_producto_id, sku, nombre").eq("es_nuestro", true).order("id").range(d, h),
  );
  const enDropi = new Map(catalogo.map((c) => [`${c.pais_id}:${c.dropi_producto_id}`, [c.sku, c.nombre].filter((x): x is string => !!x)]));
  const ctx = prepararContexto(
    skus.map((s) => ({ id: s.id, codigo: s.codigo, nombre: s.nombre, tipo: s.tipo, huella: s.foto_huella })),
    comps.map((c) => ({ comboId: c.combo_id, componenteId: c.componente_id, cantidad: c.cantidad })),
  );

  const cuenta: Record<TipoSugerencia, number> = { seguro: 0, sugerido: 0, varios: 0, falta_compuesto: 0, ninguno: 0 };
  const seguras: { pub: Pub; skuId: string }[] = [];
  for (const p of pubs.filter((x) => !x.sku_maestro_id)) {
    const textosDropi = (p.dropi_id ?? "").split(/[^0-9]+/).flatMap((id) => enDropi.get(`${p.pais_id}:${id}`) ?? []);
    const s = sugerirSku({ nombre: p.nombre, huella: p.foto_huella, textosDropi }, ctx);
    cuenta[s.tipo]++;
    if (s.tipo === "seguro" && s.skuId) seguras.push({ pub: p, skuId: s.skuId });
  }

  console.log(`Huellas calculadas: ${huellas}. Ya vinculadas: ${pubs.filter((x) => x.sku_maestro_id).length} de ${pubs.length}.`);
  console.log("Sin vincular:", Object.fromEntries(Object.entries(cuenta).map(([k, v]) => [ETIQUETA_SUGERENCIA[k as TipoSugerencia], v])));
  if (!aplicar) return console.log(`Con --aplicar se vincularían las ${seguras.length} exactas.`);

  const porId = new Map(skus.map((s) => [s.id, s]));
  for (const { pub, skuId } of seguras) {
    const { error } = await supabase.from("dropi_publicaciones").update({ sku_maestro_id: skuId, actualizado_en: new Date().toISOString() }).eq("id", pub.id).is("sku_maestro_id", null);
    if (error) throw new Error(`${pub.nombre}: ${error.message}`);
  }
  await supabase.from("historial_auditoria").insert(
    seguras.map(({ pub, skuId }) => ({
      usuario_id: null,
      usuario_nombre: "Vínculo automático",
      accion: "vincular_sku_publicacion",
      entidad: "dropi_publicaciones",
      entidad_id: pub.id,
      detalle: "Coincidencia exacta de SKU o nombre",
      antes: { Producto: "Sin vincular" },
      despues: { Producto: `${porId.get(skuId)?.codigo} · ${porId.get(skuId)?.nombre}` },
    })),
  );
  console.log(`Vinculadas: ${seguras.length} exactas.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
