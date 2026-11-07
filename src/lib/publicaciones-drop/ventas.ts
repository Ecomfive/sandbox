/**
 * Las ventas de Drop para el cuadro de Inventario (7 nov 2026, pedido de Hernán: «el botón de actualizar así como en Panamá» para Costa Rica). La pestaña de
 * Drop, con la cuenta de proveedor, manda todos los pedidos con su estado, sus fechas y sus productos (extension/ecomfive-dropi/lectores/drop.js); aquí se
 * pasan a unidades por producto de Drop y día en `plataforma_ventas_diarias` (migración 0244, plataforma «drop»), lo mismo que Effi:
 * - **salidas**: lo de cada pedido despachado, el día en que se despachó (salió de la bodega de Drop). Un pedido cancelado o rechazado nunca se despachó.
 * - **devueltas**: lo de cada pedido «No entregado» (estado 8 de la paquetera), el día en que quedó así: vuelve a la bodega.
 * Los días son de Costa Rica. La lectura viene de una página de internet: nada se da por bueno sin revisarlo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PedidoLeidoDrop {
  id: string;
  numero: string | null;
  estado: string | null;
  creado: string | null;
  despachado: string | null;
  linea: { estado: string; en: string | null }[];
  productos: { id: string; variante: string | null; nombre: string; cantidad: number }[];
}

export interface LecturaVentasDrop {
  tipo: "drop-pedidos";
  pais: string;
  inicio: string;
  pedidos: unknown[];
}

export interface VentaDiaDrop {
  producto_id: string;
  dia: string;
  salidas: number;
  devueltas: number;
}

/** Estado de la paquetera para un paquete que no se entregó y vuelve. */
export const ESTADO_NO_ENTREGADO = "8";

const ID_DROP = /^[0-9a-f]{24}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}T/;

/** El día en Costa Rica (UTC−6, sin horario de verano) de una fecha ISO. */
export const diaCostaRica = (iso: string) => new Date(Date.parse(iso) - 6 * 3600_000).toISOString().slice(0, 10);

const fecha = (v: unknown): string | null => (typeof v === "string" && FECHA.test(v) && Number.isFinite(Date.parse(v)) ? v : null);

/** Revisa lo que mandó la pestaña: los pedidos con id y productos válidos (cantidades enteras de 1 a 1.000). */
export function pedidosDeLectura(crudos: unknown[]): PedidoLeidoDrop[] {
  const vistos = new Set<string>();
  const salida: PedidoLeidoDrop[] = [];
  for (const c of Array.isArray(crudos) ? crudos : []) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!ID_DROP.test(id) || vistos.has(id)) continue;
    vistos.add(id);
    const productos = (Array.isArray(o.productos) ? o.productos : []).flatMap((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      const cantidad = Number(x.cantidad);
      return typeof x.id === "string" && ID_DROP.test(x.id) && Number.isInteger(cantidad) && cantidad > 0 && cantidad <= 1000
        ? [{ id: x.id, variante: typeof x.variante === "string" && ID_DROP.test(x.variante) ? x.variante : null, nombre: String(x.nombre ?? "").slice(0, 200), cantidad }]
        : [];
    });
    const linea = (Array.isArray(o.linea) ? o.linea : []).flatMap((s) => {
      const x = (s ?? {}) as Record<string, unknown>;
      return typeof x.estado === "string" ? [{ estado: x.estado.slice(0, 40), en: fecha(x.en) }] : [];
    });
    salida.push({
      id,
      numero: typeof o.numero === "string" ? o.numero.slice(0, 40) : null,
      estado: typeof o.estado === "string" ? o.estado.slice(0, 40) : null,
      creado: fecha(o.creado),
      despachado: fecha(o.despachado),
      linea,
      productos,
    });
  }
  return salida;
}

