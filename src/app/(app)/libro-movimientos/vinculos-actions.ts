"use server";

// Lo que se liga a un movimiento del libro desde su ficha (pedido de María José, Oceans, 19 nov 2026; migración 0984):
//  · Reparto elegido: las tiendas que asumen el gasto y su porcentaje (`fin_movimiento_reparto`).
//  · Lo pagó otra empresa: la deuda que genera en Tesorería › Préstamos del grupo (`fin_grupo_movimientos`, origen 'libro').
//  · Bien de uso: su ficha en Bienes de uso (`fin_bienes_uso.movimiento_id`), nueva o una que ya existía.
// Devuelven el error como valor.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoARegistros } from "@/lib/finanzas/acceso-tienda";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad, veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { montosDelReparto, validarReparto, type ParteReparto } from "@/lib/finanzas/reparto-elegido";
import { TIPOS_BIEN, VIDA_UTIL, type TipoBien } from "@/lib/finanzas/bienes-uso";

const MODULO = "libro-movimientos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (v: number) => `US$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FALTA_MIGRACION = "Falta correr la migración 0984 en Supabase.";

export interface Opcion {
  id: string;
  nombre: string;
}

export interface VinculosMovimiento {
  /** Tiendas de la misma entidad que la persona puede ver (para el reparto). */
  tiendas: Opcion[];
  reparto: ParteReparto[];
  /** La empresa dueña del gasto en Préstamos del grupo (la de la entidad de su tienda), si existe. */
  duena: Opcion | null;
  /** Quién lo pagó (si lo pagó otra empresa o un socio). */
  pagador: Opcion | null;
  /** Empresas y socios del grupo que pueden haberlo pagado (sin la dueña). */
  pagadores: Opcion[];
  /** Se puede marcar «lo pagó otra empresa»: escribe en Tesorería y ve toda la empresa. */
  puedeEmpresas: boolean;
  bien: Opcion | null;
  /** Bienes de uso sin movimiento, para vincular uno que ya existe. */
  bienesSueltos: Opcion[];
  puedeBienes: boolean;
  /** Sin la migración 0984: el bloque avisa y no ofrece nada. */
  faltaMigracion: boolean;
  /** Repartos guardados con nombre cuyas tiendas son todas de esta entidad (migración 0986; vacío sin ella). */
  plantillas: { id: string; nombre: string; partes: ParteReparto[] }[];
}

interface Movimiento {
  id: string;
  unidad_id: string;
  monto: number;
  descripcion: string;
  fecha_pago: string | null;
  periodo: string;
  en_flujo: boolean;
  es_bien_de_uso: boolean;
  entidad_id: string | null;
}

