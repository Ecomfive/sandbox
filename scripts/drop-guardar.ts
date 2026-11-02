// Gestión de IDs Drop › guarda la lectura de «Mis productos» de Drop (pedido de Hernán, 3 nov 2026; migración 0221). La manda la pestaña de Drop con la
// sesión del proveedor (scripts/scraping-proveedores-navegador.js › leerDrop) al receptor (scripts/scraping-proveedores.ts recibir), que llama aquí con
// una lectura `tipo: "drop"`. Una fila por producto de Drop en `drop_publicaciones`: precio, inventario, estado, foto. Lo que ya no aparece queda con
// `en_drop = false` (no se borra nada). **No vincula** el producto de Producto (se confirma a mano en la lista): solo deja la sugerencia de cada
// publicación sin vincular: la publicación de Dropi del mismo país con el mismo nombre y su producto, o `sugerirSku` (nombre y foto).

import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreComparable, publicacionesDeLectura, type PublicacionLeidaDrop } from "../src/lib/publicaciones-drop/lectura";
import { prepararContexto, sugerirSku, type Sugerencia } from "../src/lib/publicaciones/vincular";
import { traerTodasLasFilas } from "../src/lib/supabase/paginar";
import { huellaFoto } from "../src/lib/wms/huella-foto";

export interface LecturaDrop {
  tipo: "drop";
  pais: string;
  inicio: string;
  duracionMs: number;
  paginas: number[];
  /** Las filas de «Mis productos» como las manda la pestaña (`FilaLeidaDrop`); se revisan aquí. */
  productos: unknown[];
}

function revisar<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
}

/** Las fotos de Drop están en Google Cloud Storage; el servidor solo baja de ahí (la dirección viene de una página de internet). */
const FOTO_PERMITIDA = /^https:\/\/storage\.googleapis\.com\//;

async function huellaDeFoto(url: string | null): Promise<string | null> {
  if (!url || !FOTO_PERMITIDA.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    return bytes.length && bytes.length < 15_000_000 ? await huellaFoto(bytes) : null;
  } catch {
    return null;
  }
}

