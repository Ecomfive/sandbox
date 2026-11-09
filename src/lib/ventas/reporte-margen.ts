import { celdaCsv } from "@/lib/tabla/csv";
import { comisionPasarela, margenOrden } from "./operacion";

/** Mejora 78: lo que cuesta cobrar con tarjeta (2,9 % + US$0,30, la tarifa de lista de Shopify Payments / Stripe). Yappy,
 * transferencia y efectivo no cobran comisión por orden aquí. Se cambia con `fin_config` «ventas_pasarela_tarjeta». */
export const PASARELA_TARJETA = { pct: 2.9, fijo: 0.3 };

export interface CostosCobro {
  pasarelaTarjeta: { pct: number; fijo: number };
  /** Lo que se le paga al mensajero propio por entrega cuando su repartidor no tiene tarifa propia; null = no se sabe. */
  mensajeroPorDefecto: number | null;
}

export interface OrdenParaMargen {
  numero: string;
  fecha: string;
  total: number;
  envio: number;
  costoEnvio: number;
  /** Costo por línea (costo_excel × cantidad); null si alguna línea no tiene costo. */
  costoMercancia: number | null;
  metodo?: string | null;
  /** La entregó un mensajero propio (no una transportadora, cuyo costo ya va en `costoEnvio`). */
  mensajeroPropio?: boolean;
  /** Tarifa por entrega de ese mensajero (su comisión en el Pipeline o su tarifa de Deliverys); null = la de por defecto. */
  tarifaMensajero?: number | null;
  /** La pasarela que configuró su tienda en el Pipeline (manda sobre la general). */
  pasarelaTienda?: { pct: number; fijo: number } | null;
}
export interface FilaMargen {
  numero: string;
  fecha: string;
  total: number;
  costoMercancia: number | null;
  costoEnvio: number;
  pasarela: number;
  mensajero: number;
  /** El costo del mensajero no se conoce (sin tarifa propia ni por defecto): el neto lo deja en 0. */
  mensajeroSinTarifa: boolean;
  neto: number | null;
  margenPct: number | null;
}

/** Margen por orden, de peor a mejor: mercancía, envío, pasarela (tarjeta) y mensajero propio. Sin costo de mercancía no se inventa un margen. */
export function reporteMargen(ordenes: OrdenParaMargen[], costos: CostosCobro = { pasarelaTarjeta: PASARELA_TARJETA, mensajeroPorDefecto: null }): FilaMargen[] {
  const filas = ordenes.map((o) => {
    const tarifaPas = o.pasarelaTienda ?? costos.pasarelaTarjeta;
    const pasarela = o.metodo === "tarjeta" ? Math.round(comisionPasarela(o.total, tarifaPas.pct, tarifaPas.fijo) * 100) / 100 : 0;
    const propio = !!o.mensajeroPropio && o.costoEnvio === 0;
    const tarifa = propio ? (o.tarifaMensajero ?? costos.mensajeroPorDefecto) : 0;
    const mensajero = Math.round((tarifa ?? 0) * 100) / 100;
    const comun = { numero: o.numero, fecha: o.fecha, total: o.total, costoEnvio: o.costoEnvio, pasarela, mensajero, mensajeroSinTarifa: propio && tarifa == null };
    if (o.costoMercancia == null) return { ...comun, costoMercancia: null, neto: null, margenPct: null };
    const m = margenOrden({
      total: o.total,
      costoMercancia: o.costoMercancia,
      envioCobrado: o.envio,
      costoEnvio: o.costoEnvio,
      comisionPasarela: pasarela,
      comisionMensajero: mensajero,
    });
    return { ...comun, costoMercancia: o.costoMercancia, neto: m.neto, margenPct: m.margenPct };
  });
  return filas.sort((a, b) => (a.neto ?? Infinity) - (b.neto ?? Infinity));
}

export function csvMargen(filas: FilaMargen[]): string {
  const n = (v: number | null) => (v == null ? "" : String(v));
  const lineas = [["Orden", "Fecha", "Total", "Costo mercancía", "Costo envío", "Pasarela", "Mensajero", "Neto", "Margen %", "Nota"].map(celdaCsv).join(",")];
  for (const f of filas) {
    const nota = f.mensajeroSinTarifa ? "Mensajero sin tarifa: no se restó" : "";
    lineas.push([f.numero, f.fecha, n(f.total), n(f.costoMercancia), n(f.costoEnvio), n(f.pasarela), n(f.mensajero), n(f.neto), n(f.margenPct), nota].map(celdaCsv).join(","));
  }
  return "﻿" + lineas.join("\r\n") + "\r\n";
}
