// Anuncios Meta › lo que está en marcha (25 nov 2026, pedido de Alcides: «mostrar información de un producto que no está activo es innecesario: enfócate en los que tienen campañas activas y deja ver el historial de los antiguos
// sin darle tanta importancia»). «En marcha» = al menos una campaña activa en Meta que gastó en los últimos 7 días (o montada hace muy poco). No se mira el inventario: una devolución suelta deja una unidad y el producto sigue «con stock».
// Lógica pura, con prueba.

import type { AnalisisHistorico, FilaTendencia, Hallazgo } from "./historico";
import { claveDeProducto } from "./nombre";

export interface EnMarcha {
  /** Las llaves (`claveDeProducto`) de los productos con alguna campaña en marcha. */
  productos: string[];
  /** Los nombres de las campañas en marcha. */
  campanas: string[];
}

/** Qué se ve en las listas: lo que está en marcha, lo apagado (para consultar cómo le fue) o todo. */
export type VistaActividad = "activos" | "apagados" | "todos";
/** `general`: no es de un producto ni de una campaña en particular (un ángulo, una métrica, todo el conjunto). */
export type EstadoActividad = "activo" | "apagado" | "general";

/** Días que una campaña recién montada se considera en marcha aunque todavía no haya gastado. */
export const DIAS_RECIEN_MONTADA = 3;

const dias = (desde: string, hasta: string) => Math.floor((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/** Si una campaña está en marcha: activa en Meta y con gasto en los últimos 7 días, o recién montada. */
export function campanaEnMarcha(c: { activa: boolean; gasto7: number; creadaEn?: string | null }, hoy: string): boolean {
  if (!c.activa) return false;
  return c.gasto7 > 0 || (!!c.creadaEn && dias(c.creadaEn.slice(0, 10), hoy) < DIAS_RECIEN_MONTADA);
}

export function calcularEnMarcha(campanas: readonly { nombre: string; producto: string | null; activa: boolean; gasto7: number; creadaEn?: string | null }[], hoy: string): EnMarcha {
  const productos = new Set<string>();
  const nombres = new Set<string>();
  for (const c of campanas) {
    if (!campanaEnMarcha(c, hoy)) continue;
    nombres.add(c.nombre);
    const clave = claveDeProducto(c.producto);
    if (clave) productos.add(clave);
  }
  return { productos: [...productos], campanas: [...nombres] };
}

/** Si no hay nada en marcha (o el dato no viene), no se recorta: sería dejar a la IA sin datos. */
export const hayAlgoEnMarcha = (e: EnMarcha | null | undefined): e is EnMarcha => !!e && (e.productos.length > 0 || e.campanas.length > 0);

export const productoEnMarcha = (e: EnMarcha, producto: string | null | undefined): boolean => e.productos.includes(claveDeProducto(producto));

const estado = (activo: boolean): EstadoActividad => (activo ? "activo" : "apagado");

/** De qué habla un hallazgo, según su llave: `entrega:<producto>:…`, `tendencia:Producto|Campaña:<nombre>:<ventana>`; lo demás es general. */
export function estadoDeHallazgo(h: Pick<Hallazgo, "id">, e: EnMarcha): EstadoActividad {
  const partes = h.id.split(":");
  if (partes[0] === "entrega") return estado(e.productos.includes(partes.slice(1, -1).join(":")));
  if (partes[0] === "tendencia") {
    // El nombre puede llevar «:»: va entre el nivel y la ventana.
    const nombre = partes.slice(2, -1).join(":");
    if (partes[1] === "Producto") return estado(productoEnMarcha(e, nombre));
    if (partes[1] === "Campaña") return estado(e.campanas.includes(nombre));
  }
  return "general";
}

export function estadoDeTendencia(f: Pick<FilaTendencia, "nivel" | "nombre">, e: EnMarcha): EstadoActividad {
  if (f.nivel === "Producto") return estado(productoEnMarcha(e, f.nombre));
  if (f.nivel === "Campaña") return estado(e.campanas.includes(f.nombre));
  return "general";
}

/** Lo general acompaña a lo activo; en «apagados» solo queda lo de productos y campañas apagados. */
export const enLaVista = (est: EstadoActividad, vista: VistaActividad): boolean => vista === "todos" || (vista === "activos" ? est !== "apagado" : est === "apagado");

export const hallazgosEnVista = <H extends Pick<Hallazgo, "id">>(lista: readonly H[], e: EnMarcha, vista: VistaActividad): H[] => lista.filter((h) => enLaVista(estadoDeHallazgo(h, e), vista));

/**
 * El análisis del historial recortado a lo que está en marcha: es lo que recibe la IA que interpreta, para que no recomiende sobre productos que ya no se anuncian. Los totales, las bandas y los rankings de ángulos, ganchos y formatos
 * se quedan con todo el historial (son aprendizaje). Si el análisis no sabe qué está en marcha (uno guardado antes) o no hay nada en marcha, se devuelve igual.
 */
export function soloEnMarcha(a: AnalisisHistorico): AnalisisHistorico {
  const e = a.enMarcha;
  if (!hayAlgoEnMarcha(e)) return a;
  return {
    ...a,
    hallazgos: hallazgosEnVista(a.hallazgos, e, "activos"),
    tendencias: a.tendencias.filter((t) => estadoDeTendencia(t, e) !== "apagado"),
    entrega: a.entrega.filter((f) => e.productos.includes(f.clave)),
    rankings: { ...a.rankings, productos: a.rankings.productos.filter((f) => productoEnMarcha(e, f.nombre)), campanas: a.rankings.campanas.filter((f) => e.campanas.includes(f.nombre)) },
    mesesPorProducto: a.mesesPorProducto.filter((p) => productoEnMarcha(e, p.nombre)),
  };
}
