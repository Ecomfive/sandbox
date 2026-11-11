"use server";

// Asientos de ajuste del cierre (migración 0927): a mano, devengos de gastos prepagados, provisiones de la nómina y los
// gastos prepagados. Cada ajuste deja sus líneas en `fin_movimientos` (origen «ajuste_cierre», EERR = SI, flujo = NO).
// Todas devuelven `{ error }` como valor.

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { hoyPanama } from "@/lib/af4/fecha";
import { createServiceClient } from "@/lib/supabase/server";
import { SIN_MIGRACION_CONTROL, cargarPrepagos } from "@/lib/finanzas/cargar-cierre-control";
import { leerPeriodo, nombreMes } from "@/lib/finanzas/cierre";
import {
  ETIQUETA_CLASE_AJUSTE,
  efectoLineas,
  filaMovimiento,
  leerMonto,
  lineasDeAjuste,
  validarAjuste,
  type ClaseAjuste,
  type LineaAjuste,
  type OrigenAjuste,
} from "@/lib/finanzas/ajustes-cierre";
import { lineasDevengoDelMes } from "@/lib/finanzas/devengos";
import { NOMBRE_PROVISION, TIPO_PROVISION, proponerProvisiones } from "@/lib/finanzas/provisiones";

const MODULO = "cierre-mes";
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });
const usd = (v: number) => `US$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function revalidar(periodo?: string) {
  revalidatePath("/cierre-mes/ajustes");
  revalidatePath("/cierre-mes/prepagos");
  revalidatePath("/cierre-mes");
  if (periodo) revalidatePath(`/cierre-mes/${periodo.slice(0, 7)}`);
  revalidatePath("/estado-resultados");
}

const puedeNomina = (u: UsuarioActual) => u.modulos.includes("usuarios") && !u.modulosSoloLectura.includes("usuarios");

async function mesCerrado(supabase: SupabaseClient, periodo: string): Promise<boolean> {
  const { data } = await supabase.from("fin_cierres").select("estado").eq("periodo", periodo).maybeSingle();
  return data?.estado === "cerrado";
}

async function signosTipos(supabase: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  const { data } = await supabase.from("fin_tipos").select("id, signo").in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((t) => [t.id as string, Number(t.signo)]));
}

interface NuevoAjuste {
  periodo: string;
  clase: ClaseAjuste;
  concepto: string;
  origen: OrigenAjuste;
  origenRef: string | null;
  notas: string | null;
  lineas: LineaAjuste[];
}

/** Guarda el ajuste y sus líneas en el libro; si las líneas fallan, borra el ajuste. Devuelve su id y efecto. */
async function guardarAjuste(supabase: SupabaseClient, a: NuevoAjuste, usuarioId: string): Promise<{ error: string } | { id: string; efecto: number }> {
  const signos = await signosTipos(supabase, a.lineas.map((l) => l.tipoId));
  if (a.lineas.some((l) => !signos.has(l.tipoId))) return { error: "Uno de los tipos no existe." };
  const efecto = efectoLineas(a.lineas, signos);
  const { data, error } = await supabase
    .from("fin_ajustes_cierre")
    .insert({ periodo: a.periodo, clase: a.clase, concepto: a.concepto, origen: a.origen, origen_ref: a.origenRef, efecto, notas: a.notas, creado_por: usuarioId })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "FC001") return { error: "El mes está cerrado: reábrelo para agregar ajustes." };
    if (error?.code === "23505") return { error: "Ese ajuste ya está registrado en el mes." };
    return { error: error?.code === "42P01" ? SIN_MIGRACION_CONTROL : `No se pudo guardar el ajuste: ${error?.message ?? ""}` };
  }
  const hoy = hoyPanama();
  const ins = await supabase.from("fin_movimientos").insert(a.lineas.map((l, i) => filaMovimiento(l, i, data.id as string, a.periodo, usuarioId, hoy)));
  if (ins.error) {
    await supabase.from("fin_ajustes_cierre").delete().eq("id", data.id);
    return { error: ins.error.message.includes("ajuste_id") ? SIN_MIGRACION_CONTROL : `No se pudieron guardar las líneas: ${ins.error.message}` };
  }
  return { id: data.id as string, efecto };
}

/** «Agregar» de los asientos de ajuste: uno escrito a mano. */
export async function crearAjuste(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const periodo = leerPeriodo(formData.get("periodo"));
    if (!periodo) return { error: "Mes inválido." };
    const e = validarAjuste(Object.fromEntries(formData.entries()));
    if ("error" in e) return e;
    const supabase = createServiceClient();
    if (await mesCerrado(supabase, periodo)) return { error: "El mes está cerrado: reábrelo para agregar ajustes." };
    const r = await guardarAjuste(supabase, { periodo, clase: e.clase, concepto: e.concepto, origen: "manual", origenRef: null, notas: e.notas, lineas: lineasDeAjuste(e) }, usuario.id);
    if ("error" in r) return r;
    await registrarAuditoria({
      accion: "crear_ajuste_cierre",
      entidad: "fin_ajustes_cierre",
      entidadId: r.id,
      detalle: `${nombreMes(periodo)} · ${ETIQUETA_CLASE_AJUSTE[e.clase]}: ${e.concepto} · ${usd(e.monto)} · efecto ${usd(r.efecto)}`,
    });
    revalidar(periodo);
    return {};
  } catch (err) {
    return fallo(err, "No se pudo guardar el ajuste.");
  }
}

/** Elimina un ajuste y sus líneas del libro (con el mes cerrado, la base lo impide). Una provisión de la nómina, solo con Usuarios y roles. */
export async function eliminarAjuste(id: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!ES_UUID.test(id)) return { error: "Ajuste inválido." };
    const supabase = createServiceClient();
    const { data: a } = await supabase.from("fin_ajustes_cierre").select("periodo, clase, concepto, origen, efecto").eq("id", id).maybeSingle();
    if (!a) return { error: "El ajuste ya no existe." };
    if (a.origen === "provision_nomina" && !puedeNomina(usuario)) return { error: "Una provisión de la nómina la quita quien puede modificar Usuarios y roles." };
    const periodo = String(a.periodo).slice(0, 10);
    if (await mesCerrado(supabase, periodo)) return { error: "El mes está cerrado: reábrelo para quitar ajustes." };
    const { error } = await supabase.from("fin_ajustes_cierre").delete().eq("id", id);
    if (error) return { error: error.code === "FC001" ? "El mes está cerrado." : `No se pudo eliminar: ${error.message}` };
    await registrarAuditoria({
      accion: "eliminar_ajuste_cierre",
      entidad: a.origen === "provision_nomina" ? "fin_provision_nomina" : "fin_ajustes_cierre",
      entidadId: id,
      detalle: `${nombreMes(periodo)} · ${ETIQUETA_CLASE_AJUSTE[a.clase as ClaseAjuste]}: ${a.concepto} · efecto ${usd(Number(a.efecto))}`,
    });
    revalidar(periodo);
    return {};
  } catch (err) {
    return fallo(err, "No se pudo eliminar el ajuste.");
  }
}

/** Registra los devengos de los gastos prepagados que le tocan al mes y todavía no están. */
export async function registrarDevengos(periodoTexto: string): Promise<{ error?: string; registrados?: number }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const periodo = leerPeriodo(periodoTexto);
    if (!periodo) return { error: "Mes inválido." };
    const supabase = createServiceClient();
    if (await mesCerrado(supabase, periodo)) return { error: "El mes está cerrado." };
    const prepagos = await cargarPrepagos(supabase, true);
    if ("error" in prepagos) return prepagos;
    const { data: hechos } = await supabase.from("fin_ajustes_cierre").select("origen_ref").eq("periodo", periodo).eq("origen", "devengo");
    const ya = new Set((hechos ?? []).map((h) => h.origen_ref as string));
    let registrados = 0;
    for (const p of prepagos) {
      for (const l of lineasDevengoDelMes(p, periodo)) {
        const ref = `${p.id}:${l.ref}`;
        if (ya.has(ref)) continue;
        const r = await guardarAjuste(
          supabase,
          { periodo, clase: "devengo", concepto: l.concepto, origen: "devengo", origenRef: ref, notas: null, lineas: [{ unidadId: p.unidadId, tipoId: p.tipoId, monto: l.monto, descripcion: `Devengo: ${l.concepto}` }] },
          usuario.id,
        );
        if ("error" in r) return { error: r.error, registrados };
        registrados++;
      }
    }
    if (registrados) {
      await registrarAuditoria({ accion: "registrar_devengos_cierre", entidad: "fin_ajustes_cierre", detalle: `${nombreMes(periodo)} · ${registrados} ajustes de devengo` });
    }
    revalidar(periodo);
    return { registrados };
  } catch (err) {
    return fallo(err, "No se pudieron registrar los devengos.");
  }
}

/**
 * Registra las provisiones del mes (XIII mes, vacaciones, prima de antigüedad) calculadas en el servidor desde la planilla
 * formal. Datos sensibles: solo quien puede modificar Usuarios y roles. Una provisión ya registrada no se repite.
 */
export async function registrarProvisiones(periodoTexto: string): Promise<{ error?: string; registrados?: number }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!puedeNomina(usuario)) return { error: "Las provisiones de la nómina las registra quien puede modificar Usuarios y roles." };
    const periodo = leerPeriodo(periodoTexto);
    if (!periodo) return { error: "Mes inválido." };
    const supabase = createServiceClient();
    if (await mesCerrado(supabase, periodo)) return { error: "El mes está cerrado." };
    const [bases, tipo, corp, hechos] = await Promise.all([
      supabase.from("nom_costo_mensual").select("unidad_id, bruto").eq("periodo", periodo).eq("tipo", "formal"),
      supabase.from("fin_tipos").select("id").eq("nombre", TIPO_PROVISION).maybeSingle(),
      supabase.from("fin_unidades").select("id").eq("nombre", "CORPORATIVO").maybeSingle(),
      supabase.from("fin_ajustes_cierre").select("origen_ref").eq("periodo", periodo).eq("origen", "provision_nomina"),
    ]);
    if (bases.error) return { error: "No se pudo leer la nómina (migración 0906)." };
    if (!tipo.data) return { error: SIN_MIGRACION_CONTROL };
    if (!corp.data) return { error: "Falta la unidad CORPORATIVO en el libro." };
    const propuestas = proponerProvisiones(
      (bases.data ?? []).map((b) => ({ unidadId: (b.unidad_id as string | null) ?? null, bruto: Number(b.bruto) })),
      corp.data.id as string,
    );
    if (!propuestas.length) return { error: "No hay planilla formal en el mes." };
    const ya = new Set((hechos.data ?? []).map((h) => h.origen_ref as string));
    let registrados = 0;
    for (const p of propuestas) {
      if (ya.has(p.clave)) continue;
      const concepto = `${NOMBRE_PROVISION[p.clave]} (${(p.tasa * 100).toFixed(3)} % de la planilla formal)`;
      const r = await guardarAjuste(
        supabase,
        {
          periodo,
          clase: "provision",
          concepto,
          origen: "provision_nomina",
          origenRef: p.clave,
          notas: null,
          lineas: p.lineas.map((l) => ({ unidadId: l.unidadId, tipoId: tipo.data!.id as string, monto: l.monto, descripcion: `Provisión: ${NOMBRE_PROVISION[p.clave]}` })),
        },
        usuario.id,
      );
      if ("error" in r) return { error: r.error, registrados };
      registrados++;
      await registrarAuditoria({ accion: "registrar_provision_cierre", entidad: "fin_provision_nomina", entidadId: r.id, detalle: `${nombreMes(periodo)} · ${concepto} · ${usd(p.monto)}` });
    }
    revalidar(periodo);
    return { registrados };
  } catch (err) {
    return fallo(err, "No se pudieron registrar las provisiones.");
  }
}

// ---------------------------------------------------------------------------------------------
// Gastos prepagados
// ---------------------------------------------------------------------------------------------
export async function crearPrepago(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const concepto = texto(formData.get("concepto"), 120);
    if (!concepto) return { error: "Escribe el concepto (Ej: Seguro de la oficina)." };
    const unidadId = texto(formData.get("unidad_id"), 40);
    const tipoId = texto(formData.get("tipo_id"), 40);
    if (!ES_UUID.test(unidadId)) return { error: "Elige la tienda." };
    if (!ES_UUID.test(tipoId)) return { error: "Elige el tipo de gasto." };
    const monto = leerMonto(formData.get("monto"));
    if (monto === null || monto <= 0) return { error: "Escribe el monto pagado, mayor a cero." };
    const desde = leerPeriodo(formData.get("desde"));
    if (!desde) return { error: "Elige el primer mes que cubre." };
    const meses = Number(formData.get("meses"));
    if (!Number.isInteger(meses) || meses < 1 || meses > 60) return { error: "Los meses van de 1 a 60." };
    const pagoTexto = formData.get("periodo_pago");
    const periodoPago = pagoTexto ? leerPeriodo(pagoTexto) : desde;
    if (!periodoPago) return { error: "El mes del pago no es válido." };
    const pagoEnEerr = formData.get("pago_en_eerr") === "si";
    const notas = texto(formData.get("notas"), 1000) || null;
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("fin_prepagos")
      .insert({ concepto, unidad_id: unidadId, tipo_id: tipoId, monto, desde, meses, periodo_pago: periodoPago, pago_en_eerr: pagoEnEerr, notas, creado_por: usuario.id })
      .select("id")
      .single();
    if (error || !data) return { error: error?.code === "42P01" ? SIN_MIGRACION_CONTROL : `No se pudo guardar: ${error?.message ?? ""}` };
    await registrarAuditoria({ accion: "crear_prepago", entidad: "fin_prepagos", entidadId: data.id as string, detalle: `${concepto} · ${usd(monto)} en ${meses} meses desde ${nombreMes(desde)}` });
    revalidar();
    return {};
  } catch (err) {
    return fallo(err, "No se pudo guardar el gasto prepagado.");
  }
}

/** Activa o desactiva un prepago (desactivado deja de proponer devengos; lo ya registrado queda). */
export async function cambiarActivoPrepago(id: string, activo: boolean): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!ES_UUID.test(id)) return { error: "Prepago inválido." };
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("fin_prepagos")
      .update({ activo: Boolean(activo), actualizado_en: new Date().toISOString() })
      .eq("id", id)
      .select("concepto")
      .maybeSingle();
    if (error || !data) return { error: "No se pudo cambiar." };
    await registrarAuditoria({
      accion: "cambiar_prepago",
      entidad: "fin_prepagos",
      entidadId: id,
      detalle: data.concepto as string,
      antes: { Estado: activo ? "Inactivo" : "Activo" },
      despues: { Estado: activo ? "Activo" : "Inactivo" },
    });
    revalidar();
    return {};
  } catch (err) {
    return fallo(err, "No se pudo cambiar el prepago.");
  }
}
