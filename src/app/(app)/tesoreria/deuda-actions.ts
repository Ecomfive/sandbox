"use server";

// Acciones de Tesorería › Deuda (financiamientos por ciclo), Refinanciamiento (ofertas) y Covenants (migración 0946). Cada
// una pide poder modificar Tesorería, valida en el servidor, devuelve `{ error }` como valor y deja su línea de auditoría.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { dinero, porcentaje } from "@/lib/af4/formato";
import { SIN_MIGRACION_0946 } from "@/lib/finanzas/cargar-deuda-avanzada";
import { defIndicador, esAmbitoCovenant, esIndicadorCovenant, leerUmbral } from "@/lib/finanzas/covenants";
import { leerPorcentaje, leerTasa } from "@/lib/finanzas/deuda";
import { leerRefs } from "@/lib/finanzas/optimizar-deuda";
import { leerFecha, leerMonto } from "@/lib/finanzas/pagos";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "tesoreria";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Resultado = { error?: string };
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });
const texto = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const uuid = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return UUID.test(s) ? s : null;
};
const falta = (code: string | undefined, msg: string) => (code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204" ? SIN_MIGRACION_0946 : msg);
const revalidar = () => revalidatePath("/tesoreria", "layout");
const enteroEntre = (v: FormDataEntryValue | null, min: number, max: number) => {
  const s = String(v ?? "").trim();
  const n = s === "" ? NaN : Number(s);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

async function intentar(fn: () => Promise<Resultado>, mensaje: string): Promise<Resultado> {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : mensaje };
  }
}

// ---------------------------------------------------------------------------------------------
// Financiamientos por ciclo
// ---------------------------------------------------------------------------------------------

export async function guardarCiclo(formData: FormData): Promise<Resultado> {
  return intentar(async () => {
    const usuario = await requireModuloEscritura(MODULO);
    const id = uuid(formData.get("id"));
    const nombre = texto(formData.get("nombre"), 120);
    const monto = leerMonto(formData.get("monto"));
    const tasa = leerPorcentaje(formData.get("tasa_ciclo"), 199);
    const dias = enteroEntre(formData.get("dias_ciclo"), 1, 730);
    const inicio = leerFecha(formData.get("fecha_inicio"));
    const penalidad = leerPorcentaje(formData.get("penalidad_prepago"), 99);
    const comision = String(formData.get("comision_prepago") ?? "").trim() ? leerMonto(formData.get("comision_prepago")) : 0;
    if (!nombre) return { error: "Escribe el nombre." };
    if (monto === null) return { error: "El monto debe ser mayor a cero." };
    if (tasa === null || tasa <= 0) return { error: "El costo por ciclo es un porcentaje mayor a cero." };
    if (dias === null) return { error: "Los días del ciclo van de 1 a 730." };
    if (!inicio) return { error: "Elige la fecha del primer giro." };
    if (penalidad === null) return { error: "La penalidad es un porcentaje de lo prepagado." };
    if (comision === null) return { error: "La comisión de prepago es un monto en USD." };
    const fila = {
      nombre,
      acreedor: texto(formData.get("acreedor"), 120) || null,
      monto,
      tasa_ciclo: tasa,
      dias_ciclo: dias,
      fecha_inicio: inicio,
      renovable: formData.get("renovable") !== "no",
      penalidad_prepago: penalidad,
      comision_prepago: comision,
      cuenta_id: uuid(formData.get("cuenta_id")),
      nota: texto(formData.get("nota"), 1000) || null,
      actualizado_en: new Date().toISOString(),
    };
    const supabase = createServiceClient();
    const resumen = `${nombre} · ${usd(monto)} · ${porcentaje(tasa * 100, { decimales: 2 })} cada ${dias} días`;
    if (id) {
      const previo = await supabase.from("fin_financiamientos_ciclo").select("monto, tasa_ciclo, dias_ciclo, renovable").eq("id", id).maybeSingle();
      if (previo.error) return { error: falta(previo.error.code, previo.error.message) };
      if (!previo.data) return { error: "Ese financiamiento ya no existe." };
      const { error } = await supabase.from("fin_financiamientos_ciclo").update(fila).eq("id", id);
      if (error) return { error: falta(error.code, error.message) };
      await registrarAuditoria({
        accion: "editar_financiamiento_ciclo",
        entidad: "fin_financiamientos_ciclo",
        entidadId: id,
        detalle: nombre,
        antes: { Monto: usd(Number(previo.data.monto)), "Costo por ciclo": String(previo.data.tasa_ciclo), Días: String(previo.data.dias_ciclo), Renovable: previo.data.renovable ? "Sí" : "No" },
        despues: { Monto: usd(monto), "Costo por ciclo": String(tasa), Días: String(dias), Renovable: fila.renovable ? "Sí" : "No" },
      });
    } else {
      const { data, error } = await supabase.from("fin_financiamientos_ciclo").insert({ ...fila, creado_por: usuario.id }).select("id").single();
      if (error) return { error: falta(error.code, `No se pudo guardar: ${error.message}`) };
      await registrarAuditoria({ accion: "crear_financiamiento_ciclo", entidad: "fin_financiamientos_ciclo", entidadId: data.id, detalle: resumen });
    }
    revalidar();
    return {};
  }, "No se pudo guardar el financiamiento.");
}

