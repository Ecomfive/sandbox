import { ETAPAS_COMPRA, type FilaCompra } from "./def-compras";

/**
 * Cálculos del informe y de «Tiempos y fallas» de Compras. Todo es puro (sin base ni pantalla): recibe las compras ya
 * cargadas y devuelve números, para poder probarlo y reutilizarlo.
 */

export type Granularidad = "dia" | "semana" | "mes";

const DIA = 86_400_000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const ETAPAS_CERRADAS = ["completado", "descartado"];
export const estaAbierta = (c: Pick<FilaCompra, "etapa">) => !ETAPAS_CERRADAS.includes(c.etapa);

/** Días entre dos fechas (AAAA-MM-DD o ISO); null si falta alguna o si la segunda es anterior por error de carga. */
export function diasEntre(desde: string | null, hasta: string | null): number | null {
  if (!desde || !hasta) return null;
  const d = (Date.parse(hasta.slice(0, 10)) - Date.parse(desde.slice(0, 10))) / DIA;
  return Number.isFinite(d) && d >= 0 ? Math.round(d) : null;
}

/** Hoy (día de Panamá) como AAAA-MM-DD. */
export const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** Mediana, percentil 90 y cantidad de una lista de días. */
export function resumenDias(valores: number[]): { n: number; mediana: number | null; p90: number | null; max: number | null } {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return { n: 0, mediana: null, p90: null, max: null };
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { n: v.length, mediana: q(0.5), p90: q(0.9), max: v[v.length - 1] };
}

// --- Periodos -----------------------------------------------------------------------------------------------------

/** La clave del periodo de una fecha: «2026-09-14» (día), el lunes de su semana o «2026-09» (mes). */
export function clavePeriodo(fecha: string, g: Granularidad): string {
  const d = fecha.slice(0, 10);
  if (g === "dia") return d;
  if (g === "mes") return d.slice(0, 7);
  const t = new Date(`${d}T00:00:00Z`);
  const lunes = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * DIA);
  return lunes.toISOString().slice(0, 10);
}

