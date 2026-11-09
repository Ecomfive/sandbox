"use server";

// Bitácora de importaciones (migración 0925): cada carga de un importador (el universal o el de un módulo) deja una fila
// con el archivo, quién, cuándo, el módulo y las cifras. De cualquier importador se puede deshacer lo que esa carga creó
// (migración 0953: `importacion_id` en las tablas de cada importador; el libro ya lo tenía desde la 0925). El libro lo marca
// al insertar; los demás se marcan al cerrar la bitácora: las filas con huella creadas desde que se abrió. Sin la migración
// no se anota nada y la importación sigue igual.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { mesesCerrados, origenDeArchivo } from "@/lib/finanzas/guardar-libro";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { ORDEN_CARGA, type ModuloImportable } from "./reconocer";
import { TABLAS_IMPORTADAS, columnasDeshacer, decidirDeshacer, esModuloDeshacer, filaCreada, nuevasYActualizadas, sumarDecisiones, textoConservadas, type Decision } from "./deshacer";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esModulo = (m: unknown): m is ModuloImportable => typeof m === "string" && (ORDEN_CARGA as string[]).includes(m);
const entero = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 10_000_000 ? (v as number) : 0);

export interface CifrasBitacora {
  nuevas?: number;
  actualizadas?: number;
  saltadas?: number;
  borradas?: number;
  /** Frases del resultado («120 movimientos»…). */
  detalle?: string[];
}

/** Abre una fila «en curso» y devuelve su id (null sin la migración: la carga sigue sin bitácora). */
export async function iniciarImportacion(modulo: string, archivo: string): Promise<string | null> {
  try {
    if (!esModulo(modulo)) return null;
    const usuario = await requireModuloEscritura(modulo);
    const { data, error } = await createServiceClient()
      .from("fin_importaciones")
      .insert({ modulo, archivo: origenDeArchivo(String(archivo ?? "")), usuario_id: usuario.id, usuario_nombre: usuario.nombre ?? usuario.email })
      .select("id")
      .single();
    return error || !data ? null : (data.id as string);
  } catch {
    return null;
  }
}

/**
 * Marca con la importación las filas que creó (las que tienen huella, se crearon desde que se abrió la bitácora y no son
 * de otra carga) y devuelve cuántas son. El libro las marca al insertar: solo se cuentan. Sin la columna, null.
 */
async function marcarCreadas(supabase: SupabaseClient, id: string, modulo: ModuloImportable, desde: string): Promise<number | null> {
  let total = 0;
  for (const t of TABLAS_IMPORTADAS[modulo]) {
    if (t.marcaAlInsertar) {
      const { count, error } = await supabase.from(t.tabla).select("id", { count: "exact", head: true }).eq("importacion_id", id);
      if (error) return null;
      total += count ?? 0;
      continue;
    }
    let q = supabase
      .from(t.tabla)
      .update({ importacion_id: id }, { count: "exact" })
      .gte("creado_en", desde)
      .is("importacion_id", null)
      .not(t.clave, "is", null);
    for (const [c, v] of Object.entries(t.filtro ?? {})) q = q.eq(c, v);
    const { count, error } = await q;
    if (error) return null;
    total += count ?? 0;
  }
  return total;
}

/**
 * Cierra la fila con sus cifras (terminada o fallida). Antes marca lo que la carga creó (también en una carga que falló a
 * mitad: lo creado se puede deshacer) y, con eso, separa nuevas de actualizadas. Nunca lanza: la bitácora no puede romper
 * una importación.
 */
export async function terminarBitacora(id: string | null, modulo: string, estado: "terminada" | "fallida", cifras: CifrasBitacora): Promise<void> {
  try {
    if (!id || !UUID.test(id) || !esModulo(modulo)) return;
    await requireModuloEscritura(modulo);
    const supabase = createServiceClient();
    const { data: imp } = await supabase.from("fin_importaciones").select("creado_en, estado").eq("id", id).eq("modulo", modulo).maybeSingle();
    if (!imp || imp.estado !== "en_curso") return;
    const detalle = Array.isArray(cifras?.detalle) ? cifras.detalle.filter((x) => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 200)) : [];
    const creadas = esModuloDeshacer(modulo) ? await marcarCreadas(supabase, id, modulo, String(imp.creado_en)) : null;
    const guardadas = entero(cifras?.nuevas) + entero(cifras?.actualizadas);
    const nya = creadas === null ? { nuevas: entero(cifras?.nuevas), actualizadas: entero(cifras?.actualizadas) } : nuevasYActualizadas(guardadas, creadas);
    await supabase
      .from("fin_importaciones")
      .update({
        estado,
        terminado_en: new Date().toISOString(),
        nuevas: nya.nuevas,
        actualizadas: nya.actualizadas,
        saltadas: entero(cifras?.saltadas),
        borradas: entero(cifras?.borradas),
        detalle,
      })
      .eq("id", id)
      .eq("modulo", modulo)
      .eq("estado", "en_curso");
  } catch {
    // sin bitácora
  }
}

/** Para los importadores sin carga en dos pasos: abre y cierra la fila de una vez. */
export async function registrarImportacion(modulo: string, archivo: string, estado: "terminada" | "fallida", cifras: CifrasBitacora): Promise<void> {
  const id = await iniciarImportacion(modulo, archivo);
  await terminarBitacora(id, modulo, estado, cifras);
}

