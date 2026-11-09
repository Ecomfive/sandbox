"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { cargarBasePlan, entradaDesdeBase, mesesHasta, SIN_MIGRACION_PLAN } from "@/lib/finanzas/cargar-planificacion";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { guardarFotoPronostico } from "@/lib/finanzas/guardar-foto-plan";
import {
  CAMPOS_MOTORES,
  CAMPOS_SUPUESTOS,
  CLAVE_PLANIFICACION,
  esTipoEscenario,
  fotoDePlan,
  leerMotoresEditados,
  leerParametros,
  lineasPresupuesto,
  proyectarPlan,
  validarMotores,
  validarSupuestos,
  type Motores,
} from "@/lib/finanzas/planificacion";
import { puedeVerUnidad, veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "planificacion";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOLO_EMPRESA = "Solo quien ve toda la empresa puede cambiar esto.";

type Resultado = { error?: string };

const revalidar = () => {
  for (const r of ["/planificacion", "/planificacion/motores", "/planificacion/plan-anual", "/planificacion/18-meses", "/planificacion/escenarios", "/planificacion/metas", "/panel-financiero/comite", "/rentabilidad", "/presupuesto"])
    revalidatePath(r);
};

async function conPermiso<T extends Resultado>(fn: (u: UsuarioActual, permitidas: string[] | null) => Promise<T>): Promise<T | Resultado> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    return await fn(usuario, await cargarTiendasPermitidas());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

const textoMotores = (m: Partial<Motores>) =>
  Object.fromEntries(CAMPOS_MOTORES.map((d) => [d.etiqueta, m[d.clave] === undefined ? "De la historia" : String(m[d.clave])]));

/** Guarda los motores editados de una tienda (un campo vacío vuelve al de la historia). */
export async function guardarMotores(formData: FormData): Promise<Resultado> {
  return conPermiso(async (_u, permitidas) => {
    const unidadId = String(formData.get("unidad_id") ?? "").toLowerCase();
    if (!UUID.test(unidadId)) return { error: "Tienda inválida." };
    if (!puedeVerUnidad(permitidas, unidadId)) return { error: "No tienes acceso a esa tienda." };
    const leido = validarMotores((c) => formData.get(c));
    if ("error" in leido) return { error: leido.error };
    const supabase = createServiceClient();
    const [previo, unidad] = await Promise.all([
      supabase.from("fin_plan_motores").select("valores").eq("unidad_id", unidadId).maybeSingle(),
      supabase.from("fin_unidades").select("nombre, clase").eq("id", unidadId).maybeSingle(),
    ]);
    if (previo.error) return { error: SIN_MIGRACION_PLAN };
    if (!unidad.data || unidad.data.clase !== "tienda") return { error: "Tienda inválida." };
    const { error } = await supabase
      .from("fin_plan_motores")
      .upsert({ unidad_id: unidadId, valores: leido.editados, actualizado_por: _u.id, actualizado_en: new Date().toISOString() }, { onConflict: "unidad_id" });
    if (error) return { error: "No se pudo guardar." };
    await registrarAuditoria({
      accion: "cambiar_motores_plan",
      entidad: "fin_plan_motores",
      entidadId: unidadId,
      detalle: `Motores de ${unidad.data.nombre}`,
      antes: textoMotores(leerMotoresEditados(previo.data?.valores)),
      despues: textoMotores(leido.editados),
    });
    revalidar();
    return {};
  });
}

/** Guarda los supuestos generales (`fin_config.planificacion`). Solo con toda la empresa. */
export async function guardarSupuestosPlan(formData: FormData): Promise<Resultado> {
  return conPermiso(async (u, permitidas) => {
    if (!veTodaLaEmpresa(permitidas)) return { error: SOLO_EMPRESA };
    const leido = validarSupuestos((c) => formData.get(c));
    if ("error" in leido) return { error: leido.error };
    const supabase = createServiceClient();
    const previo = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_PLANIFICACION).maybeSingle();
    if (previo.error) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave: CLAVE_PLANIFICACION, valor: leido.editados, actualizado_por: u.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudo guardar." };
    const texto = (v: unknown) => Object.fromEntries(CAMPOS_SUPUESTOS.map((d) => [d.etiqueta, String((v as Record<string, unknown> | null)?.[d.clave] ?? "De los datos")]));
    await registrarAuditoria({ accion: "cambiar_supuestos_plan", entidad: "fin_config", entidadId: CLAVE_PLANIFICACION, detalle: "Supuestos de la planificación", antes: texto(previo.data?.valor), despues: texto(leido.editados) });
    revalidar();
    return {};
  });
}