async function leerMovimiento(supabase: ReturnType<typeof createServiceClient>, id: string): Promise<Movimiento | { error: string }> {
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Movimiento inválido." };
  const acceso = await sinAccesoARegistros(supabase, "fin_movimientos", [id]);
  if (acceso) return { error: acceso };
  const { data, error } = await supabase
    .from("fin_movimientos")
    .select("id, unidad_id, monto, descripcion, fecha_pago, periodo, en_flujo, es_bien_de_uso, fin_unidades(entidad_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "El movimiento ya no existe." };
  const unidad = (Array.isArray(data.fin_unidades) ? data.fin_unidades[0] : data.fin_unidades) as { entidad_id?: string | null } | null;
  return {
    id: data.id as string,
    unidad_id: data.unidad_id as string,
    monto: Number(data.monto),
    descripcion: String(data.descripcion ?? ""),
    fecha_pago: (data.fecha_pago as string | null) ?? null,
    periodo: String(data.periodo),
    en_flujo: data.en_flujo === true,
    es_bien_de_uso: data.es_bien_de_uso === true,
    entidad_id: unidad?.entidad_id ?? null,
  };
}

/** Las tiendas de la entidad del movimiento que la persona puede ver. */
async function tiendasDeEntidad(supabase: ReturnType<typeof createServiceClient>, entidadId: string | null): Promise<Opcion[]> {
  const permitidas = await cargarTiendasPermitidas();
  let consulta = supabase.from("fin_unidades").select("id, nombre, entidad_id").eq("clase", "tienda").order("orden").order("nombre");
  if (entidadId) consulta = consulta.eq("entidad_id", entidadId);
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (data ?? []).filter((u) => puedeVerUnidad(permitidas, u.id as string)).map((u) => ({ id: u.id as string, nombre: u.nombre as string }));
}

/** Lo que muestra el bloque «Reparto, empresas y bienes» de la ficha. */
export async function obtenerVinculosMovimiento(id: string): Promise<{ error: string } | VinculosMovimiento> {
  try {
    const usuario = await requireModulo(MODULO);
    const supabase = createServiceClient();
    const m = await leerMovimiento(supabase, id);
    if ("error" in m) return m;
    const escribe = (modulo: string) => usuario.modulos.includes(modulo) && !usuario.modulosSoloLectura.includes(modulo);
    const todaLaEmpresa = veTodaLaEmpresa(await cargarTiendasPermitidas());
    const [tiendas, reparto, partes, grupo, bien, sueltos, plantillas] = await Promise.all([
      tiendasDeEntidad(supabase, m.entidad_id),
      supabase.from("fin_movimiento_reparto").select("unidad_id, porcentaje").eq("movimiento_id", m.id),
      supabase.from("fin_grupo_partes").select("id, nombre, clase, entidad_id").eq("activo", true).order("orden"),
      supabase.from("fin_grupo_movimientos").select("id, acreedor_id").eq("movimiento_id", m.id).maybeSingle(),
      supabase.from("fin_bienes_uso").select("id, descripcion").eq("movimiento_id", m.id).maybeSingle(),
      supabase.from("fin_bienes_uso").select("id, descripcion, fecha_alta").is("movimiento_id", null).order("fecha_alta", { ascending: false }).limit(200),
      supabase.from("fin_reparto_plantillas").select("id, nombre, partes").order("nombre"),
    ]);
    if (reparto.error || grupo.error || bien.error) {
      return { tiendas, reparto: [], duena: null, pagador: null, pagadores: [], puedeEmpresas: false, bien: null, bienesSueltos: [], puedeBienes: false, faltaMigracion: true, plantillas: [] };
    }
    const listaPartes = (partes.data ?? []).filter((p) => p.clase === "empresa" || p.clase === "socio");
    const duenaFila = m.entidad_id ? listaPartes.find((p) => p.entidad_id === m.entidad_id) : undefined;
    const pagadorFila = grupo.data ? listaPartes.find((p) => p.id === grupo.data!.acreedor_id) : undefined;
    return {
      tiendas,
      reparto: (reparto.data ?? []).map((r) => ({ unidadId: r.unidad_id as string, porcentaje: Number(r.porcentaje) })),
      duena: duenaFila ? { id: duenaFila.id as string, nombre: duenaFila.nombre as string } : null,
      pagador: pagadorFila ? { id: pagadorFila.id as string, nombre: pagadorFila.nombre as string } : null,
      pagadores: listaPartes.filter((p) => p.id !== duenaFila?.id).map((p) => ({ id: p.id as string, nombre: p.nombre as string })),
      puedeEmpresas: escribe(MODULO) && escribe("tesoreria") && todaLaEmpresa,
      bien: bien.data ? { id: bien.data.id as string, nombre: bien.data.descripcion as string } : null,
      bienesSueltos: (sueltos.data ?? []).map((b) => ({ id: b.id as string, nombre: `${b.descripcion} · ${String(b.fecha_alta).slice(0, 7)}` })),
      puedeBienes: escribe(MODULO) && escribe("bienes-de-uso"),
      faltaMigracion: false,
      plantillas: plantillasDe(plantillas.data, new Set(tiendas.map((t) => t.id))),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el movimiento." };
  }
}

/** Las plantillas que se pueden usar con estas tiendas (todas sus tiendas están en la lista y son válidas). */
function plantillasDe(filas: { id: unknown; nombre: unknown; partes: unknown }[] | null, tiendas: Set<string>) {
  const salida: VinculosMovimiento["plantillas"] = [];
  for (const f of filas ?? []) {
    const v = validarReparto(f.partes, tiendas);
    if ("error" in v || !v.partes.length) continue;
    salida.push({ id: String(f.id), nombre: String(f.nombre), partes: v.partes });
  }
  return salida;
}

/** Guarda el reparto con un nombre para usarlo en otros movimientos (mismo nombre = lo reemplaza). */
export async function guardarPlantillaReparto(movimientoId: string, nombre: string, partes: unknown): Promise<{ error: string } | { id: string; nombre: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const m = await leerMovimiento(supabase, movimientoId);
    if ("error" in m) return m;
    const limpio = String(nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (limpio.length < 2) return { error: "Ponle un nombre a la plantilla." };
    const tiendas = await tiendasDeEntidad(supabase, m.entidad_id);
    const v = validarReparto(partes, new Set(tiendas.map((t) => t.id)));
    if ("error" in v) return v;
    if (!v.partes.length) return { error: "Elige las tiendas antes de guardar la plantilla." };
    const { data: existe, error: ee } = await supabase.from("fin_reparto_plantillas").select("id").ilike("nombre", limpio.replace(/[%_]/g, "\\$&")).maybeSingle();
    if (ee) return { error: "Falta correr la migración 0986 en Supabase." };
    const fila = { nombre: limpio, partes: v.partes, actualizado_en: new Date().toISOString() };
    const { data: guardada, error } = existe
      ? await supabase.from("fin_reparto_plantillas").update(fila).eq("id", existe.id).select("id").single()
      : await supabase.from("fin_reparto_plantillas").insert({ ...fila, creado_por: usuario.id }).select("id").single();
    if (error || !guardada) return { error: `No se pudo guardar la plantilla: ${error?.message ?? "sin respuesta"}` };
    const nombreTienda = (u: string) => tiendas.find((t) => t.id === u)?.nombre ?? "tienda";
    await registrarAuditoria({
      accion: "plantilla_reparto_libro",
      entidad: "fin_reparto_plantillas",
      detalle: `${limpio}: ${v.partes.map((p) => `${nombreTienda(p.unidadId)} ${p.porcentaje} %`).join(", ")}`,
    });
    return { id: guardada.id as string, nombre: limpio };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la plantilla." };
  }
}

/** Borra una plantilla de reparto (no toca los movimientos que ya la usaron: su reparto quedó guardado en cada uno). */
export async function eliminarPlantillaReparto(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Plantilla inválida." };
    const supabase = createServiceClient();
    const { data, error: el } = await supabase.from("fin_reparto_plantillas").select("nombre").eq("id", id).maybeSingle();
    if (el) return { error: "Falta correr la migración 0986 en Supabase." };
    if (!data) return {};
    const { error } = await supabase.from("fin_reparto_plantillas").delete().eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: "eliminar_plantilla_reparto", entidad: "fin_reparto_plantillas", entidadId: id, detalle: String(data.nombre) });
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo borrar la plantilla." };
  }
}

