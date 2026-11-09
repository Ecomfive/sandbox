/**
 * Guarda lo leído de Dunamixfy (migración 0264; 9 nov 2026, pedido de Hernán). Lo llama «Actualizar datos» con los archivos que subió la extensión (lector
 * `dunamixfy_cr`) o el receptor local (scripts/scraping-proveedores.ts, `tipo: "dunamixfy"`). Solo escribe en el sistema: Dunamixfy no se toca.
 * - `guardarProductosDunamixfy`: una fila por producto en `dunamixfy_publicaciones`; lo que ya no aparece queda con `en_dunamixfy = false` (no se borra). **No vincula**
 *   el producto de Producto: deja la sugerencia (la publicación de Dropi, Effi o Drop del país con el mismo nombre, o `sugerirSku` por nombre y foto).
 * - `guardarPedidosDunamixfy`: las ventas por producto y día en `plataforma_ventas_diarias` (plataforma «dunamixfy») y los dropshippers en `dunamixfy_vendedores`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { prepararContexto, sugerirSku, type Sugerencia } from "@/lib/publicaciones/vincular";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { huellaFoto } from "@/lib/wms/huella-foto";
import {
  nombreComparable,
  pedidosDeLectura,
  productosDeLectura,
  vendedoresDePedidos,
  ventasPorDiaDunamixfy,
  type LecturaPedidosDunamixfy,
  type LecturaProductosDunamixfy,
  type ProductoLeidoDunamixfy,
} from "./lectura";

/** Dunamixfy solo está en Costa Rica (por ahora: tiene sitios en otros países, pero ECOMFIVE vende allí solo en Costa Rica). */
export const PAIS_DE_DUNAMIXFY = "CR";

function revisar<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
}

/** Las fotos de Dunamixfy están en Cloudflare R2; el servidor solo baja de ahí (la dirección viene de una página de internet). */
const FOTO_PERMITIDA = /^https:\/\/pub-[a-f0-9]{16,64}\.r2\.dev\//;

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

async function paisDunamixfy(supabase: SupabaseClient) {
  const pais = revisar(await supabase.from("paises").select("id, nombre").eq("codigo", PAIS_DE_DUNAMIXFY).maybeSingle(), "País");
  if (!pais) throw new Error("Falta Costa Rica en Configuración › Países.");
  return pais as { id: string; nombre: string };
}

export interface ResumenProductosDunamixfy {
  productos: number;
  nuevos: number;
  yaNoEstan: number;
  vinculados: number;
  sugeridos: number;
}

export async function guardarProductosDunamixfy(supabase: SupabaseClient, l: LecturaProductosDunamixfy): Promise<ResumenProductosDunamixfy> {
  const pais = await paisDunamixfy(supabase);
  const vistos = productosDeLectura(l?.productos ?? []).filter((p) => !p.borrado);
  // Una lectura vacía (sesión vencida, otra cuenta) no marca todo como «ya no está en Dunamixfy».
  if (!vistos.length) throw new Error("La lectura de Dunamixfy no trajo ningún producto: no se tocó nada.");

  const antes = await traerTodasLasFilas<{ id: string; dunamixfy_id: string; sku_maestro_id: string | null; foto_url: string | null; foto_huella: string | null; en_dunamixfy: boolean }>((d, h) =>
    supabase.from("dunamixfy_publicaciones").select("id, dunamixfy_id, sku_maestro_id, foto_url, foto_huella, en_dunamixfy").eq("pais_id", pais.id).order("id").range(d, h),
  );
  const porId = new Map(antes.map((a) => [a.dunamixfy_id, a]));

  const huellas = new Map<string, string | null>();
  for (const v of vistos) {
    const a = porId.get(v.dunamixfyId);
    huellas.set(v.dunamixfyId, a && a.foto_url === v.fotoUrl && a.foto_huella ? a.foto_huella : await huellaDeFoto(v.fotoUrl));
  }

  // Sugerencias para los que no están vinculados: primero el mismo nombre en una publicación ya vinculada de Dropi, Effi o Drop del país; si no, nombre y foto contra Producto.
  const sinVincular = vistos.filter((v) => !porId.get(v.dunamixfyId)?.sku_maestro_id);
  const sugerencias = new Map<string, Sugerencia>();
  if (sinVincular.length) {
    const nombresVinculados = new Map<string, Set<string>>();
    for (const tabla of ["dropi_publicaciones", "effi_publicaciones", "drop_publicaciones"]) {
      const filas = await traerTodasLasFilas<{ nombre: string; sku_maestro_id: string | null }>((d, h) =>
        supabase.from(tabla).select("nombre, sku_maestro_id").eq("pais_id", pais.id).not("sku_maestro_id", "is", null).order("id").range(d, h),
      ).catch(() => []);
      for (const p of filas) {
        const k = nombreComparable(p.nombre);
        if (k && p.sku_maestro_id) nombresVinculados.set(k, (nombresVinculados.get(k) ?? new Set()).add(p.sku_maestro_id));
      }
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
      const mismos = [...(nombresVinculados.get(nombreComparable(v.nombre)) ?? [])];
      sugerencias.set(
        v.dunamixfyId,
        mismos.length === 1
          ? { tipo: "seguro", skuId: mismos[0], metodo: "nombre", parecido: 1, alternativas: [], pack: null }
          : sugerirSku({ nombre: v.nombre, huella: huellas.get(v.dunamixfyId) ?? null, textosDropi: v.sku ? [v.sku] : [] }, ctx),
      );
    }
  }

  const ahora = new Date().toISOString();
  const fila = (v: ProductoLeidoDunamixfy) => {
    const s = sugerencias.get(v.dunamixfyId);
    return {
      pais_id: pais.id,
      dunamixfy_id: v.dunamixfyId,
      interno: v.interno,
      nombre: v.nombre,
      sku_dunamixfy: v.sku,
      categoria: v.categoria,
      precio: v.precio,
      precio_sugerido: v.precioSugerido,
      stock: v.stock,
      reservado: v.reservado,
      activo: v.activo,
      privado: v.privado,
      foto_url: v.fotoUrl,
      foto_huella: huellas.get(v.dunamixfyId) ?? null,
      creado_en_dunamixfy: v.creado,
      en_dunamixfy: true,
      sugerido_sku_id: s?.skuId ?? null,
      sugerencia: s ? s.tipo : null,
      ultima_vez: ahora,
      actualizado_en: ahora,
    };
  };
  const filas = vistos.map(fila);
  for (let i = 0; i < filas.length; i += 200)
    revisar(await supabase.from("dunamixfy_publicaciones").upsert(filas.slice(i, i + 200), { onConflict: "pais_id,dunamixfy_id" }), "Guardar los productos de Dunamixfy");

  const vistosIds = new Set(vistos.map((v) => v.dunamixfyId));
  const yaNoEstan = antes.filter((a) => a.en_dunamixfy && !vistosIds.has(a.dunamixfy_id));
  if (yaNoEstan.length)
    revisar(await supabase.from("dunamixfy_publicaciones").update({ en_dunamixfy: false, actualizado_en: ahora }).in("id", yaNoEstan.map((a) => a.id)), "Marcar los que ya no están en Dunamixfy");

  return {
    productos: vistos.length,
    nuevos: vistos.filter((v) => !porId.has(v.dunamixfyId)).length,
    yaNoEstan: yaNoEstan.length,
    vinculados: vistos.length - sinVincular.length,
    sugeridos: [...sugerencias.values()].filter((s) => s.skuId).length,
  };
}

