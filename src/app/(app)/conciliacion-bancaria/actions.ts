"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoriaLote } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { leerReglas } from "@/lib/finanzas/guardar-libro";
import { reglaPara } from "@/lib/finanzas/clasificacion";
import { UNIDAD_SIN_ASIGNAR } from "@/lib/finanzas/libro-excel";
import { estadoDeLinea, type EstadoLinea } from "@/lib/conciliacion/emparejar";
import { ORIGEN_CONCILIACION, enTrozos, planIngresos, recalcularCuentaMes, SIN_MIGRACION_V2 } from "@/lib/conciliacion/guardar";
import { PREFIJO_INGRESO, movimientosIngreso } from "@/lib/conciliacion/ingreso";
import { etiquetaFuente } from "@/lib/conciliacion/cargar";
import { hoyPanama } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";

const MODULO = "conciliacion-bancaria";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES = /^\d{4}-\d{2}-01$/;
const MAX_LOTE = 500;

type Resultado<T = object> = ({ error: string } | ({ ok: true } & T));

/** Los ids que manda el navegador: todos con forma de UUID (si alguno no, se rechaza todo), sin repetir. */
const idsValidos = (ids: unknown): string[] | null => {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_LOTE) return null;
  if (!ids.every((x) => typeof x === "string" && UUID.test(x))) return null;
  return [...new Set(ids as string[])];
};
const usd = (n: number) => dinero(n, "USD", { decimales: 2 });
const ahora = () => new Date().toISOString();

function revalidar() {
  revalidatePath("/conciliacion-bancaria", "layout");
}

interface LineaBase {
  id: string;
  cuenta_id: string;
  fecha: string;
  descripcion: string;
  monto: number | string;
  estado: EstadoLinea;
  huella: string;
}

async function leerLineas(ids: string[]): Promise<LineaBase[]> {
  const supabase = createServiceClient();
  return enTrozos<LineaBase>(ids, (t) => supabase.from("conc_lineas").select("id, cuenta_id, fecha, descripcion, monto, estado, huella").in("id", t));
}

/** Un cambio a muchas filas, de a trozos (devuelve el primer error o null). */
async function cambiarEnTrozos(ids: string[], cambio: (t: string[]) => PromiseLike<{ error: { code?: string; message: string } | null }>) {
  for (let i = 0; i < ids.length; i += 150) {
    const { error } = await cambio(ids.slice(i, i + 150));
    if (error) return error;
  }
  return null;
}

/** Vuelve a calcular el estado de unas líneas según sus parejas (lo que confirmó o descartó una persona). */
async function actualizarEstados(ids: string[], quien: string | null): Promise<void> {
  const supabase = createServiceClient();
  const [lineas, pares] = await Promise.all([
    leerLineas(ids),
    enTrozos<{ linea_id: string; estado: "sugerido" | "confirmado" | "descartado"; monto: number | string; principal: boolean }>(ids, (t) =>
      supabase.from("conc_pares").select("linea_id, estado, monto, principal").in("linea_id", t),
    ),
  ]);
  const porLinea = new Map<string, { estado: "sugerido" | "confirmado" | "descartado"; monto: number; principal: boolean }[]>();
  for (const p of pares) porLinea.set(p.linea_id as string, [...(porLinea.get(p.linea_id as string) ?? []), { estado: p.estado, monto: Number(p.monto), principal: p.principal }]);
  const grupos = new Map<EstadoLinea, string[]>();
  for (const l of lineas) {
    const nuevo = estadoDeLinea(l.estado, Number(l.monto), porLinea.get(l.id) ?? []);
    if (nuevo !== l.estado) grupos.set(nuevo, [...(grupos.get(nuevo) ?? []), l.id]);
  }
  for (const [estado, lista] of grupos) {
    const conciliada = estado === "conciliada";
    const error = await cambiarEnTrozos(lista, (t) =>
      supabase.from("conc_lineas").update({ estado, conciliada_en: conciliada ? ahora() : null, conciliada_por: conciliada ? quien : null, actualizado_en: ahora() }).in("id", t),
    );
    if (error) throw new Error("No se pudo actualizar el estado de las líneas.");
  }
}