/** El último día de un periodo, para saber si está en curso. */
export function finDe(clave: string, g: Granularidad): string {
  if (g === "dia") return clave;
  if (g === "semana") return new Date(Date.parse(`${clave}T00:00:00Z`) + 6 * DIA).toISOString().slice(0, 10);
  const [a, m] = clave.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

export function etiquetaPeriodo(clave: string, g: Granularidad): string {
  if (g === "mes") {
    const [a, m] = clave.split("-").map(Number);
    return `${MESES_LARGOS[m - 1][0].toUpperCase()}${MESES_LARGOS[m - 1].slice(1)} ${a}`;
  }
  const [a, m, d] = clave.split("-").map(Number);
  if (g === "dia") return `${d} ${MESES[m - 1]} ${a}`;
  const fin = finDe(clave, g).split("-").map(Number);
  return `${d} ${MESES[m - 1]} – ${fin[2]} ${MESES[fin[1] - 1]} ${fin[0]}`;
}

export function etiquetaCorta(clave: string, g: Granularidad): string {
  const partes = clave.split("-").map(Number);
  if (g === "mes") return MESES[partes[1] - 1];
  return `${partes[2]} ${MESES[partes[1] - 1]}`;
}

/** Todos los periodos desde la primera compra hasta hoy (también los vacíos), con las compras creadas en cada uno. */
export function periodos(compras: FilaCompra[], g: Granularidad): { clave: string; creadas: FilaCompra[] }[] {
  if (!compras.length) return [];
  const mapa = new Map<string, FilaCompra[]>();
  for (const c of compras) {
    const k = clavePeriodo(c.creadoEn, g);
    mapa.set(k, [...(mapa.get(k) ?? []), c]);
  }
  const primera = [...mapa.keys()].sort()[0];
  const ultima = clavePeriodo(hoy(), g);
  const salida: { clave: string; creadas: FilaCompra[] }[] = [];
  let k = primera;
  for (let i = 0; i < 2000 && k <= ultima; i++) {
    salida.push({ clave: k, creadas: mapa.get(k) ?? [] });
    const siguiente = new Date(Date.parse(`${finDe(k, g)}T00:00:00Z`) + DIA).toISOString().slice(0, 10);
    k = clavePeriodo(siguiente, g);
  }
  return salida;
}

const enPeriodo = (fecha: string | null, clave: string, g: Granularidad) => !!fecha && clavePeriodo(fecha, g) === clave;

/** Los números de un periodo: lo que se creó, pagó, envió, llegó y cerró dentro de él. */
export function estadisticasPeriodo(compras: FilaCompra[], clave: string, g: Granularidad) {
  const creadas = compras.filter((c) => enPeriodo(c.creadoEn, clave, g));
  const pagadas = compras.filter((c) => enPeriodo(c.fechaPago1, clave, g));
  const llegadas = compras.filter((c) => enPeriodo(c.fechaLlegada, clave, g));
  const cerradas = compras.filter((c) => c.etapa === "completado" && enPeriodo(c.cerradoEn, clave, g));
  return {
    creadas: creadas.length,
    pagado: pagadas.reduce((s, c) => s + (c.pagadoAProveedor ?? 0), 0),
    pagadas: pagadas.length,
    unidades: creadas.reduce((s, c) => s + (c.qtyTotal ?? 0), 0),
    enviadas: compras.filter((c) => enPeriodo(c.fechaEnvio, clave, g)).length,
    llegadas: llegadas.length,
    cerradas: cerradas.length,
    ciclo: resumenDias(cerradas.map((c) => diasEntre(c.creadoEn, c.cerradoEn)).filter((d): d is number => d !== null)),
  };
}

// --- Estado de hoy ------------------------------------------------------------------------------------------------

/** Cuántos días tarda normalmente una vía (el 90 % de los envíos llega antes): lo que pase de ahí está atrasado. */
export function umbralesTransito(compras: FilaCompra[]): Record<string, number> {
  const umbral: Record<string, number> = {};
  for (const via of ["mar", "aire", "tierra"]) {
    const r = resumenDias(transitos(compras, via));
    umbral[via] = r.n >= 5 && r.p90 !== null ? r.p90 : via === "aire" ? 30 : 90;
  }
  return umbral;
}

/** Días en tránsito (envío → llegada) de las compras que llegaron por una vía. */
export function transitos(compras: FilaCompra[], via: string): number[] {
  return compras
    .filter((c) => (via === "sin" ? c.viaEnvio.length === 0 : c.viaEnvio.includes(via)))
    .map((c) => diasEntre(c.fechaEnvio, c.fechaLlegada))
    .filter((d): d is number => d !== null);
}

/** Una compra abierta que salió y todavía no llega, y lleva más de lo normal para su vía. */
export function estaAtrasada(c: FilaCompra, umbral: Record<string, number>, dia: string = hoy()): boolean {
  if (!estaAbierta(c) || !c.fechaEnvio || c.fechaLlegada) return false;
  const limite = Math.max(...(c.viaEnvio.length ? c.viaEnvio : ["mar"]).map((v) => umbral[v] ?? 90));
  return (diasEntre(c.fechaEnvio, dia) ?? 0) > limite;
}

/** En tránsito: ya salió y no ha llegado. */
export const enTransito = (c: FilaCompra) => estaAbierta(c) && !!c.fechaEnvio && !c.fechaLlegada;

/** El grupo del filtro rápido de la lista. */
export type Grupo = "abiertas" | "cotizando" | "produccion" | "transito" | "atrasadas" | "cerradas";
const ETAPAS_COTIZANDO = ["backlog", "solicitud_local", "solicitud_internacional", "cotizar", "cotizado", "evaluacion_proveedor", "solicitud_proveedor"];
const ETAPAS_PRODUCCION = ["compra_pago", "produccion"];

export function enGrupo(c: FilaCompra, g: Grupo, umbral: Record<string, number>): boolean {
  if (g === "cerradas") return !estaAbierta(c);
  if (!estaAbierta(c)) return false;
  if (g === "abiertas") return true;
  if (g === "cotizando") return ETAPAS_COTIZANDO.includes(c.etapa);
  if (g === "produccion") return ETAPAS_PRODUCCION.includes(c.etapa);
  if (g === "transito") return enTransito(c) || ["tracking", "aviso_logistica"].includes(c.etapa);
  return estaAtrasada(c, umbral);
}

/** Compras abiertas por etapa, en el orden del flujo (solo las que tienen alguna). */
export function abiertasPorEtapa(compras: FilaCompra[]): { etapa: string; cantidad: number }[] {
  const abiertas = compras.filter(estaAbierta);
  return ETAPAS_COMPRA.filter((e) => !ETAPAS_CERRADAS.includes(e.valor))
    .map((e) => ({ etapa: e.valor, cantidad: abiertas.filter((c) => c.etapa === e.valor).length }))
    .filter((x) => x.cantidad > 0);
}

/** Lo que más tarda o se traba, para «Para revisar». */
export function paraRevisar(compras: FilaCompra[], umbral: Record<string, number>, dia: string = hoy()) {
  const abiertas = compras.filter(estaAbierta);
  return {
    atrasadas: abiertas.filter((c) => estaAtrasada(c, umbral, dia)).sort((a, b) => (a.fechaEnvio ?? "").localeCompare(b.fechaEnvio ?? "")),
    cotizacionLarga: abiertas
      .filter((c) => ["cotizar", "solicitud_local", "solicitud_internacional"].includes(c.etapa) && (diasEntre(c.creadoEn, dia) ?? 0) > 21)
      .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn)),
    conInconveniente: abiertas.filter((c) => !!c.inconveniente),
    pagoPendiente: abiertas.filter((c) => (c.pagoPendiente ?? 0) > 0),
  };
}

