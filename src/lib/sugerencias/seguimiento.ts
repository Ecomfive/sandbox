/**
 * El seguimiento de un producto que un cliente nos recomendó (pedido de Alcides, 16 oct 2026): las etapas por las que pasó, con
 * su fecha y los días desde la recomendación, para contárselo al cliente. **Sin cantidades ni costos.** Lógica pura (sin base
 * de datos): recibe lo ya leído de la sugerencia, su fila de Selección, su test y su compra, y arma la línea de tiempo.
 */

export type EstadoEtapa = "hecha" | "actual" | "pendiente" | "fallo";

export interface Etapa {
  clave: string;
  etiqueta: string;
  /** ISO; null si todavía no llegó (o no se sabe cuándo). */
  fecha: string | null;
  estado: EstadoEtapa;
}

export interface DatosRecorrido {
  /** Cuándo nos lo recomendó. */
  recomendado: string;
  sugerencia: { estado: string; actualizadoEn: string };
  seleccion: { estado: string; creadoEn: string; enOfertaEn: string | null } | null;
  test: { estado: string; creadoEn: string; resultadoEn: string | null } | null;
  /** La compra de su producto y las fechas en que entró a cada etapa (de `wms_compra_eventos`). */
  compra: { etapa: string; anulada: boolean; etapas: Record<string, string> } | null;
}

export interface Seguimiento {
  etapas: Etapa[];
  /** La etapa en que está ahora (la última hecha, o la que falló). */
  actual: string;
  /** Días desde la recomendación hasta hoy, o hasta que terminó (llegó o se descartó). */
  dias: number;
  terminado: boolean;
  winner: boolean;
  comprado: boolean;
}

const GANADORES = ["winner", "enviado_a_compras"];
const FALLIDOS = ["fallido", "descartado"];

/** Las etapas de la compra que se le cuentan al cliente, en orden (sin cotizaciones ni montos). */
const ETAPAS_COMPRA_CLIENTE: { clave: string; etiqueta: string; etapas: string[] }[] = [
  { clave: "cotizando", etiqueta: "Cotizando con el proveedor", etapas: ["cotizar", "cotizado"] },
  { clave: "produccion", etiqueta: "En producción", etapas: ["produccion"] },
  { clave: "camino", etiqueta: "En camino", etapas: ["tracking"] },
  { clave: "llego", etiqueta: "Llegó a bodega", etapas: ["arribo_mercancia"] },
  { clave: "completado", etiqueta: "Disponible para vender", etapas: ["completado"] },
];