/** «Buscar coincidencias»: vuelve a proponer para las líneas sin conciliar de una cuenta en un mes. */
export async function buscarCoincidencias(cuentaId: string, mes: string): Promise<Resultado<{ auto: number; sugeridas: number; pendientes: number }>> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof cuentaId !== "string" || !UUID.test(cuentaId) || typeof mes !== "string" || !MES.test(mes)) return { error: "Cuenta o mes inválidos." };
    const r = await recalcularCuentaMes(createServiceClient(), cuentaId, mes);
    revalidar();
    return { ok: true, auto: r.auto, sugeridas: r.sugeridas, pendientes: r.pendientes };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo buscar coincidencias." };
  }
}

/**
 * Confirma una propuesta de una línea (o, sin `grupo`, la de más puntaje de cada línea). Las demás propuestas de esas
 * líneas se descartan. Una parte que otra línea ya tiene confirmada no se puede confirmar dos veces (lo impide la base).
 */
export async function confirmarPropuestas(seleccion: { lineaId: string; grupo?: string }[]): Promise<Resultado<{ confirmadas: number; sinPropuesta: number }>> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!Array.isArray(seleccion) || !seleccion.length || seleccion.length > MAX_LOTE) return { error: "Selección inválida." };
    const pedidos = seleccion.filter((s) => s && typeof s.lineaId === "string" && UUID.test(s.lineaId) && (s.grupo === undefined || typeof s.grupo === "string"));
    if (pedidos.length !== seleccion.length) return { error: "Selección inválida." };
    const ids = [...new Set(pedidos.map((s) => s.lineaId))];
    const supabase = createServiceClient();
    const pares = await enTrozos<{ id: string; linea_id: string; grupo: string; puntaje: number; detalle: string | null; estado: string; principal: boolean }>(ids, (t) =>
      supabase.from("conc_pares").select("id, linea_id, grupo, puntaje, detalle, estado, principal").in("linea_id", t).eq("estado", "sugerido"),
    );
    const elegido = new Map<string, { grupo: string; detalle: string }>();
    for (const s of pedidos) {
      const deLinea = (pares ?? []).filter((p) => p.linea_id === s.lineaId);
      // Sin grupo: la propuesta elegida de la línea (no una alternativa).
      const g = s.grupo ? deLinea.find((p) => p.grupo === s.grupo) : deLinea.find((p) => p.principal);
      if (g) elegido.set(s.lineaId, { grupo: g.grupo as string, detalle: (g.detalle as string | null) ?? "" });
    }
    const confirmar = (pares ?? []).filter((p) => elegido.get(p.linea_id as string)?.grupo === p.grupo).map((p) => p.id as string);
    const descartar = (pares ?? []).filter((p) => elegido.has(p.linea_id as string) && elegido.get(p.linea_id as string)!.grupo !== p.grupo).map((p) => p.id as string);
    if (confirmar.length) {
      const r = await cambiarEnTrozos(confirmar, (t) => supabase.from("conc_pares").update({ estado: "confirmado", confirmado_en: ahora(), confirmado_por: usuario.id }).in("id", t));
      if (r) {
        return {
          error: r.code === "23505" ? "Una de las partes ya está conciliada con otra línea. Vuelve a buscar coincidencias." : "No se pudo confirmar.",
        };
      }
    }
    await cambiarEnTrozos(descartar, (t) => supabase.from("conc_pares").update({ estado: "descartado" }).in("id", t));
    const conciliadas = [...elegido.keys()];
    if (conciliadas.length) await actualizarEstados(conciliadas, usuario.id);
    const lineas = await leerLineas(conciliadas);
    await registrarAuditoriaLote(
      lineas.map((l) => ({
        accion: "conciliar_linea_banco",
        entidad: "conc_lineas",
        entidadId: l.id,
        detalle: `${l.fecha} · ${usd(Number(l.monto))} · ${elegido.get(l.id)?.detalle ?? ""}`,
      })),
    );
    revalidar();
    return { ok: true, confirmadas: conciliadas.length, sinPropuesta: ids.length - conciliadas.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo confirmar." };
  }
}