const RUTAS_MODULO: Record<ModuloImportable, string[]> = {
  "libro-movimientos": ["/libro-movimientos", "/estado-resultados"],
  "cuentas-por-cobrar": ["/cuentas-por-cobrar"],
  "cuentas-por-pagar": ["/cuentas-por-pagar"],
  "bienes-de-uso": ["/bienes-de-uso"],
  "costos-mercancia": ["/costos-mercancia", "/rentabilidad"],
  nomina: ["/nomina"],
  "ventas-tiendas": ["/ventas-tiendas", "/rentabilidad"],
  deliverys: ["/deliverys"],
  "conciliacion-bancaria": ["/conciliacion-bancaria"],
};

/** La entidad de la auditoría de cada módulo (la que ya ve quien puede abrirlo, `MODULO_DE_ENTIDAD`). */
const ENTIDAD_AUDITORIA: Record<ModuloImportable, string> = {
  "libro-movimientos": "fin_movimientos",
  "cuentas-por-cobrar": "fin_cartera_cobrar",
  "cuentas-por-pagar": "fin_cartera_pagar",
  "bienes-de-uso": "fin_bienes_uso",
  "costos-mercancia": "fin_costos_lotes",
  nomina: "nom_lineas",
  "ventas-tiendas": "ven_ordenes",
  deliverys: "del_entregas",
  "conciliacion-bancaria": "conc_lineas",
};

/** Los ids (de una lista) que tienen hijos en otra tabla. */
async function conHijos(supabase: SupabaseClient, t: { tabla: string; columna: string; filtro?: Record<string, string> }, ids: string[]): Promise<Set<string> | null> {
  const salida = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    let q = supabase.from(t.tabla).select(t.columna).in(t.columna, ids.slice(i, i + 200));
    for (const [c, v] of Object.entries(t.filtro ?? {})) q = q.eq(c, v);
    const { data, error } = await q;
    if (error) return null;
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) salida.add(String(r[t.columna]));
  }
  return salida;
}

/**
 * Deshace una importación de cualquier importador: borra lo que esa carga creó, salvo lo corregido a mano después, lo de
 * meses cerrados y lo protegido (semanas ya cerradas con un repartidor, líneas de banco conciliadas, cobros emparejados,
 * documentos con abonos del portal); eso se cuenta y se deja. Lo que la carga actualizó o borró no se recupera. Pide poder
 * modificar el módulo de la importación.
 */
export async function deshacerImportacion(id: string): Promise<{ error: string } | { borrados: number; conservados: number }> {
  try {
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Importación inválida." };
    const supabase = createServiceClient();
    const { data: imp, error } = await supabase.from("fin_importaciones").select("id, modulo, archivo, estado").eq("id", id).maybeSingle();
    if (error) return { error: "Falta correr la migración 0925 en Supabase." };
    if (!imp) return { error: "La importación ya no existe." };
    if (!esModuloDeshacer(imp.modulo)) return { error: "Esa importación no se puede deshacer." };
    const modulo = imp.modulo as ModuloImportable;
    const usuario = await requireModuloEscritura(modulo);
    if (imp.estado === "deshecha") return { error: "Esa importación ya se deshizo." };
    if (imp.estado === "en_curso") return { error: "Esa importación todavía está en curso." };
    const cerrados = await mesesCerrados(supabase);
    const decisiones: { tabla: string; d: Decision; motivo: string | null }[] = [];
    for (const t of TABLAS_IMPORTADAS[modulo]) {
      const filas = await traerTodasConError<Record<string, unknown>>((d, h) =>
        supabase.from(t.tabla).select(columnasDeshacer(t).join(", ")).eq("importacion_id", id).order("id").range(d, h) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>,
      );
      if (filas.error) return { error: modulo === "libro-movimientos" ? "No se pudieron leer sus movimientos." : "Falta correr la migración 0953 (importaciones) en Supabase." };
      const lista = filas.data ?? [];
      const hijos = t.protegerConHijos && lista.length ? await conHijos(supabase, t.protegerConHijos, lista.map((r) => String(r.id))) : new Set<string>();
      if (!hijos) return { error: "No se pudo revisar lo que depende de esas filas." };
      decisiones.push({
        tabla: t.tabla,
        d: decidirDeshacer(t, lista.map((r) => filaCreada(t, r, hijos)), cerrados),
        motivo: t.protegerSi?.motivo ?? t.protegerConHijos?.motivo ?? null,
      });
    }
    for (const { tabla, d } of decisiones) {
      for (let i = 0; i < d.borrar.length; i += 200) {
        const { error: e } = await supabase.from(tabla).delete().in("id", d.borrar.slice(i, i + 200)).eq("importacion_id", id);
        if (e) return { error: `No se pudo deshacer: ${e.message}` };
      }
    }
    const total = sumarDecisiones(decisiones.map((x) => x.d));
    const conservados = total.conservadas.editadas + total.conservadas.enMesCerrado + total.conservadas.protegidas;
    const motivos = decisiones.flatMap((x) => (x.d.conservadas.protegidas && x.motivo ? [x.motivo] : []));
    await supabase
      .from("fin_importaciones")
      .update({ estado: "deshecha", deshecha_en: new Date().toISOString(), deshecha_por: usuario.id, deshechas: total.borrar.length })
      .eq("id", id);
    await registrarAuditoria({
      accion: "deshacer_importacion",
      entidad: ENTIDAD_AUDITORIA[modulo],
      entidadId: id,
      detalle: `${imp.archivo}: ${total.borrar.length} filas borradas${conservados ? `, conservadas ${textoConservadas(total.conservadas, motivos)}` : ""}`,
    });
    for (const r of RUTAS_MODULO[modulo]) revalidatePath(r, "layout");
    revalidatePath("/importar/historial");
    return { borrados: total.borrar.length, conservados };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo deshacer." };
  }
}
