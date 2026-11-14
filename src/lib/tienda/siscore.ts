// SISCORE (el portal de clientes de Servientrega Panamá, servientrega-clientes.appsiscore.com) → Logística de tienda (12 nov 2026). La extensión
// «Ecomfive · Dropi» (lector `siscore`) lee, con la sesión que la persona abrió en esa pestaña, el informe de guías de la cuenta (Kenku primero) y el
// rastreo de cada guía, y lo sube al sistema. **Solo lectura**: no se anula, no se crea ni se cambia nada en SISCORE (regla de Hernán).
// Aquí, sin base y con prueba: cómo viene la lectura, qué quiere decir cada estado y cuántas visitas sin entregar lleva una guía.

import { mismaTiendaUnidad, nombreComparable } from "./ordenes-finanzas";

export interface PasoGuia {
  estado: string;
  /** AAAA-MM-DD */
  fecha: string;
  /** HH:MM:SS */
  hora: string | null;
}

/** Una guía como la sube el lector (informe + rastreo). */
export interface GuiaLeida {
  guia: string;
  /** El cliente de SISCORE («KENKU»): la tienda. */
  cliente: string;
  /** «Factura»: el número de pedido de Shopify («#1521»). */
  factura: string | null;
  destino: string | null;
  servicio: string | null;
  proceso: string | null;
  estado: string | null;
  fecha_estado: string | null;
  fecha_emision: string | null;
  /** Lo que se cobra contra entrega. */
  recaudo: number | null;
  historial: PasoGuia[];
}

export interface LecturaSiscore {
  leido_en: string;
  cliente: string;
  desde: string;
  hasta: string;
  guias: GuiaLeida[];
}

export type GrupoGuia = "entregado" | "devuelto" | "novedad" | "en_ruta";

const texto = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
const dia = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** Lo que subió el lector, validado (lo que no tiene forma de guía se descarta). null si no es una lectura de SISCORE. */
export function leerLecturaSiscore(v: unknown): LecturaSiscore | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const cliente = texto(o.cliente, 60);
  if (!cliente || !Array.isArray(o.guias)) return null;
  const guias: GuiaLeida[] = [];
  for (const g of o.guias as Record<string, unknown>[]) {
    const guia = texto(g?.guia, 40);
    if (!guia || !/^[0-9A-Za-z-]{4,40}$/.test(guia)) continue;
    const historial = Array.isArray(g.historial)
      ? (g.historial as Record<string, unknown>[])
          .map((p) => ({ estado: texto(p?.estado, 160) ?? "", fecha: dia(p?.fecha) ?? "", hora: texto(p?.hora, 8) }))
          .filter((p) => p.estado && p.fecha)
          .slice(0, 200)
      : [];
    const recaudo = Number(g.recaudo);
    guias.push({
      guia,
      cliente: texto(g.cliente, 60) ?? cliente,
      factura: texto(g.factura, 40),
      destino: texto(g.destino, 120),
      servicio: texto(g.servicio, 120),
      proceso: texto(g.proceso, 80),
      estado: texto(g.estado, 160),
      fecha_estado: dia(g.fecha_estado),
      fecha_emision: dia(g.fecha_emision),
      recaudo: Number.isFinite(recaudo) && recaudo >= 0 ? recaudo : null,
      historial,
    });
  }
  return { leido_en: texto(o.leido_en, 40) ?? new Date().toISOString(), cliente, desde: dia(o.desde) ?? "", hasta: dia(o.hasta) ?? "", guias };
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Los estados de una visita que no se pudo entregar (lo que en Mi Reto Digital es «visita sin entregar · motivo»). */
const NOVEDAD = /NO LOCALIZADO|TELEFONO INCORRECTO|APAGADO|NO HAY QUIEN|NO SE PUDO|RECHAZ|NO ASIGNADO A RUTA|DIRECCION (ERRADA|INCORRECTA|INCOMPLETA)|NO ENCONTR|SIN DINERO|NO TIENE (EL )?DINERO|CERRADO|REPROGRAM|ZONA (ROJA|PELIGROSA)|NOVEDAD/;
const ENTREGADO = /^ENTREGA(DO|DA)?\b|ENTREGA APP|ENTREGADO AL? (CLIENTE|DESTINATARIO)/;
const DEVUELTO = /DEVOLUCION|DEVUELT|CANCELADO POR DEVOL|RETORNO/;

/** Qué quiere decir el estado de una guía: entregada, devuelta, con novedad (visita sin entregar) o en ruta. */
export function grupoDeEstadoGuia(estado: string | null | undefined): GrupoGuia {
  const n = sinTildes(estado ?? "");
  if (!n) return "en_ruta";
  if (DEVUELTO.test(n)) return "devuelto";
  if (ENTREGADO.test(n)) return "entregado";
  if (NOVEDAD.test(n)) return "novedad";
  return "en_ruta";
}

/** Las visitas sin entregar de una guía (cada paso del rastreo con una novedad) y el último motivo. */
export function visitasSinEntregar(historial: PasoGuia[]): { visitas: number; motivo: string | null } {
  const malas = historial.filter((p) => grupoDeEstadoGuia(p.estado) === "novedad");
  return { visitas: malas.length, motivo: malas.at(-1)?.estado ?? null };
}

/** Cuándo se entregó (el primer paso de entrega del rastreo), «AAAA-MM-DD HH:MM:SS»; null si no se entregó. */
export function momentoEntrega(historial: PasoGuia[]): string | null {
  const p = historial.find((x) => grupoDeEstadoGuia(x.estado) === "entregado");
  return p ? `${p.fecha}${p.hora ? ` ${p.hora}` : ""}` : null;
}

/** El número de pedido para comparar con `ven_ordenes.numero` («#1521»): con «#» si es solo un número. */
export function pedidoDeFactura(factura: string | null): string | null {
  const t = (factura ?? "").trim().toUpperCase();
  if (!t) return null;
  return /^\d+$/.test(t) ? `#${t}` : t;
}

/**
 * La tienda del sistema de una cuenta de SISCORE (14 nov 2026, al sumar Oferfy): el cliente de la cuenta es el nombre de la tienda («KENKU»), su unidad
 * de Finanzas («OFERFY PAN») o empieza con él («OFERFY PANAMA»). Con dos tiendas posibles, ninguna.
 */
export function tiendaDeClienteSiscore<T extends { nombre: string }>(cliente: string, tiendas: T[]): T | null {
  const c = nombreComparable(cliente);
  const exacta = tiendas.filter((t) => nombreComparable(t.nombre) === c || mismaTiendaUnidad(t.nombre, cliente));
  if (exacta.length === 1) return exacta[0];
  const parcial = tiendas.filter((t) => c.split(" ")[0] === nombreComparable(t.nombre).split(" ")[0]);
  return parcial.length === 1 ? parcial[0] : null;
}