// --- Tiempos y fallas ---------------------------------------------------------------------------------------------

/** Los tramos que se pueden medir con las fechas de cada compra. */
export const TRAMOS: { id: string; nombre: string; desde: (c: FilaCompra) => string | null; hasta: (c: FilaCompra) => string | null }[] = [
  { id: "crear-pago", nombre: "Creada → primer pago", desde: (c) => c.creadoEn, hasta: (c) => c.fechaPago1 },
  // En los datos de ClickUp el envío suele ir antes del primer pago (se paga el saldo al embarcar), así que se mide desde la creación.
  { id: "crear-envio", nombre: "Creada → envío", desde: (c) => c.creadoEn, hasta: (c) => c.fechaEnvio },
  { id: "envio-llegada", nombre: "Envío → llegada", desde: (c) => c.fechaEnvio, hasta: (c) => c.fechaLlegada },
  { id: "llegada-cierre", nombre: "Llegada → cierre", desde: (c) => c.fechaLlegada, hasta: (c) => c.cerradoEn },
  { id: "ciclo", nombre: "Ciclo completo (creada → cerrada)", desde: (c) => c.creadoEn, hasta: (c) => (c.etapa === "completado" ? c.cerradoEn : null) },
];

export function tiemposPorTramo(compras: FilaCompra[]) {
  return TRAMOS.map((t) => ({ ...t, ...resumenDias(compras.map((c) => diasEntre(t.desde(c), t.hasta(c))).filter((d): d is number => d !== null)) }));
}