const revalidar = () => {
  revalidatePath("/libro-movimientos");
  revalidatePath("/estado-resultados");
};

/** Guarda las tiendas que asumen el movimiento (lista vacía = quitar el reparto elegido). */
export async function guardarRepartoMovimiento(id: string, partes: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const m = await leerMovimiento(supabase, id);
    if ("error" in m) return m;
    const tiendas = await tiendasDeEntidad(supabase, m.entidad_id);
    const v = validarReparto(partes, new Set(tiendas.map((t) => t.id)));
    if ("error" in v) return v;
    const { data: antes, error: ea } = await supabase.from("fin_movimiento_reparto").select("unidad_id, porcentaje").eq("movimiento_id", m.id);
    if (ea) return { error: FALTA_MIGRACION };
    const { error: ed } = await supabase.from("fin_movimiento_reparto").delete().eq("movimiento_id", m.id);
    if (ed) return { error: ed.message };
    if (v.partes.length) {
      const { error } = await supabase
        .from("fin_movimiento_reparto")
        .insert(v.partes.map((p) => ({ movimiento_id: m.id, unidad_id: p.unidadId, porcentaje: p.porcentaje, creado_por: usuario.id })));
      if (error) return { error: `No se pudo guardar: ${error.message}` };
    }
    const nombre = (u: string) => tiendas.find((t) => t.id === u)?.nombre ?? "tienda";
    const texto = (lista: { unidad_id: string; porcentaje: number }[]) =>
      lista.length ? lista.map((p) => `${nombre(p.unidad_id)} ${Number(p.porcentaje)} %`).join(", ") : "Sin reparto elegido";
    const montos = montosDelReparto(m.monto, v.partes);
    await registrarAuditoria({
      accion: "reparto_movimiento_libro",
      entidad: "fin_movimientos",
      entidadId: m.id,
      antes: { Reparto: texto((antes ?? []) as { unidad_id: string; porcentaje: number }[]) },
      despues: { Reparto: v.partes.length ? montos.map((x) => `${nombre(x.unidadId)} ${usd(x.monto)}`).join(", ") : "Sin reparto elegido" },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el reparto." };
  }
}

/**
 * «Lo pagó otra empresa»: la empresa (o el socio) que pagó le presta a la dueña del gasto lo que pagó; queda en Préstamos
 * del grupo ligado al movimiento. El movimiento sale del flujo de caja de la dueña (la plata salió de otra caja); al
 * quitarlo vuelve al flujo. `pagadorId` null lo quita.
 */
export async function marcarPagadoPorOtra(id: string, pagadorId: string | null): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    await requireModuloEscritura("tesoreria");
    if (!veTodaLaEmpresa(await cargarTiendasPermitidas())) return { error: "Solo para quien ve toda la empresa." };
    const supabase = createServiceClient();
    const m = await leerMovimiento(supabase, id);
    if ("error" in m) return m;
    const { data: actual, error: eg } = await supabase.from("fin_grupo_movimientos").select("id, acreedor_id").eq("movimiento_id", m.id).maybeSingle();
    if (eg) return { error: FALTA_MIGRACION };
    const { data: partes } = await supabase.from("fin_grupo_partes").select("id, nombre, clase, entidad_id").eq("activo", true);
    const lista = (partes ?? []).filter((p) => p.clase === "empresa" || p.clase === "socio");
    const duena = m.entidad_id ? lista.find((p) => p.entidad_id === m.entidad_id) : undefined;
    if (!duena) return { error: "La empresa de esta tienda no está en Préstamos del grupo." };
    const ahora = new Date().toISOString();

    if (pagadorId === null) {
      if (!actual) return {};
      const { error } = await supabase.from("fin_grupo_movimientos").delete().eq("id", actual.id).eq("origen", "libro");
      if (error) return { error: error.message };
      await supabase.from("fin_movimientos").update({ en_flujo: true, actualizado_en: ahora }).eq("id", m.id);
      await registrarAuditoria({
        accion: "quitar_pagado_por_otra_libro",
        entidad: "fin_movimientos",
        entidadId: m.id,
        antes: { "Lo pagó": lista.find((p) => p.id === actual.acreedor_id)?.nombre ?? "otra empresa", "Entra al flujo": "No" },
        despues: { "Lo pagó": duena.nombre, "Entra al flujo": "Sí" },
      });
      revalidar();
      revalidatePath("/tesoreria/grupo");
      return {};
    }

    if (typeof pagadorId !== "string" || !UUID.test(pagadorId)) return { error: "Elige quién lo pagó." };
    const pagador = lista.find((p) => p.id === pagadorId);
    if (!pagador || pagador.id === duena.id) return { error: "Elige otra empresa o un socio del grupo." };
    const fila = {
      acreedor_id: pagador.id,
      deudor_id: duena.id,
      tipo: "prestamo",
      fecha: m.fecha_pago ?? String(m.periodo).slice(0, 10),
      monto: m.monto,
      concepto: `Pagó un gasto del libro: ${m.descripcion || "sin descripción"}`.slice(0, 300),
      medio: "Pago de un gasto",
      origen: "libro",
      origen_clave: `libro:${m.id}`,
      movimiento_id: m.id,
      creado_por: usuario.id,
    };
    const { error } = actual
      ? await supabase.from("fin_grupo_movimientos").update(fila).eq("id", actual.id)
      : await supabase.from("fin_grupo_movimientos").insert(fila);
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    if (m.en_flujo) await supabase.from("fin_movimientos").update({ en_flujo: false, actualizado_en: ahora }).eq("id", m.id);
    await registrarAuditoria({
      accion: "pagado_por_otra_libro",
      entidad: "fin_movimientos",
      entidadId: m.id,
      detalle: `${duena.nombre} debe ${usd(m.monto)} a ${pagador.nombre} (Préstamos del grupo); sale del flujo de ${duena.nombre}`,
    });
    revalidar();
    revalidatePath("/tesoreria/grupo");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Vincula el movimiento con un bien de uso que ya existe (o lo desvincula con `bienId` null). */
export async function vincularBienMovimiento(id: string, bienId: string | null): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    await requireModuloEscritura("bienes-de-uso");
    const supabase = createServiceClient();
    const m = await leerMovimiento(supabase, id);
    if ("error" in m) return m;
    const { data: actual, error: ea } = await supabase.from("fin_bienes_uso").select("id, descripcion").eq("movimiento_id", m.id).maybeSingle();
    if (ea) return { error: FALTA_MIGRACION };
    if (bienId !== null && (typeof bienId !== "string" || !UUID.test(bienId))) return { error: "Bien inválido." };
    if (actual && actual.id !== bienId) {
      const { error } = await supabase.from("fin_bienes_uso").update({ movimiento_id: null }).eq("id", actual.id);
      if (error) return { error: error.message };
    }
    let nuevo: string | null = null;
    if (bienId) {
      const { data: b } = await supabase.from("fin_bienes_uso").select("id, descripcion, movimiento_id").eq("id", bienId).maybeSingle();
      if (!b) return { error: "El bien ya no existe." };
      if (b.movimiento_id && b.movimiento_id !== m.id) return { error: "Ese bien ya está vinculado con otro movimiento." };
      const { error } = await supabase.from("fin_bienes_uso").update({ movimiento_id: m.id }).eq("id", bienId);
      if (error) return { error: error.message };
      nuevo = b.descripcion as string;
    }
    await registrarAuditoria({
      accion: "vincular_bien_libro",
      entidad: "fin_movimientos",
      entidadId: m.id,
      antes: { "Bien de uso": (actual?.descripcion as string | undefined) ?? "Sin bien" },
      despues: { "Bien de uso": nuevo ?? "Sin bien" },
    });
    revalidar();
    revalidatePath("/bienes-de-uso");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo vincular." };
  }
}

