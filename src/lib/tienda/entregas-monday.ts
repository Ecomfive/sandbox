// Las entregas de ciudad que el equipo registra en Monday (tablero «DELIVERY REPORTES DIARIOS» de Panamá, todas las tiendas), para Logística de
// tienda (12 nov 2026). Las lee el lector de Monday de Finanzas (`src/lib/monday/`, cron «monday») a `mon_despachos`, enlazadas a `ven_ordenes`
// por número de pedido y tienda. Aquí solo se leen. Si la tabla no existe o Monday no está configurado, no hay entregas (Logística sigue igual).

import type { SupabaseClient } from "@supabase/supabase-js";
import { causaDespacho, prioridadDespacho, type GrupoEstado } from "@/lib/monday/columnas";

export interface EntregaMonday {
  /** entregado, rechazado, cancelado, en_ruta o sin_estado (la regla de estados de Monday). */
  grupo: GrupoEstado;
  /** El estado tal cual en Monday («ENTREGADO», «PENDIENTE»…). */
  estado: string | null;
  /** El repartidor (columna «Delivery»). */
  repartidor: string | null;
  /** El día del reparto (el grupo del tablero), AAAA-MM-DD. */
  fecha: string | null;
  causa: string | null;
  /** De dónde salió: Monday (ciudad) o SISCORE (Servientrega, interior). Sin el campo, Monday. */
  fuente?: "monday" | "siscore";
  /** SISCORE: la guía, las visitas sin entregar y si la última es una novedad (cliente no localizado, teléfono apagado…). */
  guia?: string | null;
  visitas?: number;
  novedad?: boolean;
  /** Monday, tablero de devoluciones: lo que decidieron los asesores (DESINTEGRADO, PROCESADO, PENDIENTE). */
  asesores?: string | null;
}

/**
 * La etiqueta corta de la entrega para la lista de Pedidos (13 nov 2026, pedido de Hernán: un pedido «En camino» debe decir lo que dice Monday —
 * POSPUESTO, FALLIDO, RECOLECTADO, DESINTEGRADO—). DESINTEGRADO de los asesores manda sobre el estado del repartidor; de interior, el estado de SISCORE.
 */
export function etiquetaEntrega(e: EntregaMonday | null | undefined): string | null {
  if (!e) return null;
  if (e.asesores && /DESINTEGRAD/i.test(e.asesores)) return "DESINTEGRADO";
  const estado = (e.estado ?? "").replace(/\s+/g, " ").trim();
  if (!estado) return null;
  return e.fuente === "siscore" ? `Servientrega: ${estado}` : estado.toUpperCase();
}

/** La entrega más reciente de cada orden (por el día del reparto y la última actualización en Monday). */
export async function entregasDeOrdenes(supabase: SupabaseClient, ordenIds: string[]): Promise<Map<string, EntregaMonday>> {
  const mapa = new Map<string, EntregaMonday & { clave: string }>();
  const ids = [...new Set(ordenIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("mon_despachos")
      .select("orden_id, estado, estado_grupo, courier, fecha_despacho, fecha_entrega, causa_rechazo, actualizado_monday, estado_asesores, observaciones_asesores")
      .in("orden_id", ids.slice(i, i + 200));
    if (error) return new Map();
    for (const d of (data ?? []) as {
      orden_id: string;
      estado: string | null;
      estado_grupo: GrupoEstado;
      courier: string | null;
      fecha_despacho: string | null;
      fecha_entrega: string | null;
      causa_rechazo: string | null;
      actualizado_monday: string | null;
      estado_asesores?: string | null;
      observaciones_asesores?: string | null;
    }[]) {
      const fecha = d.fecha_entrega ?? d.fecha_despacho;
      // Manda un ENTREGADO, luego un DESINTEGRADO de los asesores y, entre lo demás, lo más reciente (`prioridadDespacho`).
      const clave = `${prioridadDespacho(d.estado_grupo, d.estado_asesores)}|${fecha ?? ""}|${d.actualizado_monday ?? ""}`;
      const previa = mapa.get(d.orden_id);
      if (previa && previa.clave >= clave) continue;
      const causa = causaDespacho(d.causa_rechazo, d.estado_asesores, d.observaciones_asesores);
      mapa.set(d.orden_id, { clave, grupo: d.estado_grupo, estado: d.estado, repartidor: d.courier, fecha, causa, asesores: d.estado_asesores ?? null });
    }
  }
  return new Map(
    [...mapa].map(([k, v]) => {
      const e: EntregaMonday & { clave?: string } = { ...v };
      delete e.clave;
      return [k, e];
    }),
  );
}

/**
 * Las guías de Servientrega (SISCORE, interior) de esas órdenes, como entregas (12 nov 2026): entregada, devuelta (= rechazado para Logística), con
 * novedad o en ruta; la guía, las visitas sin entregar y el último motivo. La más reciente por orden. Sin la migración 0280, ninguna.
 */
export async function guiasDeOrdenes(supabase: SupabaseClient, ordenIds: string[]): Promise<Map<string, EntregaMonday>> {
  const mapa = new Map<string, EntregaMonday & { clave: string }>();
  const ids = [...new Set(ordenIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("tienda_guias")
      .select("guia, orden_id, estado, estado_grupo, fecha_estado, fecha_emision, ultimo_motivo, visitas_sin_entregar")
      .in("orden_id", ids.slice(i, i + 200));
    if (error) return new Map();
    for (const g of (data ?? []) as {
      guia: string;
      orden_id: string;
      estado: string | null;
      estado_grupo: "entregado" | "devuelto" | "novedad" | "en_ruta";
      fecha_estado: string | null;
      fecha_emision: string | null;
      ultimo_motivo: string | null;
      visitas_sin_entregar: number;
    }[]) {
      const clave = `${g.fecha_emision ?? ""}|${g.fecha_estado ?? ""}`;
      const previa = mapa.get(g.orden_id);
      if (previa && previa.clave >= clave) continue;
      mapa.set(g.orden_id, {
        clave,
        fuente: "siscore",
        grupo: g.estado_grupo === "entregado" ? "entregado" : g.estado_grupo === "devuelto" ? "rechazado" : "en_ruta",
        estado: g.estado,
        repartidor: "Servientrega",
        fecha: g.fecha_estado,
        causa: g.ultimo_motivo,
        guia: g.guia,
        visitas: g.visitas_sin_entregar,
        novedad: g.estado_grupo === "novedad",
      });
    }
  }
  return new Map(
    [...mapa].map(([k, v]) => {
      const e: EntregaMonday & { clave?: string } = { ...v };
      delete e.clave;
      return [k, e];
    }),
  );
}
