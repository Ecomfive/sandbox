// Pedidos de tienda entregados o devueltos según Monday y Servientrega (12 nov 2026, pedido de Hernán: «identificar con Monday cuáles pedidos ya se
// entregaron en la ciudad y en Servientrega los de interior, e ir actualizando esos pedidos en el sistema»). Logística ya mostraba lo que dicen
// Monday (`mon_despachos`, ciudad) y SISCORE (`tienda_guias`, interior), pero la orden seguía «despachada» en todo lo demás. Aquí, cada vez que se lee
// Monday o Servientrega, una orden **despachada** que allá figura entregada pasa a `entregada` (con el día de la entrega) y una rechazada o devuelta a
// `devuelta`. Solo se mueven órdenes despachadas: lo que ya está entregado, devuelto o cancelado no se toca, y tampoco una orden congelada o de un mes
// cerrado. No se manda ningún aviso al cliente ni se mueve inventario (el stock salió al despachar). El contra entrega queda en Cobros como por
// remitir, con lo que cobró Servientrega (recaudo) si lo dice (Hernán: «que salgan pendientes»). La regla, pura y con prueba: `cambioDeEntrega`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { mismaTiendaUnidad } from "./ordenes-finanzas";
import { formaDePago, esDesintegrado, prioridadDespacho } from "@/lib/monday/columnas";

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
  /** Del tablero de devoluciones: lo que decidieron los asesores (DESINTEGRADO…) y por qué («3er msj sin respuesta»): la evidencia de que se llamó al cliente. */
  estado_asesores?: string | null;
  observaciones_asesores?: string | null;
  /** Cómo pagó el cliente según el repartidor (EFECTIVO, YAPPY…) y cuánto cobró (14 nov 2026, migración 0295). */
  forma_pago?: string | null;
  monto_cobrado?: number | null;
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
  fase: "entregada" | "devuelta" | "cancelada";
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
  const cerrado = cambioCerrado(o, monday, guia, mesesCerrados);
  if (!cerrado || o.fase === "despachada") return cerrado;
  // Sin despachar en el sistema (por confirmar o confirmada) y Monday o Servientrega ya lo cerraron (Hernán, 13 nov 2026: «si en Monday dice algo, lo
  // asignamos»): entregado pasa a entregada; devuelto o rechazado (DESINTEGRADO/RECHAZADO de los asesores) se cancela, porque nunca se confirmó.
  if (cerrado.fase === "entregada") return { ...cerrado, detalle: `${cerrado.detalle} (estaba ${FASE_TEXTO[o.fase ?? ""] ?? o.fase})` };
  const set: Record<string, unknown> = { fase: "cancelada", motivo_cancelacion: cerrado.set.motivo_cancelacion, cod_esperado: null };
  if (cerrado.set.transportista && !o.transportista) set.transportista = cerrado.set.transportista;
  return { fase: "cancelada", fuente: cerrado.fuente, set, detalle: `${cerrado.detalle} (estaba ${FASE_TEXTO[o.fase ?? ""] ?? o.fase}: se cancela)` };
}

/** Las fases que Monday o Servientrega pueden cerrar: la despachada y la que todavía no se despachó en el sistema. */
export const FASES_ABIERTAS = ["despachada", "por_confirmar", "confirmada"] as const;
const FASE_TEXTO: Record<string, string> = { por_confirmar: "por confirmar", confirmada: "confirmada" };

