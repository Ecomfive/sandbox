// Asesores de tienda (20 nov 2026, pedido de Hernán: que Beatriz, la encargada de atención, vea el rendimiento de los asesores). Cada asesor queda registrado
// cuando cambia las etiquetas de un pedido desde el sistema (ficha del pedido o «Confirmar pedido», `etiquetas-actions.ts`): confirmó (agregó «Confirmada»),
// canceló (agregó «ANULADO…» o «Cancelado») o lo dejó en gestión («Pendiente», «Modificar…»). Lo que se hace directo en Shopify no tiene asesor: se cuenta
// aparte como «fuera del sistema». Sin base ni red, con prueba (`asesores.test.ts`).

import { enGestion } from "./confirmacion";
import { diaPanama } from "./resumen";

/** Un cambio de etiquetas hecho desde el sistema (`ven_orden_eventos`, tipo «etiqueta»). */
export interface EventoEtiqueta {
  ordenId: string;
  usuarioId: string | null;
  usuario: string | null;
  creadoEn: string;
  agregadas: string[];
  quitadas: string[];
}

/** Lo que importa del pedido para medir al asesor: su tienda y cuándo entró en Shopify. */
export interface PedidoAsesor {
  tiendaId: string;
  /** Cuándo entró el pedido en Shopify (ISO); null si no se sabe (los del Excel). */
  creado: string | null;
}

export interface FilaAsesor {
  clave: string;
  nombre: string;
  tiendas: string[];
  /** Pedidos distintos en que cambió etiquetas en el periodo. */
  atendidos: number;
  confirmados: number;
  cancelados: number;
  /** Pedidos que dejó en gestión (Pendiente, Modificar…) y que no confirmó ni canceló en el periodo. */
  enGestion: number;
  /** Confirmados ÷ (confirmados + cancelados), en %; null si no resolvió ninguno. */
  tasa: number | null;
  /** Minutos desde que entró el pedido hasta que lo confirmó: la mediana; null sin confirmados con hora. */
  minutosMediana: number | null;
  /** Lo mismo, el promedio. */
  minutosPromedio: number | null;
  /** El último cambio que hizo (ISO). */
  ultimo: string;
  /** Confirmados + cancelados (para la corona hace falta un mínimo). */
  resueltos: number;
  /** Cuántos confirmó en cada rango de atención (`RANGOS_ATENCION`). */
  rangos: number[];
}

const CONFIRMADA = /^confirmad[ao]$/i;
/** Cancelar: «ANULADO», «ANULADO VERIFICADO», «ANULADO/VERIFICADO» o «Cancelado» (las cuatro las usa el equipo en Shopify). */
const CANCELA = /^(anulad[oa]|cancelad[oa])(?![a-z])/i;

/** Si esas etiquetas agregadas confirman el pedido, lo cancelan o lo dejan en gestión. */
export function efectoEtiquetas(agregadas: string[]): { confirma: boolean; cancela: boolean; gestion: boolean } {
  return {
    confirma: agregadas.some((e) => CONFIRMADA.test(e.trim())),
    cancela: agregadas.some((e) => CANCELA.test(e.trim())),
    gestion: enGestion(agregadas),
  };
}

/**
 * Las etiquetas de un evento viejo (antes de la migración 0345 solo quedaba el texto): «Etiquetas en Shopify: agregó «A», «B» y quitó «C»».
 */
export function cambioDeTexto(detalle: string | null | undefined): { agregadas: string[]; quitadas: string[] } {
  const t = String(detalle ?? "");
  const lista = (s: string | undefined) => [...String(s ?? "").matchAll(/«([^»]*)»/g)].map((m) => m[1].trim()).filter(Boolean);
  const agrego = /agregó ((?:«[^»]*»(?:, )?)+)/.exec(t)?.[1];
  const quito = /quitó ((?:«[^»]*»(?:, )?)+)/.exec(t)?.[1];
  return { agregadas: lista(agrego), quitadas: lista(quito) };
}

const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};

/**
 * El rendimiento de cada asesor con los cambios de etiquetas del periodo. Un pedido cuenta una vez por asesor: si lo confirmó y después lo canceló, cuenta lo
 * último que hizo. La rapidez es desde que entró el pedido hasta la primera vez que ese asesor lo confirmó.
 */
