"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { mesCorto } from "@/lib/af4/fecha";
import { SIN_MIGRACION } from "@/lib/nomina/cargar";
import { UUID, validarDatosLinea, validarDatosPersona } from "@/lib/nomina/edicion";
import type { TipoNomina } from "@/lib/nomina/excel";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "nomina";

export interface PersonaFicha {
  id: string;
  tipo: TipoNomina;
  nombre: string;
  /** Completo: solo la ficha lo muestra. */
  documento: string | null;
  nacionalidad: string | null;
  pais: string | null;
  numero_empleado: string | null;
  cargo: string | null;
  estatus: string | null;
  correo: string | null;
  medio_pago: string | null;
  frecuencia_pago: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  salario_mensual: number | null;
  unidad_id: string | null;
  activo: boolean;
}

export interface LineaFicha {
  id: string;
  periodo: string;
  tramo: string;
  unidad_id: string | null;
  moneda: "USD" | "USDT";
  devengado: number;
  horas_extra: number;
  monto_horas_extra: number;
  monto_feriado: number;
  bono: number;
  descuento_tardanza: number;
  descuento_ausencia: number;
  otros_descuentos: number;
  total_bruto: number;
  seguro_social: number;
  seguro_educativo: number;
  neto: number;
  pagado: boolean | null;
  fecha_pago: string | null;
  medio_pago: string | null;
  referencia: string | null;
  origen_pago: string | null;
  observacion: string | null;
  diferencia_calculo: number;
  editado_a_mano: boolean;
}

const NUMERICOS = [
  "devengado", "horas_extra", "monto_horas_extra", "monto_feriado", "bono", "descuento_tardanza", "descuento_ausencia",
  "otros_descuentos", "total_bruto", "seguro_social", "seguro_educativo", "neto", "diferencia_calculo",
] as const;

/** La ficha de una persona con todo su historial de pagos. Basta poder abrir Nómina. */
export async function obtenerPersonaNomina(id: string): Promise<{ error: string } | { persona: PersonaFicha; lineas: LineaFicha[] }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Persona inválida." };
  const supabase = createServiceClient();
  const [p, l] = await Promise.all([
    supabase
      .from("nom_personas")
      .select("id, tipo, nombre, documento, nacionalidad, pais, numero_empleado, cargo, estatus, correo, medio_pago, frecuencia_pago, fecha_inicio, fecha_fin, salario_mensual, unidad_id, activo")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("nom_lineas")
      .select(`id, periodo, tramo, unidad_id, moneda, pagado, fecha_pago, medio_pago, referencia, origen_pago, observacion, editado_a_mano, ${NUMERICOS.join(", ")}`)
      .eq("persona_id", id)
      .order("periodo", { ascending: false })
      .order("tramo", { ascending: false })
      .limit(500),
  ]);
  if (p.error || l.error) return { error: SIN_MIGRACION };
  if (!p.data) return { error: "La persona ya no existe." };
  const persona = p.data as unknown as PersonaFicha & { salario_mensual: number | string | null };
  return {
    persona: { ...persona, salario_mensual: persona.salario_mensual === null ? null : Number(persona.salario_mensual) },
    lineas: ((l.data ?? []) as unknown as Record<string, unknown>[]).map((x) => {
      const fila = { ...x, periodo: String(x.periodo).slice(0, 10) } as Record<string, unknown>;
      for (const k of NUMERICOS) fila[k] = Number(x[k] ?? 0);
      return fila as unknown as LineaFicha;
    }),
  };
}

async function existeUnidad(id: string | null): Promise<boolean> {
  if (!id) return true;
  const { data } = await createServiceClient().from("fin_unidades").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

/** Cambia los datos de una persona. Una tienda puesta a mano queda fija: reimportar el Excel no la pisa. */
export async function actualizarPersonaNomina(id: string, datos: unknown): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Persona inválida." };
    const d = validarDatosPersona(datos);
    if ("error" in d) return d;
    if (!(await existeUnidad(d.unidad_id))) return { error: "Esa tienda ya no existe." };
    const supabase = createServiceClient();
    const { data: antes } = await supabase.from("nom_personas").select("nombre, unidad_id").eq("id", id).maybeSingle();
    if (!antes) return { error: "La persona ya no existe." };
    const cambioTienda = (antes.unidad_id ?? null) !== d.unidad_id;
    const { error } = await supabase
      .from("nom_personas")
      .update({ ...d, ...(cambioTienda ? { unidad_editada: true } : {}), actualizado_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: "No se pudo guardar." };
    // Datos sensibles: la auditoría dice qué se hizo, nunca los valores.
    await registrarAuditoria({ accion: "editar_persona_nomina", entidad: "nom_personas", entidadId: id, detalle: `Editó los datos de ${antes.nombre}` });
    revalidatePath("/nomina");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Corrige una línea (tienda, pago, referencia, observación). Queda marcada: reimportar el Excel no la pisa. */
export async function actualizarLineaNomina(id: string, datos: unknown): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Línea inválida." };
    const d = validarDatosLinea(datos);
    if ("error" in d) return d;
    if (!(await existeUnidad(d.unidad_id))) return { error: "Esa tienda ya no existe." };
    const supabase = createServiceClient();
    const { data: antes } = await supabase.from("nom_lineas").select("periodo, tramo, nom_personas(nombre)").eq("id", id).maybeSingle();
    if (!antes) return { error: "La línea ya no existe." };
    const { error } = await supabase
      .from("nom_lineas")
      .update({ ...d, editado_a_mano: true, actualizado_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: "No se pudo guardar." };
    const persona = antes.nom_personas as unknown as { nombre: string } | { nombre: string }[] | null;
    const nombre = (Array.isArray(persona) ? persona[0]?.nombre : persona?.nombre) ?? "una persona";
    await registrarAuditoria({
      accion: "editar_linea_nomina",
      entidad: "nom_lineas",
      entidadId: id,
      detalle: `Editó la línea de ${nombre} (${mesCorto(String(antes.periodo).slice(0, 10))} · ${antes.tramo})`,
    });
    revalidatePath("/nomina");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