/** Las unidades por producto de Drop y día: salidas el día del despacho, devueltas el día en que quedó «No entregado». */
export function ventasPorDiaDrop(pedidos: readonly PedidoLeidoDrop[]): VentaDiaDrop[] {
  const filas = new Map<string, VentaDiaDrop>();
  const sumar = (producto: string, dia: string, campo: "salidas" | "devueltas", n: number) => {
    const k = `${producto}|${dia}`;
    const f = filas.get(k) ?? { producto_id: producto, dia, salidas: 0, devueltas: 0 };
    f[campo] += n;
    filas.set(k, f);
  };
  for (const p of pedidos) {
    if (!p.despachado || p.estado === "cancelled" || p.estado === "rejected") continue;
    const diaSalida = diaCostaRica(p.despachado);
    // El último «No entregado» de la línea de tiempo (si el pedido sigue en ese estado).
    const noEntregado = p.estado === ESTADO_NO_ENTREGADO ? [...p.linea].reverse().find((s) => s.estado === ESTADO_NO_ENTREGADO && s.en)?.en ?? null : null;
    for (const x of p.productos) {
      sumar(x.id, diaSalida, "salidas", x.cantidad);
      if (noEntregado) sumar(x.id, diaCostaRica(noEntregado), "devueltas", x.cantidad);
    }
  }
  return [...filas.values()].sort((a, b) => a.dia.localeCompare(b.dia) || a.producto_id.localeCompare(b.producto_id));
}

function revisar<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
}

/**
 * Guarda las ventas de Drop de Costa Rica: reemplaza las filas de Drop desde el primer día que trajo la lectura (la lectura trae todos los pedidos, así que
 * cada vez queda igual a lo que dice Drop). Una lectura sin pedidos no borra nada.
 */
export async function guardarVentasDrop(
  supabase: SupabaseClient,
  l: LecturaVentasDrop,
  log: (t: string) => void = () => {},
): Promise<{ pedidos: number; desde: string; hasta: string; filas: number; sinProducto: number }> {
  const pais = revisar(await supabase.from("paises").select("id").eq("codigo", "CR").maybeSingle(), "País");
  if (!pais) throw new Error("Falta Costa Rica en Configuración › Países.");
  const pedidos = pedidosDeLectura(l?.pedidos ?? []);
  if (!pedidos.length) throw new Error("La lectura de Drop no trajo ningún pedido: no se tocó nada.");
  const filas = ventasPorDiaDrop(pedidos);
  if (!filas.length) throw new Error("Ningún pedido de Drop está despachado: no se tocó nada.");
  const desde = filas[0].dia;
  const hasta = filas.reduce((a, f) => (f.dia > a ? f.dia : a), desde);

  revisar(await supabase.from("plataforma_ventas_diarias").delete().eq("pais_id", pais.id).eq("plataforma", "drop").gte("dia", desde), "Borrar las ventas de Drop");
  const ahora = new Date().toISOString();
  const aGuardar = filas.map((f) => ({ pais_id: pais.id, plataforma: "drop", producto_id: f.producto_id, dia: f.dia, salidas: f.salidas, devueltas: f.devueltas, actualizado_en: ahora }));
  for (let i = 0; i < aGuardar.length; i += 500) revisar(await supabase.from("plataforma_ventas_diarias").insert(aGuardar.slice(i, i + 500)), "Guardar las ventas de Drop");

  // Los productos de Drop que no están en Gestión de IDs Drop no se pueden pasar a un producto en el cuadro: se avisa.
  const { data: pubs } = await supabase.from("drop_publicaciones").select("drop_id, sku_maestro_id").eq("pais_id", pais.id).limit(5000);
  const conProducto = new Set((pubs ?? []).filter((p) => p.sku_maestro_id).map((p) => p.drop_id as string));
  const sinProducto = new Set(filas.filter((f) => !conProducto.has(f.producto_id)).map((f) => f.producto_id));
  if (sinProducto.size) log(`${sinProducto.size} productos de Drop con ventas no están vinculados a un producto en Gestión de IDs Drop: el cuadro no los cuenta.`);
  return { pedidos: pedidos.length, desde, hasta, filas: filas.length, sinProducto: sinProducto.size };
}