/** Un registro no se borra: se desactiva (sale de la proyección, del balance y de las simulaciones desde hoy). */
async function desactivar(tabla: string, accion: string, id: string, campoNombre: string): Promise<Resultado> {
  return intentar(async () => {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Registro inválido." };
    const supabase = createServiceClient();
    const previo = await supabase.from(tabla).select(campoNombre).eq("id", id).maybeSingle();
    if (previo.error) return { error: falta(previo.error.code, previo.error.message) };
    if (!previo.data) return { error: "Ya no existe." };
    const cambio: Record<string, unknown> = { activo: false };
    if (tabla !== "fin_covenants") cambio.actualizado_en = new Date().toISOString();
    const { error } = await supabase.from(tabla).update(cambio).eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({ accion, entidad: tabla, entidadId: id, detalle: String((previo.data as unknown as Record<string, unknown>)[campoNombre] ?? "") });
    revalidar();
    return {};
  }, "No se pudo quitar.");
}

export async function desactivarCiclo(id: string): Promise<Resultado> {
  return desactivar("fin_financiamientos_ciclo", "desactivar_financiamiento_ciclo", id, "nombre");
}

// ---------------------------------------------------------------------------------------------
// Ofertas de refinanciamiento
// ---------------------------------------------------------------------------------------------

export async function guardarOferta(formData: FormData): Promise<Resultado> {
  return intentar(async () => {
    const usuario = await requireModuloEscritura(MODULO);
    const id = uuid(formData.get("id"));
    const banco = texto(formData.get("banco"), 120);
    const nombre = texto(formData.get("nombre"), 120) || (banco ? `Oferta ${banco}` : "");
    const monto = leerMonto(formData.get("monto"));
    const plazo = enteroEntre(formData.get("plazo_meses"), 1, 480);
    const tasa = leerTasa(formData.get("tasa"));
    const comision = leerPorcentaje(formData.get("comision_apertura"), 99);
    const gracia = String(formData.get("gracia_meses") ?? "").trim() ? enteroEntre(formData.get("gracia_meses"), 0, 60) : 0;
    const desembolso = leerFecha(formData.get("fecha_desembolso"));
    const sustituye = leerRefs(formData.getAll("sustituye"));
    if (!banco) return { error: "Escribe el banco." };
    if (monto === null) return { error: "El monto debe ser mayor a cero." };
    if (plazo === null) return { error: "El plazo va de 1 a 480 meses." };
    if (tasa === null) return { error: "La tasa es un porcentaje anual." };
    if (comision === null) return { error: "La comisión de apertura es un porcentaje del monto." };
    if (gracia === null || gracia >= plazo) return { error: "La gracia va de 0 meses a menos que el plazo." };
    if (!desembolso) return { error: "Elige la fecha de desembolso." };
    const fila = {
      banco,
      nombre,
      monto,
      plazo_meses: plazo,
      tasa_anual: tasa,
      comision_apertura: comision,
      gracia_meses: gracia,
      garantias: texto(formData.get("garantias"), 1000) || null,
      fecha_desembolso: desembolso,
      sustituye,
      nota: texto(formData.get("nota"), 1000) || null,
      actualizado_en: new Date().toISOString(),
    };
    const supabase = createServiceClient();
    const resumen = `${banco} · ${usd(monto)} · ${plazo} meses al ${porcentaje(tasa * 100, { decimales: 2 })} · sustituye ${sustituye.length}`;
    if (id) {
      const previo = await supabase.from("fin_ofertas_refinanciamiento").select("monto, plazo_meses, tasa_anual").eq("id", id).maybeSingle();
      if (previo.error) return { error: falta(previo.error.code, previo.error.message) };
      if (!previo.data) return { error: "Esa oferta ya no existe." };
      const { error } = await supabase.from("fin_ofertas_refinanciamiento").update(fila).eq("id", id);
      if (error) return { error: falta(error.code, error.message) };
      await registrarAuditoria({
        accion: "editar_oferta_refinanciamiento",
        entidad: "fin_ofertas_refinanciamiento",
        entidadId: id,
        detalle: nombre,
        antes: { Monto: usd(Number(previo.data.monto)), Plazo: String(previo.data.plazo_meses), Tasa: String(previo.data.tasa_anual) },
        despues: { Monto: usd(monto), Plazo: String(plazo), Tasa: String(tasa) },
      });
    } else {
      const { data, error } = await supabase.from("fin_ofertas_refinanciamiento").insert({ ...fila, creado_por: usuario.id }).select("id").single();
      if (error) return { error: falta(error.code, `No se pudo guardar: ${error.message}`) };
      await registrarAuditoria({ accion: "crear_oferta_refinanciamiento", entidad: "fin_ofertas_refinanciamiento", entidadId: data.id, detalle: resumen });
    }
    revalidar();
    return {};
  }, "No se pudo guardar la oferta.");
}