/** Guarda una versión del plan anual con los motores y supuestos de hoy (borrador). */
export async function guardarVersionPlan(formData: FormData): Promise<Resultado> {
  return conPermiso(async (u, permitidas) => {
    if (!veTodaLaEmpresa(permitidas)) return { error: SOLO_EMPRESA };
    const anio = Number(formData.get("anio"));
    if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) return { error: "Año inválido." };
    const nombre = String(formData.get("nombre") ?? "").trim().slice(0, 120);
    if (!nombre) return { error: "Escribí un nombre." };
    const supabase = createServiceClient();
    const base = await cargarBasePlan(supabase, null);
    if ("error" in base) return { error: base.error };
    if (base.sinHistoria) return { error: base.sinHistoria };
    if (Number(base.corte.slice(0, 4)) > anio) return { error: "Ese año ya está cerrado." };
    const entrada = entradaDesdeBase(base, mesesHasta(base.corte, anio));
    if (!entrada) return { error: "Sin balance de apertura no se puede armar el plan." };
    const r = proyectarPlan(entrada);
    const delAnio = (p: string) => p.startsWith(String(anio));
    const foto = fotoDePlan(r);
    const datos = {
      motores: Object.fromEntries(base.tiendas.map((t) => [t.id, t.motores])),
      supuestos: base.supuestos,
      apertura: base.apertura,
      foto: { consolidado: foto.consolidado.filter((m) => delAnio(m.periodo)), tiendas: foto.tiendas.map((t) => ({ ...t, meses: t.meses.filter((m) => delAnio(m.periodo)) })) },
      detalle: {
        tiendas: r.tiendas.map((t) => ({ id: t.id, nombre: t.nombre, nueva: t.nueva, meses: t.meses.filter((m) => delAnio(m.periodo)) })),
        consolidado: r.consolidado.filter((m) => delAnio(m.periodo)),
      },
    };
    const { data, error } = await supabase.from("fin_plan_versiones").insert({ anio, nombre, corte: base.corte, datos, creado_por: u.id }).select("id").single();
    if (error) return { error: SIN_MIGRACION_PLAN };
    await registrarAuditoria({ accion: "guardar_version_plan", entidad: "fin_plan_versiones", entidadId: String(data.id), detalle: `Plan ${anio}: ${nombre} (con datos hasta ${base.corte.slice(0, 7)})` });
    revalidar();
    return {};
  });
}

/**
 * Aprueba una versión: la anterior aprobada del mismo año pasa a reemplazada y se crea el presupuesto aprobado del año en
 * Presupuesto (escenario base por tienda), que es contra el que se miden el Panel y el Informe.
 */
export async function aprobarVersionPlan(id: string): Promise<Resultado> {
  return conPermiso(async (u, permitidas) => {
    if (!veTodaLaEmpresa(permitidas)) return { error: SOLO_EMPRESA };
    if (!UUID.test(id)) return { error: "Versión inválida." };
    const supabase = createServiceClient();
    const v = await supabase.from("fin_plan_versiones").select("id, anio, nombre, estado, datos").eq("id", id).maybeSingle();
    if (v.error) return { error: SIN_MIGRACION_PLAN };
    if (!v.data) return { error: "La versión ya no existe." };
    if (v.data.estado !== "borrador") return { error: "Solo se aprueba un borrador." };
    const ahora = new Date().toISOString();
    const anio = Number(v.data.anio);

    // El presupuesto del año (si falla, la versión igual se aprueba y se avisa).
    let presupuestoId: string | null = null;
    let aviso: string | undefined;
    const detalle = (v.data.datos as { detalle?: { tiendas?: unknown; consolidado?: unknown } } | null)?.detalle;
    if (detalle && Array.isArray(detalle.tiendas) && Array.isArray(detalle.consolidado)) {
      const corp = await supabase.from("fin_unidades").select("id, nombre, clase").eq("activo", true).ilike("nombre", "CORPORATIVO%").order("orden").limit(1);
      const lineas = lineasPresupuesto(detalle.tiendas as Parameters<typeof lineasPresupuesto>[0], detalle.consolidado as Parameters<typeof lineasPresupuesto>[1], corp.data?.[0]?.id ?? null);
      const nombre = `Plan ${anio} · ${String(v.data.nombre)}`.slice(0, 100) + ` · ${ahora.slice(0, 16).replace("T", " ")}`;
      const p = await supabase
        .from("fin_presupuestos")
        .insert({ nombre: nombre.slice(0, 120), anio, estado: "aprobado", por_tienda: true, supuestos: { origen: "planificacion", version_id: id }, creado_por: u.id, aprobado_en: ahora, aprobado_por: u.id })
        .select("id")
        .single();
      if (p.error) aviso = "Se aprobó, pero no se pudo crear el presupuesto del año (falta la migración 0913).";
      else {
        presupuestoId = String(p.data.id);
        const filas = lineas.map((l) => ({ presupuesto_id: presupuestoId, escenario: "base", periodo: l.periodo, unidad_id: l.unidadId, seccion: l.seccion, tipo_id: null, monto: l.monto, origen: "generado", actualizado_por: u.id }));
        for (let i = 0; i < filas.length; i += 500) {
          const ins = await supabase.from("fin_presupuesto_lineas").insert(filas.slice(i, i + 500));
          if (ins.error) {
            aviso = "Se aprobó, pero el presupuesto del año quedó incompleto.";
            break;
          }
        }
      }
    }

    await supabase.from("fin_plan_versiones").update({ estado: "reemplazado" }).eq("anio", anio).eq("estado", "aprobado");
    const { error } = await supabase.from("fin_plan_versiones").update({ estado: "aprobado", aprobado_por: u.id, aprobado_en: ahora, presupuesto_id: presupuestoId }).eq("id", id).eq("estado", "borrador");
    if (error) return { error: "No se pudo aprobar." };
    await registrarAuditoria({
      accion: "aprobar_version_plan",
      entidad: "fin_plan_versiones",
      entidadId: id,
      detalle: `Plan ${anio}: ${String(v.data.nombre)}${presupuestoId ? " · presupuesto del año creado" : ""}`,
      antes: { Estado: "Borrador" },
      despues: { Estado: "Aprobado" },
    });
    revalidar();
    return aviso ? { error: aviso } : {};
  });
}

