// Asesores de tienda (20 nov 2026, pedido de Hernán: que Beatriz, la encargada de atención, vea el rendimiento de los asesores). Cada asesor queda registrado
// cuando cambia las etiquetas de un pedido desde el sistema (ficha del pedido o «Confirmar pedido», `etiquetas-actions.ts`): confirmó (agregó «Confirmada»),
// canceló (agregó «ANULADO…» o «Cancelado») o lo dejó en gestión («Pendiente», «Modificar…»). Lo que se hace directo en Shopify no tiene asesor: se cuenta
// aparte como «fuera del sistema». Sin base ni red, con prueba (`asesores.test.ts`).

import { enGestion } from "./confirmacion";

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
