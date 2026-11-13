// Pedidos de tienda entregados o devueltos según Monday y Servientrega (12 nov 2026, pedido de Hernán: «identificar con Monday cuáles pedidos ya se
// entregaron en la ciudad y en Servientrega los de interior, e ir actualizando esos pedidos en el sistema»). Logística ya mostraba lo que dicen
// Monday (`mon_despachos`, ciudad) y SISCORE (`tienda_guias`, interior), pero la orden seguía «despachada» en todo lo demás. Aquí, cada vez que se lee
// Monday o Servientrega, una orden **despachada** que allá figura entregada pasa a `entregada` (con el día de la entrega) y una rechazada o devuelta a
// `devuelta`. Solo se mueven órdenes despachadas: lo que ya está entregado, devuelto o cancelado no se toca, y tampoco una orden congelada o de un mes
// cerrado. No se manda ningún aviso al cliente ni se mueve inventario (el stock salió al despachar). El contra entrega queda en Cobros como por
// remitir, con lo que cobró Servientrega (recaudo) si lo dice (Hernán: «que salgan pendientes»). La regla, pura y con prueba: `cambioDeEntrega`.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrdenParaEntrega {
  id: string;
  numero: string;
  fase: string | null;
  fecha: string;
  congelada: boolean | null;
  cod_esperado: number | null;
  transportista: string | null;
  guia: string | null;
}

/** Lo último que dice Monday (ciudad) de una orden. */
export interface DatoMonday {
  estado_grupo: string;
  estado: string | null;
  courier: string | null;
  causa_rechazo: string | null;
  fecha: string | null;
}

/** Lo último que dice Servientrega (SISCORE, interior) de una orden. */
export interface DatoGuia {
  guia: string;
  estado_grupo: string;
  estado: string | null;
  fecha_estado: string | null;
  recaudo: number | null;
  ultimo_motivo: string | null;
}

export interface CambioEntrega {
  fase: "entregada" | "devuelta";
  fuente: "monday" | "servientrega";
  /** Las columnas de `ven_ordenes` que cambian. */
  set: Record<string, unknown>;
  /** Lo que queda en el evento de la orden. */
  detalle: string;
}

/** El momento de un día de Panamá (mediodía), para `entregada_en`. */
const mediodia = (dia: string | null): string | null => (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? `${dia}T17:00:00.000Z` : null);

/**
 * Qué le pasa a una orden con lo que dicen Monday y Servientrega; null = nada. Manda Servientrega cuando la orden tiene guía (es de interior).
 * `mesesCerrados` son los periodos «AAAA-MM» cerrados en Finanzas.
 */
export function cambioDeEntrega(o: OrdenParaEntrega, monday: DatoMonday | null, guia: DatoGuia | null, mesesCerrados: Set<string>): CambioEntrega | null {
  if (o.fase !== "despachada" || o.congelada) return null;
  if (mesesCerrados.has(String(o.fecha).slice(0, 7))) return null;
  const cod = Number(o.cod_esperado ?? 0) > 0;
  if (guia && (guia.estado_grupo === "entregado" || guia.estado_grupo === "devuelto")) {
    const base: Record<string, unknown> = { transportista: o.transportista || "Servientrega", guia: o.guia || guia.guia };
    if (guia.estado_grupo === "entregado") {
      const set: Record<string, unknown> = { ...base, fase: "entregada", estado_entrega: "entregada", entregada_en: mediodia(guia.fecha_estado) ?? new Date().toISOString() };
      if (cod && guia.recaudo !== null && guia.recaudo > 0) set.cod_cobrado = Math.round(guia.recaudo * 100) / 100;
      return { fase: "entregada", fuente: "servientrega", set, detalle: `Servientrega: ${guia.estado ?? "entregada"} (guía ${guia.guia}${guia.fecha_estado ? `, ${guia.fecha_estado}` : ""})` };
    }
    const motivo = `Servientrega: ${guia.estado ?? "devuelta"}${guia.ultimo_motivo ? ` (${guia.ultimo_motivo})` : ""} · guía ${guia.guia}`.slice(0, 300);
    return { fase: "devuelta", fuente: "servientrega", set: { ...base, fase: "devuelta", estado_entrega: "devuelta", motivo_cancelacion: motivo, cod_esperado: null, fecha_devolucion: guia.fecha_estado }, detalle: motivo };
  }
  if (guia) return null; // interior todavía en camino o con novedad: Monday no manda sobre una guía
  if (!monday) return null;
  if (monday.estado_grupo === "entregado") {
    const set: Record<string, unknown> = { fase: "entregada", estado_entrega: "entregada", entregada_en: mediodia(monday.fecha) ?? new Date().toISOString() };
    if (!o.transportista && monday.courier) set.transportista = monday.courier.slice(0, 80);
    return { fase: "entregada", fuente: "monday", set, detalle: `Monday: ${monday.estado ?? "ENTREGADO"}${monday.courier ? ` · ${monday.courier}` : ""}${monday.fecha ? ` · ${monday.fecha}` : ""}` };
  }
  if (monday.estado_grupo === "rechazado") {
    const motivo = `Monday: ${monday.estado ?? "RECHAZADO"}${monday.causa_rechazo ? ` (${monday.causa_rechazo})` : ""}`.slice(0, 300);
    const set: Record<string, unknown> = { fase: "devuelta", estado_entrega: "devuelta", motivo_cancelacion: motivo, cod_esperado: null, fecha_devolucion: monday.fecha };
    if (!o.transportista && monday.courier) set.transportista = monday.courier.slice(0, 80);
    return { fase: "devuelta", fuente: "monday", set, detalle: motivo };
  }
  return null;
}