export function resumirAsesores(eventos: EventoEtiqueta[], pedidos: Map<string, PedidoAsesor>, nombreTienda: (id: string) => string): FilaAsesor[] {
  type Acum = { nombre: string; tiendas: Set<string>; porPedido: Map<string, "confirma" | "cancela" | "gestion" | "otro">; minutos: number[]; ultimo: string };
  const acum = new Map<string, Acum>();
  const ordenados = [...eventos].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  const confirmadoPor = new Set<string>();
  for (const e of ordenados) {
    const p = pedidos.get(e.ordenId);
    if (!p) continue;
    const clave = e.usuarioId ?? `n:${(e.usuario ?? "").trim().toLowerCase() || "sin nombre"}`;
    const a = acum.get(clave) ?? { nombre: (e.usuario ?? "").trim() || "Sin nombre", tiendas: new Set<string>(), porPedido: new Map(), minutos: [] as number[], ultimo: e.creadoEn };
    if ((e.usuario ?? "").trim()) a.nombre = (e.usuario ?? "").trim();
    a.tiendas.add(nombreTienda(p.tiendaId));
    a.ultimo = e.creadoEn > a.ultimo ? e.creadoEn : a.ultimo;
    const ef = efectoEtiquetas(e.agregadas);
    const previo = a.porPedido.get(e.ordenId);
    const ahora = ef.cancela ? "cancela" : ef.confirma ? "confirma" : ef.gestion ? "gestion" : null;
    if (ahora) a.porPedido.set(e.ordenId, ahora);
    else if (!previo) a.porPedido.set(e.ordenId, "otro");
    if (ef.confirma && !confirmadoPor.has(`${clave}|${e.ordenId}`)) {
      confirmadoPor.add(`${clave}|${e.ordenId}`);
      if (p.creado) {
        const min = (Date.parse(e.creadoEn) - Date.parse(p.creado)) / 60_000;
        if (Number.isFinite(min) && min >= 0) a.minutos.push(min);
      }
    }
    acum.set(clave, a);
  }
  return [...acum].map(([clave, a]) => {
    const estados = [...a.porPedido.values()];
    const confirmados = estados.filter((x) => x === "confirma").length;
    const cancelados = estados.filter((x) => x === "cancela").length;
    const resueltos = confirmados + cancelados;
    return {
      clave,
      nombre: a.nombre,
      tiendas: [...a.tiendas].sort(),
      atendidos: a.porPedido.size,
      confirmados,
      cancelados,
      enGestion: estados.filter((x) => x === "gestion").length,
      tasa: resueltos ? Math.round((confirmados / resueltos) * 1000) / 10 : null,
      minutosMediana: mediana(a.minutos),
      minutosPromedio: a.minutos.length ? Math.round(a.minutos.reduce((s, x) => s + x, 0) / a.minutos.length) : null,
      ultimo: a.ultimo,
      resueltos,
      rangos: contarRangos(a.minutos),
    };
  }).sort((x, y) => y.confirmados - x.confirmados || y.atendidos - x.atendidos || x.nombre.localeCompare(y.nombre));
}

/** «25 min», «3 h 10 min», «2 d 4 h». */
export function textoMinutos(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h${min % 60 ? ` ${Math.round(min % 60)} min` : ""}`;
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ""}`;
}

// ---------- Panel de asesores (23 nov 2026, prototipo aprobado por Hernán: donas, rangos de atención, corona a los 3 mejores y paso a paso) ----------

/** Los rangos de atención: cuánto tardó en confirmarse un pedido desde que entró en Shopify. */
export const RANGOS_ATENCION = [
  { etiqueta: "< 15 min", hasta: 15 },
  { etiqueta: "15–30 min", hasta: 30 },
  { etiqueta: "30–60 min", hasta: 60 },
  { etiqueta: "1–4 h", hasta: 240 },
  { etiqueta: "4–24 h", hasta: 1440 },
  { etiqueta: "> 24 h", hasta: Number.POSITIVE_INFINITY },
] as const;

/** Cuántos minutos caen en cada rango de atención. */
export function contarRangos(minutos: number[]): number[] {
  const c = RANGOS_ATENCION.map(() => 0);
  for (const m of minutos) {
    const i = RANGOS_ATENCION.findIndex((r) => m < r.hasta);
    if (i >= 0) c[i]++;
  }
  return c;
}

/** Pedidos resueltos (confirmados + cancelados) que hacen falta para llevar corona: que no gane alguien con tres pedidos. */
export const MIN_RESUELTOS_CORONA = 20;

export type AsesorConPuntaje = FilaAsesor & { puntos: number; corona: 0 | 1 | 2 | null };