/** Por proveedor, país o vía: cuántas, ciclo y tránsito medianos, inconvenientes y descartadas. */
export function porDimension(compras: FilaCompra[], clave: (c: FilaCompra) => string[]) {
  const grupos = new Map<string, FilaCompra[]>();
  for (const c of compras) for (const k of clave(c)) grupos.set(k, [...(grupos.get(k) ?? []), c]);
  return [...grupos.entries()]
    .map(([nombre, cs]) => ({
      nombre,
      compras: cs.length,
      abiertas: cs.filter(estaAbierta).length,
      ciclo: resumenDias(cs.filter((c) => c.etapa === "completado").map((c) => diasEntre(c.creadoEn, c.cerradoEn)).filter((d): d is number => d !== null)).mediana,
      transito: resumenDias(cs.map((c) => diasEntre(c.fechaEnvio, c.fechaLlegada)).filter((d): d is number => d !== null)).mediana,
      inconvenientes: cs.filter((c) => !!c.inconveniente).length,
      descartadas: cs.filter((c) => c.etapa === "descartado").length,
      pagado: cs.reduce((s, c) => s + (c.pagadoAProveedor ?? 0), 0),
    }))
    .sort((a, b) => b.compras - a.compras);
}

/**
 * Cuánto se quedó una compra en cada estado según su historial (ClickUp y lo que se cambie aquí): de un cambio al
 * siguiente; el último cuenta hasta el cierre o hasta hoy si sigue abierta.
 */
export function tiempoEnEstados(
  eventos: { compraId: string; campo: string; valor: string | null; ocurridoEn: string }[],
  compras: FilaCompra[],
  campo: "estado" | "etapa",
  dia: string = hoy(),
) {
  const porCompra = new Map<string, { valor: string | null; ocurridoEn: string }[]>();
  for (const e of eventos) if (e.campo === campo) porCompra.set(e.compraId, [...(porCompra.get(e.compraId) ?? []), e]);
  const cierre = new Map(compras.map((c) => [c.id, c.cerradoEn]));
  const dias = new Map<string, number[]>();
  for (const [id, lista] of porCompra) {
    const orden = [...lista].sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn));
    orden.forEach((e, i) => {
      const fin = orden[i + 1]?.ocurridoEn ?? cierre.get(id) ?? dia;
      const d = diasEntre(e.ocurridoEn, fin);
      if (d === null || !e.valor) return;
      dias.set(e.valor, [...(dias.get(e.valor) ?? []), d]);
    });
  }
  return [...dias.entries()].map(([valor, v]) => ({ valor, ...resumenDias(v) })).sort((a, b) => b.n - a.n);
}

/** Dinero en dólares: «$1.223,53» o, con `corto`, «$1,01 M» / «$12,4 mil». */
export function usd(n: number, corto = false): string {
  if (corto && Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-PA", { maximumFractionDigits: 2 })} M`;
  if (corto && Math.abs(n) >= 10_000) return `$${(n / 1000).toLocaleString("es-PA", { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString("es-PA", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: corto ? 0 : 2 });
}

export const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });

/** El texto del informe para copiar y pegar en un chat. */
export function textoInforme(compras: FilaCompra[], clave: string, g: Granularidad, vista: string, umbral: Record<string, number>): string {
  const s = estadisticasPeriodo(compras, clave, g);
  const r = paraRevisar(compras, umbral);
  const abiertas = compras.filter(estaAbierta).length;
  const mar = resumenDias(transitos(compras, "mar"));
  const aire = resumenDias(transitos(compras, "aire"));
  return [
    `Compras · ${etiquetaPeriodo(clave, g)} · ${vista === "todos" ? "todos los países" : vista === "importacion" ? "Importadora" : vista}`,
    "",
    `• Creadas: ${s.creadas} (${entero(s.unidades)} unidades)`,
    `• Pagado a proveedores: ${usd(s.pagado)} en ${s.pagadas} compras`,
    `• Enviadas: ${s.enviadas} · llegadas: ${s.llegadas} · completadas: ${s.cerradas}`,
    s.ciclo.mediana !== null ? `• Ciclo de las completadas: ${s.ciclo.mediana} días (mediana)` : "",
    "",
    `Hoy: ${abiertas} abiertas · ${r.atrasadas.length} atrasadas en tránsito · ${r.conInconveniente.length} con inconveniente`,
    `Tránsito normal: mar ${mar.mediana ?? "—"} días · aire ${aire.mediana ?? "—"} días`,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}