export function diasEntreFechas(desde: string, hasta: string): number {
  const ms = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Arma la línea de tiempo de una recomendación. `hoy` es la fecha de referencia (ISO). */
export function armarSeguimiento(d: DatosRecorrido, hoy: string): Seguimiento {
  const etapas: Etapa[] = [{ clave: "recomendado", etiqueta: "Recomendado", fecha: d.recomendado, estado: "hecha" }];
  const terminar = (fecha: string, extra: Partial<Seguimiento> = {}): Seguimiento => {
    const ultima = etapas.filter((e) => e.estado !== "pendiente").at(-1)!;
    return { etapas, actual: ultima.clave, dias: diasEntreFechas(d.recomendado, fecha), terminado: true, winner: false, comprado: false, ...extra };
  };
  const pendientes = (desde: number) => {
    const todas = [
      { clave: "seleccionado", etiqueta: "Seleccionado" },
      { clave: "oferta", etiqueta: "Preparando la oferta" },
      { clave: "test", etiqueta: "En test" },
      { clave: "resultado", etiqueta: "Resultado del test" },
      ...ETAPAS_COMPRA_CLIENTE.map((e) => ({ clave: e.clave, etiqueta: e.etiqueta })),
    ];
    for (const e of todas.slice(desde)) etapas.push({ ...e, fecha: null, estado: "pendiente" });
  };

  // 1. Selección.
  if (d.sugerencia.estado === "descartado") {
    etapas.push({ clave: "descartado", etiqueta: "No se seleccionó", fecha: d.sugerencia.actualizadoEn, estado: "fallo" });
    return terminar(d.sugerencia.actualizadoEn);
  }
  if (!d.seleccion) {
    pendientes(0);
    return abierto(etapas, d, hoy);
  }
  etapas.push({ clave: "seleccionado", etiqueta: "Seleccionado", fecha: d.seleccion.creadoEn, estado: "hecha" });
  if (d.seleccion.estado === "descartado" && !d.test) {
    etapas.push({ clave: "descartado", etiqueta: "No pasó la selección", fecha: d.seleccion.creadoEn, estado: "fallo" });
    return terminar(d.seleccion.creadoEn);
  }

  // 2. Oferta y test.
  const enOferta = d.seleccion.enOfertaEn ?? (d.test ? d.test.creadoEn : null);
  if (!enOferta) {
    pendientes(1);
    return abierto(etapas, d, hoy);
  }
  etapas.push({ clave: "oferta", etiqueta: "Preparando la oferta", fecha: enOferta, estado: "hecha" });
  if (!d.test) {
    pendientes(2);
    return abierto(etapas, d, hoy);
  }
  etapas.push({ clave: "test", etiqueta: "En test", fecha: d.test.creadoEn, estado: "hecha" });
  const winner = GANADORES.includes(d.test.estado);
  if (FALLIDOS.includes(d.test.estado)) {
    const fecha = d.test.resultadoEn ?? d.test.creadoEn;
    etapas.push({ clave: "resultado", etiqueta: "No pasó el test", fecha, estado: "fallo" });
    return terminar(fecha);
  }
  if (!winner) {
    pendientes(3);
    return abierto(etapas, d, hoy);
  }
  etapas.push({ clave: "resultado", etiqueta: "Winner", fecha: d.test.resultadoEn, estado: "hecha" });

  // 3. Compra (de cotizar a disponible).
  if (!d.compra) {
    pendientes(4);
    return abierto(etapas, d, hoy, { winner: true });
  }
  if (d.compra.anulada || d.compra.etapa === "descartado") {
    const fecha = d.compra.etapas.descartado ?? hoy;
    etapas.push({ clave: "compra", etiqueta: "No se compró", fecha, estado: "fallo" });
    return terminar(fecha, { winner: true });
  }
  const indiceActual = ETAPAS_COMPRA_CLIENTE.findIndex((e) => e.etapas.includes(d.compra!.etapa));
  ETAPAS_COMPRA_CLIENTE.forEach((e, i) => {
    const fecha = e.etapas.map((x) => d.compra!.etapas[x]).find(Boolean) ?? null;
    etapas.push({ clave: e.clave, etiqueta: e.etiqueta, fecha: i <= indiceActual ? fecha : null, estado: i <= indiceActual ? "hecha" : "pendiente" });
  });
  if (d.compra.etapa === "completado") {
    const fecha = d.compra.etapas.completado ?? hoy;
    return terminar(fecha, { winner: true, comprado: true });
  }
  return abierto(etapas, d, hoy, { winner: true, comprado: true });
}

/** Un recorrido que sigue: la etapa actual es la última hecha y los días corren hasta hoy. */
function abierto(etapas: Etapa[], d: DatosRecorrido, hoy: string, extra: Partial<Seguimiento> = {}): Seguimiento {
  const hechas = etapas.filter((e) => e.estado === "hecha");
  const ultima = hechas.at(-1)!;
  ultima.estado = "actual";
  return { etapas, actual: ultima.clave, dias: diasEntreFechas(d.recomendado, hoy), terminado: false, winner: false, comprado: false, ...extra };
}

/** El % de acierto de un cliente: de lo que recomendó, cuánto salió Winner en el test. */
export function aciertoCliente(seguimientos: Seguimiento[]): { recomendados: number; winners: number; comprados: number; pct: number | null } {
  const recomendados = seguimientos.length;
  const winners = seguimientos.filter((s) => s.winner).length;
  const comprados = seguimientos.filter((s) => s.comprado).length;
  return { recomendados, winners, comprados, pct: recomendados ? Math.round((winners / recomendados) * 100) : null };
}

/** Los plazos de exclusividad que se pueden elegir (días); 30 por defecto. */
export const PLAZOS_EXCLUSIVIDAD = [30, 60, 90] as const;

export interface Exclusividad {
  dias: number;
  /** «pendiente»: todavía no está disponible para vender (no ha empezado); «vigente»; «vencida»; «no_aplica»: no se compró. */
  estado: "pendiente" | "vigente" | "vencida" | "no_aplica";
  desde: string | null;
  hasta: string | null;
  /** Días que le quedan (solo vigente). */
  quedan: number | null;
}

const sumarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * La exclusividad del cliente sobre lo que recomendó: corre `dias` desde que el producto quedó disponible para vender (la etapa
 * «completado» del recorrido). Si el recorrido terminó sin compra (no se seleccionó, no pasó el test, no se compró), no aplica.
 */
export function exclusividadDe(seguimiento: Seguimiento, dias: number, hoy: string): Exclusividad {
  const disponible = seguimiento.etapas.find((e) => e.clave === "completado" && e.estado !== "pendiente")?.fecha ?? null;
  if (!disponible) return { dias, estado: seguimiento.terminado ? "no_aplica" : "pendiente", desde: null, hasta: null, quedan: null };
  const desde = disponible.slice(0, 10);
  const hasta = sumarDias(desde, dias);
  const quedan = diasEntreFechas(hoy, hasta);
  return hoy.slice(0, 10) <= hasta ? { dias, estado: "vigente", desde, hasta, quedan } : { dias, estado: "vencida", desde, hasta, quedan: null };
}

/** Cómo se cuenta la exclusividad en pantalla (fechas como dd/mm/aaaa). */
export function textoExclusividad(e: Exclusividad, fecha: (iso: string) => string): string {
  if (e.estado === "pendiente") return `${e.dias} días · empieza cuando esté disponible para vender`;
  if (e.estado === "no_aplica") return "No aplica: no llegó a venderse";
  if (e.estado === "vencida") return `Vencida el ${fecha(e.hasta!)} (${e.dias} días)`;
  return `Vigente hasta el ${fecha(e.hasta!)} · ${e.quedan === 1 ? "queda 1 día" : `quedan ${e.quedan} días`}`;
}