/**
 * El puntaje de atención (0 a 100) y la corona de los 3 mejores: 50 % su confirmación, 30 % su rapidez (la mediana: 0 min = todo, 2 h o más = nada) y 20 % su
 * volumen (sus confirmados frente al que más confirmó). La corona (oro, plata, bronce) va a los 3 de mayor puntaje con al menos `MIN_RESUELTOS_CORONA` resueltos.
 */
export function puntuarAsesores(filas: FilaAsesor[]): AsesorConPuntaje[] {
  const maxC = Math.max(1, ...filas.map((f) => f.confirmados));
  const conPuntos = filas.map((f) => ({
    ...f,
    puntos: Math.round(50 * ((f.tasa ?? 0) / 100) + 30 * (f.minutosMediana === null ? 0 : Math.max(0, 1 - f.minutosMediana / 120)) + 20 * (f.confirmados / maxC)),
    corona: null as 0 | 1 | 2 | null,
  }));
  conPuntos.sort((a, b) => b.puntos - a.puntos || b.confirmados - a.confirmados || a.nombre.localeCompare(b.nombre));
  let k = 0;
  for (const f of conPuntos) if (k < 3 && f.resueltos >= MIN_RESUELTOS_CORONA) f.corona = k++ as 0 | 1 | 2;
  return conPuntos;
}

export type ResultadoAtencion = "confirma" | "cancela" | "gestion" | "otro";

/** Lo que un asesor hizo con un pedido: sus pasos en orden, cómo terminó y, si lo confirmó, en cuántos minutos desde que entró. */
export interface AtencionPedido {
  clave: string;
  ordenId: string;
  resultado: ResultadoAtencion;
  minutos: number | null;
  pasos: { t: string; agregadas: string[]; quitadas: string[]; tipo: ResultadoAtencion }[];
  ultimo: string;
}

const claveDe = (e: EventoEtiqueta) => e.usuarioId ?? `n:${(e.usuario ?? "").trim().toLowerCase() || "sin nombre"}`;

/** El paso a paso de cada asesor con cada pedido (solo pedidos de las tiendas que se miran), lo más reciente primero. */
export function atencionesDe(eventos: EventoEtiqueta[], pedidos: Map<string, PedidoAsesor>): AtencionPedido[] {
  const mapa = new Map<string, AtencionPedido>();
  for (const e of [...eventos].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))) {
    const p = pedidos.get(e.ordenId);
    if (!p) continue;
    const clave = claveDe(e);
    const k = `${clave}|${e.ordenId}`;
    const a = mapa.get(k) ?? { clave, ordenId: e.ordenId, resultado: "otro" as ResultadoAtencion, minutos: null, pasos: [], ultimo: e.creadoEn };
    const ef = efectoEtiquetas(e.agregadas);
    const tipo: ResultadoAtencion = ef.cancela ? "cancela" : ef.confirma ? "confirma" : ef.gestion ? "gestion" : "otro";
    a.pasos.push({ t: e.creadoEn, agregadas: e.agregadas, quitadas: e.quitadas, tipo });
    if (tipo !== "otro") a.resultado = tipo;
    if (ef.confirma && a.minutos === null && p.creado) {
      const min = (Date.parse(e.creadoEn) - Date.parse(p.creado)) / 60_000;
      if (Number.isFinite(min) && min >= 0) a.minutos = Math.round(min);
    }
    a.ultimo = e.creadoEn;
    mapa.set(k, a);
  }
  return [...mapa.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo));
}

/**
 * Confirmados por día (o por semana si el periodo pasa de 62 días): los confirmados desde el sistema (el día en que se confirmó, una vez por pedido) y los que
 * se confirmaron directo en Shopify (el día en que entró el pedido). `desde` y `hasta` son días de Panamá (AAAA-MM-DD).
 */