/** Descarta una propuesta: no se vuelve a proponer para esa línea. */
export async function descartarPropuesta(lineaId: string, grupo: string): Promise<Resultado> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (typeof lineaId !== "string" || !UUID.test(lineaId) || typeof grupo !== "string" || grupo.length > 20_000) return { error: "Propuesta inválida." };
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("conc_pares").update({ estado: "descartado" }).eq("linea_id", lineaId).eq("grupo", grupo).eq("estado", "sugerido").select("detalle");
    if (error) return { error: "No se pudo descartar." };
    await actualizarEstados([lineaId], usuario.id);
    await registrarAuditoriaLote([{ accion: "descartar_propuesta_banco", entidad: "conc_lineas", entidadId: lineaId, detalle: (data?.[0]?.detalle as string | undefined) ?? "" }]);
    revalidar();
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo descartar." };
  }
}

/** «Ignorar»: la línea no se concilia (traspaso entre cuentas propias, ajuste del banco…). El motivo es obligatorio. */
export async function ignorarLineas(ids: unknown, motivo: unknown): Promise<Resultado<{ ignoradas: number }>> {
  try {
    await requireModuloEscritura(MODULO);
    const lista = idsValidos(ids);
    const texto = typeof motivo === "string" ? motivo.trim().slice(0, 200) : "";
    if (!lista) return { error: "Selección inválida." };
    if (!texto) return { error: "Escribe el motivo." };
    const supabase = createServiceClient();
    const lineas = (await leerLineas(lista)).filter((l) => l.estado !== "conciliada");
    if (!lineas.length) return { error: "Las líneas elegidas ya están conciliadas: deshaz la conciliación primero." };
    const error = await cambiarEnTrozos(
      lineas.map((l) => l.id),
      (t) => supabase.from("conc_lineas").update({ estado: "ignorada", motivo: texto, actualizado_en: ahora() }).in("id", t),
    );
    if (error) return { error: "No se pudo ignorar." };
    await registrarAuditoriaLote(
      lineas.map((l) => ({
        accion: "ignorar_linea_banco",
        entidad: "conc_lineas",
        entidadId: l.id,
        detalle: `${l.fecha} · ${usd(Number(l.monto))}`,
        antes: { Estado: l.estado },
        despues: { Estado: "ignorada", Motivo: texto },
      })),
    );
    revalidar();
    return { ok: true, ignoradas: lineas.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo ignorar." };
  }
}

/**
 * «Volver a pendiente»: deshace lo confirmado (sus parejas se borran y vuelven a estar libres) o lo ignorado. Un
 * movimiento creado en el libro desde la conciliación queda en el libro (se borra allí si sobra); el ingreso registrado
 * en la cuenta («Registrar ingreso») sí se borra, porque sale de lo conciliado.
 */
export async function reabrirLineas(ids: unknown): Promise<Resultado<{ reabiertas: number }>> {
  try {
    await requireModuloEscritura(MODULO);
    const lista = idsValidos(ids);
    if (!lista) return { error: "Selección inválida." };
    const supabase = createServiceClient();
    const lineas = (await leerLineas(lista)).filter((l) => l.estado === "conciliada" || l.estado === "ignorada");
    if (!lineas.length) return { ok: true, reabiertas: 0 };
    const deshacer = lineas.map((l) => l.id);
    const borrar = await cambiarEnTrozos(deshacer, (t) => supabase.from("conc_pares").delete().in("linea_id", t).eq("estado", "confirmado"));
    if (borrar) return { error: "No se pudo deshacer la conciliación." };
    const conIngreso = await enTrozos<{ id: string; huella: string }>(deshacer, (t) => supabase.from("conc_lineas").select("id, huella").in("id", t).not("ingreso_en", "is", null)).catch(
      () => [] as { id: string; huella: string }[],
    );
    for (const l of conIngreso) {
      const { error: e } = await supabase.from("fin_movimientos").delete().eq("origen", ORIGEN_CONCILIACION).like("origen_clave", `${PREFIJO_INGRESO}${l.huella}:%`);
      if (e) return { error: "No se pudo borrar el ingreso registrado de una línea." };
    }
    if (conIngreso.length) {
      await cambiarEnTrozos(
        conIngreso.map((l) => l.id),
        (t) => supabase.from("conc_lineas").update({ ingreso_en: null, ingreso_por: null }).in("id", t),
      );
    }
    const error = await cambiarEnTrozos(deshacer, (t) =>
      supabase.from("conc_lineas").update({ estado: "pendiente", motivo: null, conciliada_en: null, conciliada_por: null, actualizado_en: ahora() }).in("id", t),
    );
    if (error) return { error: "No se pudo volver a pendiente." };
    await actualizarEstados(deshacer, null);
    await registrarAuditoriaLote(
      lineas.map((l) => ({
        accion: "reabrir_linea_banco",
        entidad: "conc_lineas",
        entidadId: l.id,
        detalle: `${l.fecha} · ${usd(Number(l.monto))}`,
        antes: { Estado: l.estado },
        despues: { Estado: "pendiente" },
      })),
    );
    revalidar();
    return { ok: true, reabiertas: lineas.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo volver a pendiente." };
  }
}

/**
 * «Crear en el libro»: lo que el banco tiene y el libro no. Cada línea pendiente o sugerida se carga como movimiento
 * del libro (origen «conciliacion», corregido a mano: reimportar el Excel no lo pisa), sin tienda ni tipo salvo que una
 * regla de clasificación los dé (queda en «Por clasificar» del libro), y la línea queda conciliada con él.
 * Un crédito entra al flujo pero no al EERR: los ingresos por venta ya están en el libro por tienda (ver FINANZAS-360.md).
 */
export async function crearEnLibro(ids: unknown): Promise<Resultado<{ creados: number }>> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    // Escribir en el libro pide además poder modificar el Libro de movimientos.
    if (!usuario.modulos.includes("libro-movimientos") || usuario.modulosSoloLectura.includes("libro-movimientos")) {
      return { error: "Para crear movimientos hace falta poder modificar el Libro de movimientos." };
    }
    const lista = idsValidos(ids);
    if (!lista) return { error: "Selección inválida." };
    const supabase = createServiceClient();
    const lineas = (await leerLineas(lista)).filter((l) => l.estado === "pendiente" || l.estado === "sugerida");
    if (!lineas.length) return { error: "Solo se crean en el libro las líneas pendientes o sugeridas." };
    const [sinAsignar, reglas] = await Promise.all([
      supabase.from("fin_unidades").select("id").eq("nombre", UNIDAD_SIN_ASIGNAR).maybeSingle(),
      leerReglas(supabase),
    ]);
    if (!sinAsignar.data) return { error: `Falta la unidad «${UNIDAD_SIN_ASIGNAR}» del libro (migración 0901).` };
    const huellaDe = new Map(lineas.map((l) => [l.id, l.huella]));
    const hoy = hoyPanama();
    const filas = lineas.map((l) => {
      const monto = Number(l.monto);
      const regla = reglaPara(l.descripcion, reglas);
      return {
        periodo: `${String(l.fecha).slice(0, 7)}-01`,
        fecha_registro: hoy,
        fecha_pago: String(l.fecha).slice(0, 10),
        unidad_id: regla?.unidad_id ?? (sinAsignar.data!.id as string),
        tipo_id: regla?.tipo_id ?? null,
        regla_id: regla?.id ?? null,
        descripcion: l.descripcion.slice(0, 500) || "Movimiento del banco",
        monto: Math.abs(monto),
        en_eerr: monto < 0,
        en_flujo: true,
        cuenta_id: l.cuenta_id,
        origen: ORIGEN_CONCILIACION,
        origen_clave: `conc:${huellaDe.get(l.id) ?? l.id}`,
        editado_a_mano: true,
        editado_por: usuario.id,
        editado_en: ahora(),
        creado_por: usuario.id,
      };
    });
    const { data: creados, error } = await supabase.from("fin_movimientos").upsert(filas, { onConflict: "origen_clave" }).select("id, origen_clave");
    if (error || !creados) return { error: `No se pudo crear en el libro: ${error?.message ?? "sin respuesta"}` };
    const movDe = new Map(creados.map((c) => [c.origen_clave as string, c.id as string]));
    // Las sugerencias de esas líneas sobran: quedan conciliadas con el movimiento nuevo.
    await cambiarEnTrozos(
      lineas.map((l) => l.id),
      (t) => supabase.from("conc_pares").update({ estado: "descartado" }).in("linea_id", t).eq("estado", "sugerido"),
    );
    const pares = lineas.map((l) => ({
      linea_id: l.id,
      clase: "movimiento",
      movimiento_id: movDe.get(`conc:${huellaDe.get(l.id) ?? l.id}`)!,
      monto: Number(l.monto),
      puntaje: 100,
      metodo: "exacto",
      grupo: `${l.id}|creado`,
      detalle: "Creado en el libro",
      estado: "confirmado",
      confirmado_en: ahora(),
      confirmado_por: usuario.id,
    }));
    const p = await supabase.from("conc_pares").insert(pares.filter((x) => x.movimiento_id));
    if (p.error) return { error: "El movimiento se creó, pero no se pudo conciliar la línea. Búscalo en el libro." };
    await actualizarEstados(lineas.map((l) => l.id), usuario.id);
    await registrarAuditoriaLote([
      ...lineas.map((l) => ({
        accion: "crear_movimiento_desde_banco",
        entidad: "conc_lineas",
        entidadId: l.id,
        detalle: `${l.fecha} · ${usd(Number(l.monto))} · ${l.descripcion.slice(0, 80)}`,
      })),
      ...creados.map((c) => ({
        accion: "crear_movimiento_libro",
        entidad: "fin_movimientos",
        entidadId: c.id as string,
        detalle: "Creado desde la conciliación bancaria",
      })),
    ]);
    revalidar();
    revalidatePath("/libro-movimientos", "layout");
    return { ok: true, creados: creados.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear en el libro." };
  }
}

/**
 * «Registrar ingreso»: el cobro de una línea conciliada (crédito cubierto por cobros, órdenes o deliverys) pasa de «sin
 * forma de pago» a la cuenta del banco en el libro, por tienda, con un traspaso que no toca el EERR (migración 0916,
 * `src/lib/conciliacion/ingreso.ts`). Pide además poder modificar el Libro de movimientos.
 */
export async function registrarIngresos(ids: unknown): Promise<Resultado<{ registradas: number; movimientos: number }>> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!usuario.modulos.includes("libro-movimientos") || usuario.modulosSoloLectura.includes("libro-movimientos")) {
      return { error: "Para registrar ingresos hace falta poder modificar el Libro de movimientos." };
    }
    const lista = idsValidos(ids);
    if (!lista) return { error: "Selección inválida." };
    const supabase = createServiceClient();
    const planes = await planIngresos(supabase, lista);
    if (!planes.length) return { error: "Solo se registran las líneas de crédito conciliadas con cobros, órdenes o deliverys, una vez." };
    const tipo = await supabase.from("fin_tipos").select("id").eq("seccion", "ingresos").eq("nombre", "Ingresos").maybeSingle();
    if (!tipo.data) return { error: "Falta el tipo «Ingresos» del libro (migración 0901)." };
    const hoy = hoyPanama();
    const filas = planes.flatMap((p) =>
      movimientosIngreso(
        { huella: p.huella, fecha: p.fecha, cuentaId: p.cuentaId, cuenta: p.cuenta, descripcion: p.descripcion },
        p.reparto,
        { tipoIngresosId: tipo.data!.id as string, usuarioId: usuario.id, hoy, ahora: ahora(), origen: ORIGEN_CONCILIACION },
      ),
    );
    const { data: creados, error } = await supabase.from("fin_movimientos").upsert(filas, { onConflict: "origen_clave" }).select("id, origen_clave");
    if (error || !creados) return { error: `No se pudo registrar en el libro: ${error?.message ?? "sin respuesta"}` };
    const marca = await cambiarEnTrozos(
      planes.map((p) => p.lineaId),
      (t) => supabase.from("conc_lineas").update({ ingreso_en: ahora(), ingreso_por: usuario.id }).in("id", t),
    );
    if (marca) return { error: SIN_MIGRACION_V2 };
    await registrarAuditoriaLote([
      ...planes.map((p) => ({
        accion: "registrar_ingreso_banco",
        entidad: "conc_lineas",
        entidadId: p.lineaId,
        detalle: `${p.fecha} · ${usd(p.monto)} · ${p.reparto.map((r) => `${r.tienda} ${usd(r.monto)}`).join(", ")} en ${p.cuenta}`,
      })),
      ...creados.map((c) => ({
        accion: "crear_movimiento_libro",
        entidad: "fin_movimientos",
        entidadId: c.id as string,
        detalle: "Ingreso registrado en su cuenta desde la conciliación bancaria",
      })),
    ]);
    revalidar();
    revalidatePath("/libro-movimientos", "layout");
    revalidatePath("/flujo-caja", "layout");
    return { ok: true, registradas: planes.length, movimientos: creados.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo registrar el ingreso." };
  }
}