/**
 * Pasa a entregadas o devueltas las órdenes despachadas que Monday o Servientrega ya cerraron. Lee todas las órdenes despachadas (de todas las
 * tiendas), lo último de Monday y de SISCORE de cada una y aplica `cambioDeEntrega`. Cada cambio deja su evento en la orden. Si otra persona la movió
 * a la vez, no se pisa (la condición es que siga despachada).
 */
export async function actualizarEntregas(supabase: SupabaseClient, quien = "Sistema"): Promise<{ entregadas: number; devueltas: number; resumen: string }> {
  const ordenes: OrdenParaEntrega[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabase.from("ven_ordenes").select("id, numero, fase, fecha, congelada, cod_esperado, transportista, guia").eq("fase", "despachada").order("id").range(d, d + 999);
    if (error) throw new Error(`Órdenes despachadas: ${error.message}`);
    ordenes.push(...((data ?? []) as OrdenParaEntrega[]));
    if ((data ?? []).length < 1000) break;
  }
  if (!ordenes.length) return { entregadas: 0, devueltas: 0, resumen: "No hay órdenes despachadas." };
  const ids = ordenes.map((o) => o.id);
  const monday = new Map<string, DatoMonday & { clave: string }>();
  const guias = new Map<string, DatoGuia & { clave: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const parte = ids.slice(i, i + 200);
    const [m, g] = await Promise.all([
      supabase.from("mon_despachos").select("orden_id, estado, estado_grupo, courier, causa_rechazo, fecha_despacho, fecha_entrega, actualizado_monday, estado_asesores").in("orden_id", parte),
      supabase.from("tienda_guias").select("orden_id, guia, estado, estado_grupo, fecha_estado, fecha_emision, recaudo, ultimo_motivo").in("orden_id", parte),
    ]);
    // Sin la tabla de una fuente (migración sin correr), esa fuente no cuenta.
    for (const x of (m.error ? [] : (m.data ?? [])) as Record<string, string | null>[]) {
      const fecha = x.fecha_entrega ?? x.fecha_despacho;
      // Lo del tablero de devoluciones (con decisión de los asesores) va después de lo del repartidor: es lo último que pasa con el pedido.
      const clave = `${x.estado_asesores ? "2" : "1"}|${fecha ?? ""}|${x.actualizado_monday ?? ""}`;
      const previa = monday.get(String(x.orden_id));
      if (previa && previa.clave >= clave) continue;
      monday.set(String(x.orden_id), { clave, estado_grupo: String(x.estado_grupo), estado: x.estado, courier: x.courier, causa_rechazo: x.causa_rechazo, fecha });
    }
    for (const x of (g.error ? [] : (g.data ?? [])) as Record<string, unknown>[]) {
      const clave = `${x.fecha_emision ?? ""}|${x.fecha_estado ?? ""}`;
      const previa = guias.get(String(x.orden_id));
      if (previa && previa.clave >= clave) continue;
      guias.set(String(x.orden_id), {
        clave,
        guia: String(x.guia),
        estado_grupo: String(x.estado_grupo),
        estado: (x.estado as string | null) ?? null,
        fecha_estado: (x.fecha_estado as string | null) ?? null,
        recaudo: x.recaudo === null || x.recaudo === undefined ? null : Number(x.recaudo),
        ultimo_motivo: (x.ultimo_motivo as string | null) ?? null,
      });
    }
  }
  const { data: cierres } = await supabase.from("ven_cierres").select("periodo");
  const cerrados = new Set(((cierres ?? []) as { periodo: string }[]).map((c) => String(c.periodo).slice(0, 7)));

  let entregadas = 0;
  let devueltas = 0;
  const ahora = new Date().toISOString();
  for (const o of ordenes) {
    const c = cambioDeEntrega(o, monday.get(o.id) ?? null, guias.get(o.id) ?? null, cerrados);
    if (!c) continue;
    const { data: hecho, error } = await supabase.from("ven_ordenes").update({ ...c.set, actualizado_en: ahora }).eq("id", o.id).eq("fase", "despachada").select("id");
    if (error) throw new Error(`Orden ${o.numero}: ${error.message}`);
    if (!hecho?.length) continue;
    await supabase.from("ven_orden_eventos").insert({ orden_id: o.id, tipo: "fase", fase_antes: "despachada", fase_despues: c.fase, detalle: c.detalle, usuario: c.fuente === "monday" ? "Monday (entregas de ciudad)" : "Servientrega (SISCORE)" });
    if (c.fase === "entregada") entregadas++;
    else devueltas++;
  }
  const resumen = `${entregadas} órdenes pasaron a entregadas y ${devueltas} a devueltas según Monday y Servientrega.`;
  if (entregadas + devueltas > 0)
    await supabase.from("historial_auditoria").insert({ usuario_nombre: quien, accion: "entregas_monday_servientrega", entidad: "ven_ordenes", entidad_id: null, detalle: resumen });
  return { entregadas, devueltas, resumen };
}