export interface ResumenPedidosDunamixfy {
  pedidos: number;
  desde: string;
  hasta: string;
  filas: number;
  vendedores: number;
  sinProducto: number;
}

/**
 * Las ventas de Dunamixfy: reemplaza las filas de Dunamixfy desde el primer día que trajo la lectura (trae todos los pedidos, así que cada vez queda igual a lo que
 * dice Dunamixfy) y pone al día los dropshippers. Una lectura sin pedidos no borra nada.
 */
export async function guardarPedidosDunamixfy(supabase: SupabaseClient, l: LecturaPedidosDunamixfy, log: (t: string) => void = () => {}): Promise<ResumenPedidosDunamixfy> {
  const pais = await paisDunamixfy(supabase);
  const pedidos = pedidosDeLectura(l?.pedidos ?? []);
  if (!pedidos.length) throw new Error("La lectura de Dunamixfy no trajo ningún pedido: no se tocó nada.");
  const filas = ventasPorDiaDunamixfy(pedidos);
  if (!filas.length) throw new Error("Ningún pedido de Dunamixfy está despachado: no se tocó nada.");
  const desde = filas[0].dia;
  const hasta = filas.reduce((a, f) => (f.dia > a ? f.dia : a), desde);

  revisar(await supabase.from("plataforma_ventas_diarias").delete().eq("pais_id", pais.id).eq("plataforma", "dunamixfy").gte("dia", desde), "Borrar las ventas de Dunamixfy");
  const ahora = new Date().toISOString();
  const aGuardar = filas.map((f) => ({ pais_id: pais.id, plataforma: "dunamixfy", producto_id: f.producto_id, dia: f.dia, salidas: f.salidas, devueltas: f.devueltas, actualizado_en: ahora }));
  for (let i = 0; i < aGuardar.length; i += 500) revisar(await supabase.from("plataforma_ventas_diarias").insert(aGuardar.slice(i, i + 500)), "Guardar las ventas de Dunamixfy");

  const vendedores = vendedoresDePedidos(pedidos).map((v) => ({
    pais_id: pais.id,
    vendedor_id: v.vendedorId,
    nombre: v.nombre,
    tienda: v.tienda,
    pedidos: v.pedidos,
    entregados: v.entregados,
    devueltos: v.devueltos,
    primer_pedido: v.primerPedido,
    ultimo_pedido: v.ultimoPedido,
    actualizado_en: ahora,
  }));
  for (let i = 0; i < vendedores.length; i += 200) revisar(await supabase.from("dunamixfy_vendedores").upsert(vendedores.slice(i, i + 200), { onConflict: "pais_id,vendedor_id" }), "Guardar los dropshippers de Dunamixfy");

  // Los productos con ventas que no están vinculados en Gestión de IDs Dunamixfy no se pueden pasar a un producto en el cuadro: se avisa.
  const { data: pubs } = await supabase.from("dunamixfy_publicaciones").select("dunamixfy_id, sku_maestro_id").eq("pais_id", pais.id).limit(5000);
  const conProducto = new Set((pubs ?? []).filter((p) => p.sku_maestro_id).map((p) => p.dunamixfy_id as string));
  const sinProducto = new Set(filas.filter((f) => !conProducto.has(f.producto_id)).map((f) => f.producto_id));
  if (sinProducto.size) log(`${sinProducto.size} productos de Dunamixfy con ventas no están vinculados a un producto en Gestión de IDs Dunamixfy: el cuadro no los cuenta.`);
  return { pedidos: pedidos.length, desde, hasta, filas: filas.length, vendedores: vendedores.length, sinProducto: sinProducto.size };
}