// ---------------------------------------------------------------------------------------------
// Lectura para la ficha
// ---------------------------------------------------------------------------------------------

export interface ParteDetalle {
  clase: "movimiento" | "cobro" | "orden" | "delivery";
  fecha: string | null;
  texto: string;
  monto: number;
  comision: number;
}

export interface PropuestaDetalle {
  grupo: string;
  detalle: string;
  puntaje: number;
  metodo: string;
  estado: "sugerido" | "confirmado";
  auto: boolean;
  /** De dónde sale: «Órdenes de las tiendas», «Cruce del Excel», «Deliverys»… */
  fuente: string;
  partes: ParteDetalle[];
}

/** Lo que haría «Registrar ingreso» con la línea (solo si se puede). */
export interface IngresoPropuesto {
  cuenta: string;
  tiendas: { tienda: string; monto: number }[];
}

const ETIQUETA_FUENTE: Record<string, string> = { yappy: "Yappy", mipos: "MiPOS", servientrega: "Servientrega" };
const formatoCorto = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** Las propuestas de una línea con el detalle de cada parte (movimiento, cobro u orden). Basta poder abrir el módulo. */
export async function obtenerPropuestasLinea(id: string): Promise<{ error: string } | { propuestas: PropuestaDetalle[]; ingreso: IngresoPropuesto | null }> {
  try {
    await requireModulo(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Línea inválida." };
    const supabase = createServiceClient();
    const { data: pares, error } = await supabase
      .from("conc_pares")
      .select("grupo, detalle, puntaje, metodo, estado, auto, clase, movimiento_id, cobro_id, orden_id, orden_fuente, del_repartidor_id, del_semana, del_unidad_id, monto, comision")
      .eq("linea_id", id)
      .neq("estado", "descartado")
      .limit(400);
    if (error) return { error: "No se pudieron leer las propuestas." };
    const ids = (c: string) => [...new Set((pares ?? []).map((p) => p[c as keyof typeof p] as string | null).filter((x): x is string => !!x))];
    const [movs, cobros, ordenes, repartidores, unidades, plan] = await Promise.all([
      ids("movimiento_id").length
        ? supabase.from("fin_movimientos").select("id, fecha_pago, descripcion, fin_unidades(nombre), fin_tipos(nombre)").in("id", ids("movimiento_id"))
        : Promise.resolve({ data: [] as never[] }),
      ids("cobro_id").length ? supabase.from("conc_fuentes_cobro").select("id, fuente, fecha, referencia, orden, tienda, lote").in("id", ids("cobro_id")) : Promise.resolve({ data: [] as never[] }),
      ids("orden_id").length ? supabase.from("conc_ordenes_fuente").select("id, numero, tienda, fecha, repartidor").in("id", ids("orden_id")) : Promise.resolve({ data: [] as never[] }),
      ids("del_repartidor_id").length ? supabase.from("del_repartidores").select("id, nombre").in("id", ids("del_repartidor_id")) : Promise.resolve({ data: [] as never[] }),
      ids("del_unidad_id").length ? supabase.from("fin_unidades").select("id, nombre").in("id", ids("del_unidad_id")) : Promise.resolve({ data: [] as never[] }),
      planIngresos(supabase, [id]).catch(() => []),
    ]);
    const nombreRep = new Map(((repartidores.data ?? []) as { id: string; nombre: string }[]).map((r) => [r.id, r.nombre]));
    const nombreUni = new Map(((unidades.data ?? []) as { id: string; nombre: string }[]).map((u) => [u.id, u.nombre]));
    const nombre = (v: unknown) => (Array.isArray(v) ? (v[0] as { nombre?: string } | undefined)?.nombre : (v as { nombre?: string } | null)?.nombre) ?? "—";
    const textoDe = new Map<string, { fecha: string | null; texto: string }>();
    for (const m of (movs.data ?? []) as Record<string, unknown>[]) {
      textoDe.set(m.id as string, { fecha: (m.fecha_pago as string | null) ?? null, texto: `${m.descripcion as string} · ${nombre(m.fin_unidades)} · ${nombre(m.fin_tipos)}` });
    }
    for (const c of (cobros.data ?? []) as Record<string, unknown>[]) {
      const partes = [ETIQUETA_FUENTE[c.fuente as string] ?? c.fuente, c.referencia, c.orden ? `orden ${c.orden}` : null, c.tienda].filter(Boolean);
      textoDe.set(c.id as string, { fecha: c.fecha as string, texto: partes.join(" · ") });
    }
    for (const o of (ordenes.data ?? []) as Record<string, unknown>[]) {
      textoDe.set(o.id as string, { fecha: (o.fecha as string | null) ?? null, texto: [`Orden ${o.numero as string}`, o.tienda, o.repartidor].filter(Boolean).join(" · ") });
    }
    const grupos = new Map<string, PropuestaDetalle>();
    const clasesDe = new Map<string, { clase: string; orden_fuente: string | null }[]>();
    for (const p of pares ?? []) clasesDe.set(p.grupo as string, [...(clasesDe.get(p.grupo as string) ?? []), { clase: p.clase as string, orden_fuente: p.orden_fuente as string | null }]);
    for (const p of pares ?? []) {
      const g = grupos.get(p.grupo as string) ?? {
        grupo: p.grupo as string,
        detalle: (p.detalle as string | null) ?? "—",
        puntaje: p.puntaje as number,
        metodo: p.metodo as string,
        estado: p.estado as PropuestaDetalle["estado"],
        auto: p.auto as boolean,
        fuente: etiquetaFuente(clasesDe.get(p.grupo as string) ?? []),
        partes: [],
      };
      const id = (p.movimiento_id ?? p.cobro_id ?? p.orden_id) as string | null;
      const t = id
        ? textoDe.get(id)
        : {
            fecha: p.del_semana as string | null,
            texto: [
              `Deliverys · ${nombreRep.get(p.del_repartidor_id as string) ?? "—"}`,
              `semana del ${formatoCorto(String(p.del_semana))}`,
              p.del_unidad_id ? (nombreUni.get(p.del_unidad_id as string) ?? "—") : "semana completa",
            ].join(" · "),
          };
      g.partes.push({ clase: p.clase as ParteDetalle["clase"], fecha: t?.fecha ? String(t.fecha).slice(0, 10) : null, texto: t?.texto ?? "—", monto: Number(p.monto), comision: Number(p.comision) });
      grupos.set(g.grupo, g);
    }
    const [primero] = plan;
    return {
      propuestas: [...grupos.values()].sort((a, b) => Number(b.estado === "confirmado") - Number(a.estado === "confirmado") || b.puntaje - a.puntaje),
      ingreso: primero ? { cuenta: primero.cuenta, tiendas: primero.reparto.map((r) => ({ tienda: r.tienda, monto: r.monto })) } : null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron leer las propuestas." };
  }
}

export async function obtenerHistorialLinea(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Línea inválida." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "conc_lineas")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}