export async function guardarDrop(supabase: SupabaseClient, l: LecturaDrop) {
  const t0 = Date.now();
  const codigoPais = typeof l.pais === "string" && /^[a-z]{2}$/.test(l.pais) ? l.pais.toUpperCase() : "CR";
  const pais = revisar(await supabase.from("paises").select("id, nombre").eq("codigo", codigoPais).maybeSingle(), "País");
  if (!pais) throw new Error(`El país ${codigoPais} no está en Configuración › Países.`);
  const vistos = publicacionesDeLectura(l.productos);
  // Una lectura vacía (sesión vencida, página cambiada) no marca todo como «ya no está en Drop».
  if (!vistos.length) throw new Error("La lectura de Drop no trajo ningún producto: no se tocó nada.");

  const antes = await traerTodasLasFilas<{ id: string; drop_id: string; sku_maestro_id: string | null; foto_url: string | null; foto_huella: string | null; en_drop: boolean }>((d, h) =>
    supabase.from("drop_publicaciones").select("id, drop_id, sku_maestro_id, foto_url, foto_huella, en_drop").eq("pais_id", pais.id).order("id").range(d, h),
  );
  const porDropId = new Map(antes.map((a) => [a.drop_id, a]));

  // La huella de cada foto nueva o cambiada (para sugerir el producto por la foto).
  const huellas = new Map<string, string | null>();
  for (const v of vistos) {
    const a = porDropId.get(v.dropId);
    huellas.set(v.dropId, a && a.foto_url === v.fotoUrl && a.foto_huella ? a.foto_huella : await huellaDeFoto(v.fotoUrl));
  }

  // Sugerencias para las que no están vinculadas: primero la publicación de Dropi del país con el mismo nombre (ya vinculada a su producto); si no, el
  // nombre y la foto contra Producto, con las reglas de Gestión de IDs Dropi.
  const sinVincular = vistos.filter((v) => !porDropId.get(v.dropId)?.sku_maestro_id);
  const sugerencias = new Map<string, Sugerencia>();
  if (sinVincular.length) {
    const dropi = await traerTodasLasFilas<{ nombre: string; sku_maestro_id: string | null }>((d, h) =>
      supabase.from("dropi_publicaciones").select("nombre, sku_maestro_id").eq("pais_id", pais.id).not("sku_maestro_id", "is", null).order("id").range(d, h),
    );
    const porNombreDropi = new Map<string, Set<string>>();
    for (const p of dropi) {
      const k = nombreComparable(p.nombre);
      if (k && p.sku_maestro_id) porNombreDropi.set(k, (porNombreDropi.get(k) ?? new Set()).add(p.sku_maestro_id));
    }
    const skus = await traerTodasLasFilas<{ id: string; codigo: string; nombre: string; tipo: string; foto_huella: string | null }>((d, h) =>
      supabase.from("skus_maestros").select("id, codigo, nombre, tipo, foto_huella").is("padre_id", null).order("id").range(d, h),
    );
    const comps = await traerTodasLasFilas<{ combo_id: string; componente_id: string; cantidad: number }>((d, h) =>
      supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").order("combo_id").order("componente_id").range(d, h),
    );
    const ctx = prepararContexto(
      skus.map((s) => ({ id: s.id, codigo: s.codigo, nombre: s.nombre, tipo: s.tipo, huella: s.foto_huella })),
      comps.map((c) => ({ comboId: c.combo_id, componenteId: c.componente_id, cantidad: c.cantidad })),
    );
    for (const v of sinVincular) {
      const enDropi = [...new Set([v.nombre, v.skuDrop ?? ""].map(nombreComparable).flatMap((k) => [...(porNombreDropi.get(k) ?? [])]))];
      sugerencias.set(
        v.dropId,
        enDropi.length === 1
          ? { tipo: "seguro", skuId: enDropi[0], metodo: "nombre", parecido: 1, alternativas: [], pack: null }
          : sugerirSku({ nombre: v.nombre, huella: huellas.get(v.dropId) ?? null, textosDropi: v.skuDrop ? [v.skuDrop] : [] }, ctx),
      );
    }
  }

  const ahora = new Date().toISOString();
  const fila = (v: PublicacionLeidaDrop) => {
    const s = sugerencias.get(v.dropId);
    return {
      pais_id: pais.id,
      drop_id: v.dropId,
      codigo: v.codigo,
      nombre: v.nombre,
      sku_drop: v.skuDrop,
      estado: v.estado,
      precio: v.precio,
      inventario: v.inventario,
      foto_url: v.fotoUrl,
      foto_huella: huellas.get(v.dropId) ?? null,
      creado_en_drop: v.creadoEnDrop,
      en_drop: true,
      sugerido_sku_id: s?.skuId ?? null,
      sugerencia: s ? s.tipo : null,
      ultima_vez: ahora,
      actualizado_en: ahora,
    };
  };
  const filas = vistos.map(fila);
  for (let i = 0; i < filas.length; i += 200) revisar(await supabase.from("drop_publicaciones").upsert(filas.slice(i, i + 200), { onConflict: "pais_id,drop_id" }), "Guardar publicaciones de Drop");

  // Lo que ya no aparece en Drop: no se borra, queda fuera de la lista.
  const vistosIds = new Set(vistos.map((v) => v.dropId));
  const yaNoEstan = antes.filter((a) => a.en_drop && !vistosIds.has(a.drop_id));
  if (yaNoEstan.length)
    revisar(await supabase.from("drop_publicaciones").update({ en_drop: false, actualizado_en: ahora }).in("id", yaNoEstan.map((a) => a.id)), "Marcar las que ya no están en Drop");

  const cuenta = (t: Sugerencia["tipo"]) => [...sugerencias.values()].filter((s) => s.tipo === t).length;
  return {
    pais: pais.nombre,
    productos: vistos.length,
    nuevos: vistos.filter((v) => !porDropId.has(v.dropId)).length,
    yaNoEstan: yaNoEstan.length,
    vinculados: vistos.length - sinVincular.length,
    sugerencias: { exactas: cuenta("seguro"), sugeridas: cuenta("sugerido"), varias: cuenta("varios"), faltaCompuesto: cuenta("falta_compuesto"), ninguna: cuenta("ninguno") },
    conHuella: [...huellas.values()].filter(Boolean).length,
    duracionMs: Date.now() - t0,
  };
}
