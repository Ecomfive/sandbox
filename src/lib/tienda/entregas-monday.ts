// Las entregas de ciudad que el equipo registra en Monday (tablero «DELIVERY REPORTES DIARIOS» de Panamá, todas las tiendas), para Logística de
// tienda (12 nov 2026). Las lee el lector de Monday de Finanzas (`src/lib/monday/`, cron «monday») a `mon_despachos`, enlazadas a `ven_ordenes`
// por número de pedido y tienda. Aquí solo se leen. Si la tabla no existe o Monday no está configurado, no hay entregas (Logística sigue igual).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GrupoEstado } from "@/lib/monday/columnas";

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
}

/** La entrega más reciente de cada orden (por el día del reparto y la última actualización en Monday). */
export async function entregasDeOrdenes(supabase: SupabaseClient, ordenIds: string[]): Promise<Map<string, EntregaMonday>> {
  const mapa = new Map<string, EntregaMonday & { clave: string }>();
  const ids = [...new Set(ordenIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("mon_despachos")
      .select("orden_id, estado, estado_grupo, courier, fecha_despacho, fecha_entrega, causa_rechazo, actualizado_monday")
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
    }[]) {
      const fecha = d.fecha_entrega ?? d.fecha_despacho;
      const clave = `${fecha ?? ""}|${d.actualizado_monday ?? ""}`;
      const previa = mapa.get(d.orden_id);
      if (previa && previa.clave >= clave) continue;
      mapa.set(d.orden_id, { clave, grupo: d.estado_grupo, estado: d.estado, repartidor: d.courier, fecha, causa: d.causa_rechazo });
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