/** Borra una versión en borrador. */
export async function eliminarVersionPlan(id: string): Promise<Resultado> {
  return conPermiso(async (_u, permitidas) => {
    if (!veTodaLaEmpresa(permitidas)) return { error: SOLO_EMPRESA };
    if (!UUID.test(id)) return { error: "Versión inválida." };
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("fin_plan_versiones").delete().eq("id", id).eq("estado", "borrador").select("anio, nombre");
    if (error) return { error: SIN_MIGRACION_PLAN };
    if (!data?.length) return { error: "Solo se borra un borrador." };
    await registrarAuditoria({ accion: "eliminar_version_plan", entidad: "fin_plan_versiones", entidadId: id, detalle: `Plan ${data[0].anio}: ${data[0].nombre}` });
    revalidar();
    return {};
  });
}

/** Guarda la foto del pronóstico de 18 meses con el último cierre (el cierre de mes ya lo hace solo). */
export async function guardarFotoPlan(): Promise<Resultado> {
  return conPermiso(async (u, permitidas) => {
    if (!veTodaLaEmpresa(permitidas)) return { error: SOLO_EMPRESA };
    const r = await guardarFotoPronostico(createServiceClient(), u.id);
    if (r.error) return { error: r.error };
    await registrarAuditoria({ accion: "guardar_foto_plan", entidad: "fin_plan_fotos", entidadId: r.periodo, detalle: `Pronóstico de 18 meses con datos hasta ${r.periodo?.slice(0, 7)}` });
    revalidar();
    return {};
  });
}

/** Crea un escenario por decisión. */
export async function crearEscenarioPlan(formData: FormData): Promise<Resultado> {
  return conPermiso(async (u, permitidas) => {
    if (!veTodaLaEmpresa(permitidas)) return { error: SOLO_EMPRESA };
    const tipo = formData.get("tipo");
    if (!esTipoEscenario(tipo)) return { error: "Elegí el tipo de decisión." };
    const nombre = String(formData.get("nombre_escenario") ?? "").trim().slice(0, 120);
    if (!nombre) return { error: "Escribí un nombre." };
    const crudo = Object.fromEntries(["desde", "unidadId", "cambio", "respuesta", "nombre", "pedidos", "ticket", "crecimiento", "fijos", "inversion"].map((k) => [k, formData.get(k)]));
    const p = leerParametros(tipo, crudo);
    if ("error" in p) return { error: p.error };
    const supabase = createServiceClient();
    if (p.unidadId) {
      const t = await supabase.from("fin_unidades").select("clase").eq("id", p.unidadId).maybeSingle();
      if (t.data?.clase !== "tienda") return { error: "Tienda inválida." };
    }
    const { data, error } = await supabase.from("fin_plan_escenarios").insert({ nombre, tipo, parametros: p, creado_por: u.id }).select("id").single();
    if (error) return { error: SIN_MIGRACION_PLAN };
    await registrarAuditoria({ accion: "crear_escenario_plan", entidad: "fin_plan_escenarios", entidadId: String(data.id), detalle: nombre });
    revalidar();
    return {};
  });
}

export async function eliminarEscenarioPlan(id: string): Promise<Resultado> {
  return conPermiso(async (_u, permitidas) => {
    if (!veTodaLaEmpresa(permitidas)) return { error: SOLO_EMPRESA };
    if (!UUID.test(id)) return { error: "Escenario inválido." };
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("fin_plan_escenarios").delete().eq("id", id).select("nombre");
    if (error) return { error: SIN_MIGRACION_PLAN };
    if (!data?.length) return { error: "El escenario ya no existe." };
    await registrarAuditoria({ accion: "eliminar_escenario_plan", entidad: "fin_plan_escenarios", entidadId: id, detalle: String(data[0].nombre) });
    revalidar();
    return {};
  });
}
