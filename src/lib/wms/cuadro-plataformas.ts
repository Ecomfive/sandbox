/**
 * El cuadro de diferencias por plataforma (6 nov 2026, pedido de Hernán: «me tiene que cuadrar como un cuadro»; flujograma de Costa Rica): por producto, lo que había en el
 * corte + lo que entró con remisión − lo que salió a otra plataforma − lo vendido − las bajas = lo que debería haber, contra lo que dice la plataforma en su última lectura. Lógica pura, con prueba.
 */

import { ESTADOS_QUE_RESTAN, type EstadoNovedad } from "./novedades";
import type { Plataforma } from "./stock-plataformas";

/** El código de la bodega externa de cada plataforma. Drop es la bodega «Drop (Boxfull)». */
export const BODEGA_DE_PLATAFORMA: Record<Plataforma, string> = { dropi: "dropi", effi: "effi", drop: "boxfull" };

/** De las tres se conocen las ventas por producto y día: Dropi, Effi (migración 0244, por su API) y Drop (7 nov 2026, con «Actualizar datos» de Costa Rica). */
export const CON_VENTAS: Record<Plataforma, boolean> = { dropi: true, effi: true, drop: true };

export interface RemisionCuadro {
  sku: string;
  estado: string;
  enviada: number;
  recibida: number | null;
}

export interface VentaDia {
  sku: string;
  pedidas: number;
  canceladas: number;
  rechazadas: number;
  devueltas: number;
}

/** Un dañado o una devolución ya resueltos (migración 0243). */
export interface NovedadCuadro {
  sku: string;
  estado: string;
  cantidad: number;
}

export interface FilaCuadro {
  sku: string;
  corte: number;
  /** Lo que llegó según las remisiones recibidas. */
  entro: number;
  /** Lo que salió a otra plataforma con remisión: cuenta desde que se envía. */
  salio: number;
  /** Lo remitido que todavía no se confirma: no cuenta en lo que debería haber. */
  enCamino: number;
  /** Vendido neto: lo pedido menos lo cancelado, rechazado o devuelto. */
  vendido: number;
  /** Bajas por dañado y devoluciones dañadas: ya no están para la venta. */
  bajas: number;
  /** En reclamo por posible robo: no se resta, sigue siendo una diferencia por aclarar. */
  reclamo: number;
  deberia: number;
  dice: number;
  diferencia: number;
}

/** Lo que salió de verdad: un pedido cancelado, rechazado o devuelto vuelve a la bodega. */
export const ventaNeta = (v: Pick<VentaDia, "pedidas" | "canceladas" | "rechazadas" | "devueltas">) => v.pedidas - v.canceladas - v.rechazadas - v.devueltas;

/** Una remisión cuenta desde el día siguiente al corte, y las ventas igual: lo de ese día ya está dentro del corte. */
export const diaSiguiente = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Arma una fila por producto, con cualquiera de los datos: un producto sin corte cuenta desde cero. Lo que no se movió y está en cero no sale. Lo que más difiere va primero. */
export function armarCuadro(entrada: { cortes: Map<string, number>; remisiones: RemisionCuadro[]; salidas?: RemisionCuadro[]; ventas: VentaDia[]; novedades?: NovedadCuadro[]; dice: Map<string, number> }): FilaCuadro[] {
  const filas = new Map<string, FilaCuadro>();
  const fila = (sku: string) => {
    const f = filas.get(sku) ?? { sku, corte: 0, entro: 0, salio: 0, enCamino: 0, vendido: 0, bajas: 0, reclamo: 0, deberia: 0, dice: 0, diferencia: 0 };
    filas.set(sku, f);
    return f;
  };
  for (const [sku, n] of entrada.cortes) fila(sku).corte += n;
  for (const r of entrada.remisiones) {
    if (r.estado === "recibido") fila(r.sku).entro += r.recibida ?? 0;
    else if (r.estado === "en_camino") fila(r.sku).enCamino += r.enviada;
  }
  for (const r of entrada.salidas ?? []) if (r.estado !== "anulado") fila(r.sku).salio += r.enviada;
  for (const v of entrada.ventas) fila(v.sku).vendido += ventaNeta(v);
  for (const n of entrada.novedades ?? []) {
    if (ESTADOS_QUE_RESTAN.includes(n.estado as EstadoNovedad)) fila(n.sku).bajas += n.cantidad;
    else if (n.estado === "reclamo") fila(n.sku).reclamo += n.cantidad;
  }
  for (const [sku, n] of entrada.dice) fila(sku).dice += n;
  return [...filas.values()]
    .map((f) => {
      const deberia = f.corte + f.entro - f.salio - f.vendido - f.bajas;
      return { ...f, deberia, diferencia: f.dice - deberia };
    })
    .filter((f) => f.corte || f.entro || f.salio || f.enCamino || f.vendido || f.bajas || f.reclamo || f.dice)
    .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
}

/** Lo que dice el tablero del cuadro. `sobran` y `faltan` son unidades. */
export function resumenCuadro(filas: readonly FilaCuadro[]): { cuadran: number; conDiferencia: number; sobran: number; faltan: number } {
  return filas.reduce(
    (r, f) => ({
      cuadran: r.cuadran + (f.diferencia === 0 ? 1 : 0),
      conDiferencia: r.conDiferencia + (f.diferencia !== 0 ? 1 : 0),
      sobran: r.sobran + Math.max(f.diferencia, 0),
      faltan: r.faltan + Math.max(-f.diferencia, 0),
    }),
    { cuadran: 0, conDiferencia: 0, sobran: 0, faltan: 0 },
  );
}