/** Da de alta el bien de uso de esta compra (importe = monto, alta = fecha de pago o mes del libro) y lo vincula. */
export async function crearBienDesdeMovimiento(id: string, tipo: string, meses: number): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    await requireModuloEscritura("bienes-de-uso");
    const supabase = createServiceClient();
    const m = await leerMovimiento(supabase, id);
    if ("error" in m) return m;
    if (!(TIPOS_BIEN as readonly string[]).includes(tipo)) return { error: "Elige el tipo de bien." };
    const vida = Number.isInteger(meses) && meses >= 1 && meses <= 600 ? meses : VIDA_UTIL[tipo as TipoBien];
    const { data: ya, error: ey } = await supabase.from("fin_bienes_uso").select("id").eq("movimiento_id", m.id).maybeSingle();
    if (ey) return { error: FALTA_MIGRACION };
    if (ya) return { error: "Este movimiento ya tiene su bien de uso." };
    // La tienda del bien: la del movimiento si es una tienda; si es A DISTRIBUIR (u otra), queda vacía = A DISTRIBUIR.
    const { data: u } = await supabase.from("fin_unidades").select("clase").eq("id", m.unidad_id).maybeSingle();
    const descripcion = (m.descripcion || "Bien de uso").slice(0, 300);
    const { data, error } = await supabase
      .from("fin_bienes_uso")
      .insert({
        descripcion,
        tipo,
        unidad_id: u?.clase === "tienda" ? m.unidad_id : null,
        fecha_alta: m.fecha_pago ?? String(m.periodo).slice(0, 10),
        importe: m.monto,
        meses_vida: vida,
        valor_residual: 0,
        origen: "libro",
        movimiento_id: m.id,
        creado_por: usuario.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: `No se pudo crear: ${error?.message ?? "sin respuesta"}` };
    if (!m.es_bien_de_uso) await supabase.from("fin_movimientos").update({ es_bien_de_uso: true }).eq("id", m.id);
    await registrarAuditoria({
      accion: "crear_bien_uso",
      entidad: "fin_bienes_uso",
      entidadId: data.id as string,
      detalle: `${descripcion} · ${tipo} · ${usd(m.monto)} en ${vida} meses · desde el libro de movimientos`,
    });
    revalidar();
    revalidatePath("/bienes-de-uso");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear el bien." };
  }
}