function cambioCerrado(o: OrdenParaEntrega, monday: DatoMonday | null, guia: DatoGuia | null, mesesCerrados: Set<string>): CambioEntrega | null {
  if (!(FASES_ABIERTAS as readonly string[]).includes(o.fase ?? "") || o.congelada) return null;
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
    // Cómo pagó y cuánto cobró el repartidor (14 nov 2026): la «FORMA DE PAGO» de la Matriz.
    const pago = formaDePago(monday.forma_pago);
    if (pago) set.forma_pago_entrega = pago;
    if (cod && monday.monto_cobrado) set.cod_cobrado = monday.monto_cobrado;
    return { fase: "entregada", fuente: "monday", set, detalle: `Monday: ${monday.estado ?? "ENTREGADO"}${monday.courier ? ` · ${monday.courier}` : ""}${monday.fecha ? ` · ${monday.fecha}` : ""}${monday.forma_pago ? ` · ${monday.forma_pago}` : ""}` };
  }
  if (monday.estado_grupo === "rechazado") {
    const repartidor = `${monday.estado ?? "RECHAZADO"}${monday.causa_rechazo ? ` (${monday.causa_rechazo})` : ""}`;
    const motivo = (esDesintegrado(monday.estado_asesores)
      ? `Monday · asesores: ${monday.estado_asesores}${monday.observaciones_asesores ? ` (${monday.observaciones_asesores})` : ""} · repartidor: ${repartidor}`
      : `Monday: ${repartidor}`
    ).slice(0, 300);
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
export async function actualizarEntregas(supabase: SupabaseClient, quien = "Sistema", limite = Number.POSITIVE_INFINITY): Promise<{ entregadas: number; devueltas: number; resumen: string }> {
  const ordenes: OrdenParaEntrega[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabase
      .from("ven_ordenes")
      .select("id, numero, fase, fecha, congelada, cod_esperado, transportista, guia")
      .in("fase", [...FASES_ABIERTAS])
      .order("id")
      .range(d, d + 999);
    if (error) throw new Error(`Órdenes abiertas: ${error.message}`);
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
      supabase
        .from("mon_despachos")
        .select("orden_id, estado, estado_grupo, courier, causa_rechazo, fecha_despacho, fecha_entrega, actualizado_monday, estado_asesores, observaciones_asesores, forma_pago, monto_cobrado")
        .in("orden_id", parte)
        .then((r) =>
          // Sin la migración 0295, sin la forma de pago (Monday sigue contando).
          r.error && /forma_pago|monto_cobrado/.test(r.error.message)
            ? supabase.from("mon_despachos").select("orden_id, estado, estado_grupo, courier, causa_rechazo, fecha_despacho, fecha_entrega, actualizado_monday, estado_asesores, observaciones_asesores").in("orden_id", parte)
            : r,
        ),
      supabase.from("tienda_guias").select("orden_id, guia, estado, estado_grupo, fecha_estado, fecha_emision, recaudo, ultimo_motivo").in("orden_id", parte),
    ]);
    // Sin la tabla de una fuente (migración sin correr), esa fuente no cuenta.
    for (const x of (m.error ? [] : (m.data ?? [])) as Record<string, string | null>[]) {
      const fecha = x.fecha_entrega ?? x.fecha_despacho;
      // Manda un ENTREGADO, luego un DESINTEGRADO de los asesores y, entre lo demás, lo más reciente (`prioridadDespacho`).
      const clave = `${prioridadDespacho(x.estado_grupo, x.estado_asesores)}|${fecha ?? ""}|${x.actualizado_monday ?? ""}`;
      const previa = monday.get(String(x.orden_id));
      if (previa && previa.clave >= clave) continue;
      // El tablero de devoluciones no tiene fecha: la de su última actualización en Monday (cuando los asesores decidieron).
      const dia = fecha ?? (x.estado_asesores ? (x.actualizado_monday?.slice(0, 10) ?? null) : null);
      monday.set(String(x.orden_id), {
        clave,
        estado_grupo: String(x.estado_grupo),
        estado: x.estado,
        courier: x.courier,
        causa_rechazo: x.causa_rechazo,
        fecha: dia,
        estado_asesores: x.estado_asesores,
        observaciones_asesores: x.observaciones_asesores,
        forma_pago: x.forma_pago ?? null,
        monto_cobrado: x.monto_cobrado === null || x.monto_cobrado === undefined ? null : Number(x.monto_cobrado),
      });
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
  let canceladas = 0;
  const ahora = new Date().toISOString();
  // De 15 en 15 en paralelo y mirando el reloj (14 nov 2026: al unirse cientos de pedidos de Oferfy a la vez, uno por uno no cabía en los 60 s de
  // Vercel y la lectura quedaba cortada). Lo que no alcanza queda abierto y lo toma la próxima lectura.
  const cambios = ordenes.flatMap((o) => {
    const c = cambioDeEntrega(o, monday.get(o.id) ?? null, guias.get(o.id) ?? null, cerrados);
    return c ? [{ o, c }] : [];
  });
  let pendientes = 0;
  for (let i = 0; i < cambios.length; i += 15) {
    if (Date.now() > limite) {
      pendientes = cambios.length - i;
      break;
    }
    const hechos = await Promise.all(
      cambios.slice(i, i + 15).map(async ({ o, c }) => {
        const { data: hecho, error } = await supabase.from("ven_ordenes").update({ ...c.set, actualizado_en: ahora }).eq("id", o.id).eq("fase", String(o.fase)).select("id");
        if (error) throw new Error(`Orden ${o.numero}: ${error.message}`);
        if (!hecho?.length) return null;
        await supabase.from("ven_orden_eventos").insert({ orden_id: o.id, tipo: "fase", fase_antes: o.fase, fase_despues: c.fase, detalle: c.detalle, usuario: c.fuente === "monday" ? "Monday (entregas de ciudad)" : "Servientrega (SISCORE)" });
        return c.fase;
      }),
    );
    for (const f of hechos) {
      if (f === "entregada") entregadas++;
      else if (f === "cancelada") canceladas++;
      else if (f) devueltas++;
    }
  }
  const resumen = `${entregadas} órdenes pasaron a entregadas y ${devueltas} a devueltas según Monday y Servientrega.${canceladas ? ` ${canceladas} sin despachar se cancelaron (Monday las cerró).` : ""}${pendientes ? ` Faltan ${pendientes}: siguen en la próxima lectura.` : ""}`;
  if (entregadas + devueltas + canceladas > 0)
    await supabase.from("historial_auditoria").insert({ usuario_nombre: quien, accion: "entregas_monday_servientrega", entidad: "ven_ordenes", entidad_id: null, detalle: resumen });
  return { entregadas, devueltas, resumen };
}

/**
 * Completa en los pedidos lo que Monday y Servientrega saben y el pedido no tiene (14 nov 2026, al comparar con el Excel Matriz): la forma de pago y lo
 * cobrado de un ENTREGADO de Monday, y la fecha de despacho (el día del reparto en Monday o la emisión de la guía de Servientrega) de los que salieron
 * sin la fecha de Shopify. Solo las tiendas creadas en el sistema. Nunca cambia la fase ni pisa un dato que ya está. Devuelve cuántos pedidos tocó.
 */
export async function completarDatosEntrega(supabase: SupabaseClient, limite = Number.POSITIVE_INFINITY): Promise<number> {
  const [{ data: tiendas }, { data: unidades }] = await Promise.all([supabase.from("tiendas").select("nombre"), supabase.from("fin_unidades").select("id, nombre").eq("clase", "tienda")]);
  const mias = ((unidades ?? []) as { id: string; nombre: string }[]).filter((u) => ((tiendas ?? []) as { nombre: string }[]).some((t) => mismaTiendaUnidad(t.nombre, u.nombre))).map((u) => u.id);
  if (!mias.length) return 0;
  type Falta = { id: string; fase: string; cod_esperado: number | null; cod_cobrado: number | null; forma_pago_entrega: string | null; despachada_en: string | null; fecha_envio: string | null };
  const faltan: Falta[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabase
      .from("ven_ordenes")
      .select("id, fase, cod_esperado, cod_cobrado, forma_pago_entrega, despachada_en, fecha_envio")
      .in("unidad_id", mias)
      .in("fase", ["despachada", "entregada", "devuelta"])
      .or("despachada_en.is.null,and(fase.eq.entregada,forma_pago_entrega.is.null)")
      .order("id")
      .range(d, d + 999);
    if (error) return 0; // sin la migración 0295
    faltan.push(...((data ?? []) as Falta[]));
    if ((data ?? []).length < 1000) break;
  }
  const cambios: { id: string; set: Record<string, unknown> }[] = [];
  for (let i = 0; i < faltan.length; i += 200) {
    const parte = faltan.slice(i, i + 200);
    const ids = parte.map((o) => o.id);
    const [m, g] = await Promise.all([
      supabase.from("mon_despachos").select("orden_id, estado_grupo, fecha_despacho, forma_pago, monto_cobrado, actualizado_monday").in("orden_id", ids),
      supabase.from("tienda_guias").select("orden_id, fecha_emision").in("orden_id", ids),
    ]);
    const monday = new Map<string, Record<string, unknown>[]>();
    for (const x of (m.data ?? []) as Record<string, unknown>[]) monday.set(String(x.orden_id), [...(monday.get(String(x.orden_id)) ?? []), x]);
    const emision = new Map<string, string>();
    for (const x of (g.data ?? []) as Record<string, unknown>[]) {
      const f = x.fecha_emision as string | null;
      const previa = emision.get(String(x.orden_id));
      if (f && (!previa || f < previa)) emision.set(String(x.orden_id), f);
    }
    for (const o of parte) {
      const set = datosQueFaltan(o, monday.get(o.id) ?? [], emision.get(o.id) ?? null);
      if (set) cambios.push({ id: o.id, set });
    }
  }
  let hechos = 0;
  for (let i = 0; i < cambios.length; i += 15) {
    if (Date.now() > limite) break;
    const r = await Promise.all(cambios.slice(i, i + 15).map(({ id, set }) => supabase.from("ven_ordenes").update(set).eq("id", id)));
    hechos += r.filter((x) => !x.error).length;
  }
  return hechos;
}

/** Lo que se le completa a un pedido (pura): forma de pago y cobrado de su ENTREGADO más reciente en Monday; la fecha de despacho más temprana. */
export function datosQueFaltan(
  o: { fase: string; cod_esperado: number | null; cod_cobrado: number | null; forma_pago_entrega: string | null; despachada_en: string | null; fecha_envio: string | null },
  filasMonday: Record<string, unknown>[],
  emisionGuia: string | null,
): Record<string, unknown> | null {
  const set: Record<string, unknown> = {};
  if (o.fase === "entregada" && !o.forma_pago_entrega) {
    const entregado = filasMonday.filter((x) => x.estado_grupo === "entregado").sort((a, b) => String(b.actualizado_monday ?? "").localeCompare(String(a.actualizado_monday ?? "")))[0];
    const pago = formaDePago((entregado?.forma_pago as string | null) ?? null);
    if (pago) set.forma_pago_entrega = pago;
    const cobrado = entregado?.monto_cobrado === null || entregado?.monto_cobrado === undefined ? null : Number(entregado.monto_cobrado);
    if (Number(o.cod_esperado ?? 0) > 0 && o.cod_cobrado === null && cobrado) set.cod_cobrado = cobrado;
  }
  if (!o.despachada_en) {
    const dias = [emisionGuia, ...filasMonday.map((x) => x.fecha_despacho as string | null)].filter((d): d is string => !!d && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)).sort();
    if (dias[0]) {
      set.despachada_en = mediodia(dias[0]);
      if (!o.fecha_envio) set.fecha_envio = dias[0];
    }
  }
  return Object.keys(set).length ? set : null;
}
