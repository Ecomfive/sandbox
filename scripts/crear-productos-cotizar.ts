// Crea los productos de las órdenes de compra en «02 - Cotizar» que todavía no tienen producto (pedido de Hernán, 8 oct 2026)
// y los vincula a su orden con la Cantidad total (sin costo: aún no hay precio). Quedan fuera las reposiciones (el producto ya
// existe), las que tenían duda de reposición, las que ya tienen producto vinculado y las que pueden tener variantes (color,
// talla, capacidad o tamaño). La lista de órdenes está escrita a mano abajo (la revisó Hernán).
//
// Cada producto: simple, Activo («fisico»), SKU sugerido con «/» (sugerirSku, el primero libre), código de barras interno,
// vencimiento activado si es cápsula, gomita, crema, sérum, líquido o parche, y la foto real de la orden como foto del catálogo
// (copiada a `productos/<id>/` del bucket público; si la orden no tiene foto, la primera imagen adjunta de la orden).
//
//   npx tsx scripts/crear-productos-cotizar.ts            → informe
//   npx tsx scripts/crear-productos-cotizar.ts --aplicar  → crea, pone foto y vincula

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { primeroLibre, sugerirSku } from "../src/lib/wms/sugerir-sku";
import { detectarImagen } from "../src/lib/seguridad/imagen";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PUBLICO = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wms-productos/`;

// Un producto por grupo; el primer código da el nombre. Los grupos de varios códigos son el mismo producto en varios países.
const PA = (n: number) => `ECOM01-${String(n).padStart(4, "0")}`;
const rango = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => [PA(a + i)]);
const GRUPOS: string[][] = [
  ...rango(450, 456),
  [PA(458)],
  [PA(460)],
  ...rango(471, 474),
  [PA(477)],
  [PA(490)],
  ["ECOM02-0082"],
  ...rango(498, 501),
  [PA(504)],
  [PA(505), "ECOM03-0278"],
  [PA(507), "ECOM03-0281", "ECOM02-0086"],
  [PA(510), "ECOM03-0284", "ECOM02-0089"],
  ...rango(514, 529),
  [PA(531)],
  [PA(532)],
  ...rango(534, 549),
  ...rango(551, 561),
  ...rango(563, 569),
];
// Cápsulas, gomitas, cremas, sérums, líquidos, sprays y parches: manejan vencimiento.
const CON_VENCIMIENTO = new Set([
  ...[450, 451, 452, 455, 458, 460, 490, 504, 505, 507, 510, 517, 526, 535, 538, 542, 546, 551, 555, 556, 557, 558, 559, 560, 561, 563, 564, 567, 568].map(PA),
  "ECOM02-0082",
]);

// Donde la regla de la sugerencia toma una palabra que no identifica («PCS», «PACK») o pierde una letra («H-TEN»).
const SKU_A_MANO: Record<string, string> = { [PA(474)]: "CORTADORA/VERDURAS/RALLADORA", [PA(477)]: "GANCHO/ADHESIVO/ONDAS", [PA(567)]: "HTEN/VITAL/BOOST" };

/** El nombre del producto: el de la orden sin «Lote #1, 2000», sin el código ni la promoción («2x1», «Promoción 3x1»). */
const limpiarNombre = (t: string) =>
  t
    .replace(/"[^"]*Lote[^"]*"/gi, "")
    .replace(/-?\s*ECOM\d+-\d+/g, "")
    .replace(/\bPromoci[oó]n\b/gi, "")
    .replace(/\b\d+\s*x\s*1\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[\s\-–]+$/, "")
    .trim();

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function fotoDe(compra: Json): Promise<{ bytes: Uint8Array; tipo: string; extension: string } | null> {
  const bajar = async (bucket: string, ruta: string) => {
    const { data } = await supabase.storage.from(bucket).download(ruta);
    if (!data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const img = detectarImagen(bytes.slice(0, 64));
    return img ? { bytes, tipo: img.tipo, extension: img.extension } : null;
  };
  if (compra.foto_url?.startsWith(PUBLICO)) {
    const f = await bajar("wms-productos", compra.foto_url.slice(PUBLICO.length));
    if (f) return f;
  }
  const { data: adj } = await supabase
    .from("wms_compra_adjuntos")
    .select("ruta, origen, creado_en")
    .eq("compra_id", compra.id)
    .eq("clase", "foto")
    .not("ruta", "is", null)
    .order("creado_en");
  const orden = [...(adj ?? []).filter((a) => a.origen === "campo_foto"), ...(adj ?? []).filter((a) => a.origen !== "campo_foto")];
  for (const a of orden) {
    const f = await bajar("wms-compras", a.ruta as string);
    if (f) return f;
  }
  return null;
}

(async () => {
  const codigos = GRUPOS.flat();
  const { data: compras, error } = await supabase
    .from("wms_compras")
    .select("id, codigo, nombre, etapa, tipo, qty_total, foto_url, wms_compra_items(id)")
    .in("codigo", codigos);
  if (error) throw error;
  const porCodigo = new Map((compras ?? []).map((c) => [c.codigo as string, c as Json]));

  const existentes = new Set<string>();
  for (let i = 0; ; i += 1000) {
    const { data } = await supabase.from("skus_maestros").select("codigo").range(i, i + 999);
    for (const p of data ?? []) existentes.add(String(p.codigo).trim().toLowerCase());
    if ((data ?? []).length < 1000) break;
  }

  const plan: { nombre: string; sku: string; vence: boolean; ordenes: Json[] }[] = [];
  const avisos: string[] = [];
  for (const grupo of GRUPOS) {
    const ordenes = grupo.map((c) => porCodigo.get(c)).filter((c): c is Json => !!c);
    const faltan = grupo.filter((c) => !porCodigo.has(c));
    if (faltan.length) avisos.push(`No encontré ${faltan.join(", ")}.`);
    const validas = ordenes.filter((o) => {
      if (o.etapa !== "cotizar") avisos.push(`${o.codigo} ya no está en Cotizar (${o.etapa}): no se vincula.`);
      else if (o.wms_compra_items.length) avisos.push(`${o.codigo} ya tiene producto: no se vincula.`);
      else if (!o.qty_total) avisos.push(`${o.codigo} no tiene Cantidad total: no se vincula.`);
      return o.etapa === "cotizar" && !o.wms_compra_items.length && o.qty_total && o.tipo === "pais";
    });
    if (!validas.length) continue;
    const nombre = limpiarNombre(String(validas[0].nombre));
    const sku = primeroLibre(SKU_A_MANO[validas[0].codigo] ?? (sugerirSku(nombre) || "PRODUCTO"), (c) => existentes.has(c.toLowerCase()));
    existentes.add(sku.toLowerCase());
    plan.push({ nombre, sku, vence: grupo.some((c) => CON_VENCIMIENTO.has(c)), ordenes: validas });
  }

  for (const p of plan) console.log(`${p.vence ? "⏳" : "  "} ${p.sku.padEnd(32)} ${p.nombre.slice(0, 60).padEnd(60)} ← ${p.ordenes.map((o) => `${o.codigo} (${o.qty_total})`).join(", ")}`);
  for (const a of avisos) console.log("⚠ " + a);
  console.log(`\n${plan.length} productos (${plan.filter((p) => p.vence).length} con vencimiento), ${plan.reduce((s, p) => s + p.ordenes.length, 0)} órdenes.`);
  if (!aplicar) return console.log("Sin --aplicar no se creó nada.");

  let conFoto = 0;
  const base = Date.now();
  let i = 0;
  for (const p of plan) {
    const { data: prod, error: e } = await supabase
      .from("skus_maestros")
      .insert({ codigo: p.sku, nombre: p.nombre, tipo: "simple", clase: "fisico", estado: "aprobado", ...(p.vence ? { maneja_vencimiento: true, dias_aviso_vencimiento: 60 } : {}) })
      .select("id, numero")
      .single();
    if (e || !prod) throw new Error(`${p.sku}: ${e?.message}`);
    await supabase.rpc("wms_asignar_codigo_barras_interno", { p_sku: prod.id });

    for (const o of p.ordenes) {
      const foto = await fotoDe(o);
      if (!foto) continue;
      const ruta = `productos/${prod.id}/${Date.now()}-orden.${foto.extension}`;
      const { error: ef } = await supabase.storage.from("wms-productos").upload(ruta, foto.bytes, { contentType: foto.tipo });
      if (!ef) {
        await supabase.from("skus_maestros").update({ foto_url: PUBLICO + ruta }).eq("id", prod.id);
        conFoto++;
      }
      break;
    }

    await supabase.from("historial_auditoria").insert({
      usuario_nombre: "Carga desde Cotizar",
      accion: "crear_producto",
      entidad: "skus_maestros",
      entidad_id: prod.id,
      detalle: `${p.sku} · ${p.nombre} · desde ${p.ordenes.map((o) => o.codigo).join(", ")}`,
    });

    for (const o of p.ordenes) {
      const { error: el } = await supabase.rpc("wms_agregar_item_compra", { p_compra: o.id, p_sku: prod.id, p_cantidad: o.qty_total, p_costo: null, p_lote: null, p_origen: "sistema", p_usuario: null });
      if (el) throw new Error(`${o.codigo}: ${el.message}`);
      await supabase.from("wms_compras").update({ qty_total: o.qty_total, actualizado_en: new Date().toISOString() }).eq("id", o.id);
      await supabase.from("wms_compra_eventos").insert({
        compra_id: o.id,
        campo: "productoAgregado",
        valor_despues: `${p.sku} · ${p.nombre} · ${Number(o.qty_total).toLocaleString("es-PA")} u.`,
        ocurrido_en: new Date(base + i++).toISOString(),
        autor: "Carga desde Cotizar",
        origen: "sistema",
      });
    }
    console.log(`✓ ${p.sku} (#${prod.numero})`);
  }
  console.log(`\nCreados ${plan.length} productos, ${conFoto} con foto; vinculadas ${plan.reduce((s, p) => s + p.ordenes.length, 0)} órdenes.`);
})();