export async function desactivarOferta(id: string): Promise<Resultado> {
  return desactivar("fin_ofertas_refinanciamiento", "desactivar_oferta_refinanciamiento", id, "nombre");
}

// ---------------------------------------------------------------------------------------------
// Covenants
// ---------------------------------------------------------------------------------------------

const TABLA_AMBITO = { prestamo: "fin_prestamos", linea: "fin_lineas_credito", ciclo: "fin_financiamientos_ciclo", oferta: "fin_ofertas_refinanciamiento" } as const;

export async function guardarCovenant(formData: FormData): Promise<Resultado> {
  return intentar(async () => {
    const usuario = await requireModuloEscritura(MODULO);
    // «general» o «<ámbito>:<id>».
    const contrato = String(formData.get("contrato") ?? "general").trim();
    const [ambito, refCruda] = contrato.includes(":") ? contrato.split(":", 2) : [contrato, ""];
    const indicador = String(formData.get("indicador") ?? "");
    const umbral = leerUmbral(formData.get("umbral"));
    if (!esAmbitoCovenant(ambito)) return { error: "Elige a qué contrato aplica." };
    const refId = ambito === "general" ? null : UUID.test(refCruda) ? refCruda : null;
    if (ambito !== "general" && !refId) return { error: "Elige a qué contrato aplica." };
    if (!esIndicadorCovenant(indicador)) return { error: "Elige el indicador." };
    if (umbral === null) return { error: "El umbral es un número (veces o USD)." };
    const supabase = createServiceClient();
    if (ambito !== "general") {
      const existe = await supabase.from(TABLA_AMBITO[ambito]).select("id").eq("id", refId!).maybeSingle();
      if (existe.error) return { error: falta(existe.error.code, existe.error.message) };
      if (!existe.data) return { error: "Ese contrato ya no existe." };
    }
    const { data, error } = await supabase
      .from("fin_covenants")
      .insert({ ambito, ref_id: refId, indicador, umbral, nota: texto(formData.get("nota"), 500) || null, creado_por: usuario.id })
      .select("id")
      .single();
    if (error) return { error: falta(error.code, `No se pudo guardar: ${error.message}`) };
    await registrarAuditoria({ accion: "crear_covenant", entidad: "fin_covenants", entidadId: data.id, detalle: `${defIndicador(indicador).etiqueta}: ${umbral}` });
    revalidar();
    return {};
  }, "No se pudo guardar el covenant.");
}

export async function desactivarCovenant(id: string): Promise<Resultado> {
  return desactivar("fin_covenants", "desactivar_covenant", id, "indicador");
}