export function confirmadosPorDia(
  confirmadosSistema: { t: string }[],
  confirmadosShopify: { creado: string }[],
  desde: string,
  hasta: string,
): { desde: string; sistema: number; shopify: number }[] {
  const dias: string[] = [];
  for (let d = Date.parse(`${desde}T12:00:00Z`); d <= Date.parse(`${hasta}T12:00:00Z`); d += 86_400_000) dias.push(new Date(d).toISOString().slice(0, 10));
  const porSemana = dias.length > 62;
  const cubeta = (dia: string) => {
    if (!porSemana) return dia;
    const i = dias.indexOf(dia);
    return i < 0 ? dia : dias[i - (i % 7)];
  };
  const grupos = new Map<string, { desde: string; sistema: number; shopify: number }>();
  for (const d of dias) {
    const c = cubeta(d);
    if (!grupos.has(c)) grupos.set(c, { desde: c, sistema: 0, shopify: 0 });
  }
  for (const x of confirmadosSistema) {
    const g = grupos.get(cubeta(diaPanama(x.t)));
    if (g) g.sistema++;
  }
  for (const x of confirmadosShopify) {
    const g = grupos.get(cubeta(diaPanama(x.creado)));
    if (g) g.shopify++;
  }
  return [...grupos.values()];
}

// ---------- Ventas del bot de iComfly (23 nov 2026, pedido de Hernán: «agregar las métricas de lo que confirma el bot») ----------
// El bot deja en el pedido que toma por WhatsApp la etiqueta «chatbot» o la nota «Pedido #… - Venta por bot - WhatsApp …». No se sabe quién lo confirma
// después (eso queda en el historial de Shopify): aquí se mide lo que vende el bot y cómo terminan sus pedidos, frente a los demás.

/** Cómo terminó un pedido, para comparar los del bot con los demás. */
export type FinPedido = "entregado" | "en_camino" | "confirmado" | "pendiente" | "cancelado" | "devuelto";

export const ETIQUETA_FIN: Record<FinPedido, string> = {
  entregado: "Entregados",
  en_camino: "En camino",
  confirmado: "Confirmados, por despachar",
  pendiente: "Por confirmar",
  cancelado: "Cancelados",
  devuelto: "Devueltos",
};

/** El fin de un pedido según su estado en el sistema. */
export function finDePedido(estado: string): FinPedido {
  if (estado === "entregado" || estado === "en_camino" || estado === "confirmado" || estado === "cancelado" || estado === "devuelto") return estado;
  return "pendiente";
}

/** Lo que se cuenta de un grupo de pedidos (los del bot o los demás). */
export interface CuentaPedidos {
  total: number;
  fin: Record<FinPedido, number>;
  /** Los que pasaron la confirmación (todo menos por confirmar y cancelados) ÷ los que ya se resolvieron (todo menos por confirmar), en %. */
  confirmacion: number | null;
  /** Entregados ÷ los que ya terminaron (entregados + devueltos + cancelados), en %. */
  entrega: number | null;
}

function contarPedidos(estados: string[]): CuentaPedidos {
  const fin = { entregado: 0, en_camino: 0, confirmado: 0, pendiente: 0, cancelado: 0, devuelto: 0 } as Record<FinPedido, number>;
  for (const e of estados) fin[finDePedido(e)]++;
  const resueltos = estados.length - fin.pendiente;
  const terminados = fin.entregado + fin.devuelto + fin.cancelado;
  const r1 = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return { total: estados.length, fin, confirmacion: r1(resueltos - fin.cancelado, resueltos), entrega: r1(fin.entregado, terminados) };
}

export interface ResumenBot {
  bot: CuentaPedidos;
  resto: CuentaPedidos;
  porTienda: { tienda: string; bot: CuentaPedidos; total: number }[];
  porDia: { desde: string; bot: number }[];
}

/** Las ventas del bot del periodo frente a los demás pedidos de Shopify, por tienda y por día (o semana si el periodo pasa de 62 días). */
export function resumirBot(pedidos: { tienda: string; estado: string; creado: string; esBot: boolean }[], desde: string, hasta: string): ResumenBot {
  const bot = pedidos.filter((p) => p.esBot);
  const tiendas = [...new Set(pedidos.map((p) => p.tienda))].sort();
  const dias = confirmadosPorDia(bot.map((p) => ({ t: p.creado })), [], desde, hasta);
  return {
    bot: contarPedidos(bot.map((p) => p.estado)),
    resto: contarPedidos(pedidos.filter((p) => !p.esBot).map((p) => p.estado)),
    porTienda: tiendas.map((t) => ({ tienda: t, bot: contarPedidos(bot.filter((p) => p.tienda === t).map((p) => p.estado)), total: pedidos.filter((p) => p.tienda === t).length })),
    porDia: dias.map((d) => ({ desde: d.desde, bot: d.sistema })),
  };
}

/** Si la nota del pedido es la que deja el bot al crearlo («… Venta por bot …»). */
export const notaDelBot = (nota: string | null | undefined) => /venta por bot/i.test(nota ?? "");
