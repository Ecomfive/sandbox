"use server";

// Acciones de la hoja de Costos de producto (migración 0992). Francis y María José llenan los costos asociados de cada
// compra; el % por financiamiento y el costo total los calcula la base. Todas piden poder modificar «Costos de producto»
// y devuelven el error como valor (en producción Next.js oculta el mensaje de una excepción).

import { revalidatePath } from "next/cache";
import { exigirAcceso } from "@/lib/seguridad/exigir-acceso";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/af4/fecha";
import { COSTOS_ASOCIADOS, esCampoAsociado, leerMontoAsociado } from "@/lib/finanzas/hoja-costos";
import { sincronizarCostosCompras } from "@/lib/finanzas/sincronizar-costos-compras";
import { normalizar } from "@/lib/finanzas/clasificacion";
import { SIN_MIGRACION_HOJA } from "@/lib/finanzas/cargar-hoja-costos";

const MODULO = "costos-mercancia";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const usd = (v: number) => `$${v.toFixed(2)}`;
const etiquetaDe = (campo: string) => COSTOS_ASOCIADOS.find((c) => c.id === campo)?.etiqueta ?? campo;

type Resultado = { error: string } | { costoTotal: number };

/** Lo que vale la fila después del cambio (la base lo recalcula con su disparador). */
async function leerTotal(id: string): Promise<number> {
  const { data } = await createServiceClient().from("fin_costos_lotes").select("costo_total").eq("id", id).maybeSingle();
  return Number(data?.costo_total ?? 0);
}

const COLUMNAS_FILA: string = `id, en_hoja_costos, origen, linea, producto, costo_final_manual, asoc_nota, ${COSTOS_ASOCIADOS.map((c) => c.id).join(", ")}`;

async function filaDeHoja(id: string) {
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Fila no válida." } as const;
  const { data, error } = await createServiceClient()
    .from("fin_costos_lotes")
    .select(COLUMNAS_FILA)
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: SIN_MIGRACION_HOJA } as const;
  const fila = data as unknown as Record<string, unknown> | null;
  if (!fila || !fila.en_hoja_costos) return { error: "Esa fila no está en la hoja de costos." } as const;
  return { fila } as const;
}

/** Guarda un costo asociado (total de esa compra, en USD) en una fila de la hoja. */
export async function guardarCostoAsociado(id: string, campo: string, valor: unknown): Promise<Resultado> {
  try {
    const acceso = await exigirAcceso({ modulo: MODULO, escritura: true });
    if (!acceso.usuario) return { error: acceso.error ?? "Sin acceso." };
    if (!esCampoAsociado(campo)) return { error: "Ese costo no existe en la hoja." };
    const monto = leerMontoAsociado(valor);
    if ("error" in monto) return monto;
    const f = await filaDeHoja(id);
    if ("error" in f) return { error: f.error ?? "Fila no válida." };
    const antes = Number(f.fila[campo] ?? 0);
    if (antes === monto.valor) return { costoTotal: await leerTotal(id) };
    const { error } = await createServiceClient()
      .from("fin_costos_lotes")
      .update({ [campo]: monto.valor, costos_por: acceso.usuario.id, costos_por_nombre: acceso.usuario.nombre || acceso.usuario.email, costos_en: new Date().toISOString(), actualizado_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({
      accion: "editar_costo_producto",
      entidad: "fin_costos_lotes",
      entidadId: id,
      detalle: `${String(f.fila.producto)} · ${String(f.fila.linea)}`,
      antes: { [etiquetaDe(campo)]: usd(antes) },
      despues: { [etiquetaDe(campo)]: usd(monto.valor) },
    });
    revalidatePath("/costos-mercancia");
    return { costoTotal: await leerTotal(id) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** La nota de una fila y su costo final manual (vacío lo quita y el costo vuelve a calcularse). */
export async function guardarNotaYCostoFinal(id: string, nota: unknown, costoFinal: unknown): Promise<Resultado> {
  try {
    const acceso = await exigirAcceso({ modulo: MODULO, escritura: true });
    if (!acceso.usuario) return { error: acceso.error ?? "Sin acceso." };
    const f = await filaDeHoja(id);
    if ("error" in f) return { error: f.error ?? "Fila no válida." };
    const textoNota = String(nota ?? "").trim().slice(0, 500) || null;
    const textoFinal = String(costoFinal ?? "").trim();
    let final: number | null = null;
    if (textoFinal) {
      const m = leerMontoAsociado(textoFinal, 6);
      if ("error" in m) return m;
      if (!(m.valor > 0)) return { error: "El costo final debe ser mayor que cero (o déjalo vacío)." };
      final = m.valor;
    }
    const antesFinal = f.fila.costo_final_manual === null ? null : Number(f.fila.costo_final_manual);
    const antesNota = (f.fila.asoc_nota as string | null) ?? null;
    if (antesFinal === final && antesNota === textoNota) return { costoTotal: await leerTotal(id) };
    const { error } = await createServiceClient()
      .from("fin_costos_lotes")
      .update({ asoc_nota: textoNota, costo_final_manual: final, costos_por: acceso.usuario.id, costos_por_nombre: acceso.usuario.nombre || acceso.usuario.email, costos_en: new Date().toISOString(), actualizado_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({
      accion: "editar_costo_producto",
      entidad: "fin_costos_lotes",
      entidadId: id,
      detalle: `${String(f.fila.producto)} · ${String(f.fila.linea)}`,
      antes: { "Costo final manual": antesFinal === null ? "—" : String(antesFinal), Nota: antesNota ?? "—" },
      despues: { "Costo final manual": final === null ? "—" : String(final), Nota: textoNota ?? "—" },
    });
    revalidatePath("/costos-mercancia");
    return { costoTotal: await leerTotal(id) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Una fila a mano para un imprevisto (o un producto con stock sin compra vinculada). */
export async function crearCostoManual(formData: FormData): Promise<{ error?: string }> {
  try {
    const acceso = await exigirAcceso({ modulo: MODULO, escritura: true });
    if (!acceso.usuario) return { error: acceso.error ?? "Sin acceso." };
    const sku = String(formData.get("sku_maestro_id") ?? "");
    if (!UUID.test(sku)) return { error: "Elige el producto." };
    const referencia = String(formData.get("referencia") ?? "").trim().slice(0, 80);
    if (!referencia) return { error: "Escribe la referencia (código de la compra, factura o motivo)." };
    const llegada = String(formData.get("fecha_llegada") ?? "").trim();
    if (!FECHA.test(llegada)) return { error: "Elige la fecha de llegada." };
    const cantidad = Math.round(Number(formData.get("cantidad")));
    if (!(cantidad > 0 && cantidad < 10_000_000)) return { error: "Escribe las unidades (mayor que cero)." };
    const unitario = leerMontoAsociado(formData.get("costo_unitario"), 6);
    if ("error" in unitario) return unitario;
    const finalTexto = String(formData.get("costo_final") ?? "").trim();
    const final = finalTexto ? leerMontoAsociado(finalTexto, 6) : null;
    if (final && "error" in final) return final;
    if (!(unitario.valor > 0) && !(final && final.valor > 0)) return { error: "Escribe el costo unitario de compra o el costo final." };
    const nota = String(formData.get("nota") ?? "").trim().slice(0, 500) || null;

    const supabase = createServiceClient();
    const { data: s } = await supabase.from("skus_maestros").select("id, codigo, nombre").eq("id", sku).maybeSingle();
    if (!s) return { error: "Ese producto no existe." };
    const { data: previa } = await supabase.from("fin_costos_lotes").select("producto_clave").eq("sku_maestro_id", sku).order("creado_en").limit(1).maybeSingle();
    const { error } = await supabase.from("fin_costos_lotes").insert({
      hoja: "Costos de producto",
      fila: 0,
      linea: referencia,
      fecha_llegada: llegada,
      producto: String(s.nombre),
      producto_clave: (previa?.producto_clave as string | undefined) ?? normalizar(String(s.nombre)),
      codigo: String(s.codigo ?? ""),
      sku_maestro_id: sku,
      cantidad,
      costo_unitario: unitario.valor > 0 ? unitario.valor : (final as { valor: number }).valor,
      financiamiento: 0,
      costo_total: final && final.valor > 0 ? final.valor : unitario.valor,
      costo_final_manual: final && final.valor > 0 ? final.valor : null,
      asoc_nota: nota,
      estatus: "Cargado a mano",
      origen: "manual",
      origen_clave: `manual:${crypto.randomUUID()}`,
      en_hoja_costos: true,
      costos_por: acceso.usuario.id,
      costos_por_nombre: acceso.usuario.nombre || acceso.usuario.email,
      costos_en: new Date().toISOString(),
    });
    if (error) return { error: error.message.includes("en_hoja_costos") ? SIN_MIGRACION_HOJA : `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({ accion: "crear_costo_producto", entidad: "fin_costos_lotes", detalle: `${String(s.nombre)} · ${referencia} · ${cantidad} u.` });
    revalidatePath("/costos-mercancia");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Quita una fila cargada a mano (las que vienen de Compras no se quitan: se corrige la compra). */
export async function eliminarCostoManual(id: string): Promise<{ error?: string }> {
  try {
    const acceso = await exigirAcceso({ modulo: MODULO, escritura: true });
    if (!acceso.usuario) return { error: acceso.error ?? "Sin acceso." };
    const f = await filaDeHoja(id);
    if ("error" in f) return { error: f.error };
    if (f.fila.origen !== "manual") return { error: "Solo se quitan las filas cargadas a mano. Las de Compras salen solas si la compra deja de estar En Bodega o Completado." };
    const { error } = await createServiceClient().from("fin_costos_lotes").delete().eq("id", id).eq("origen", "manual");
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: "eliminar_costo_producto", entidad: "fin_costos_lotes", entidadId: id, detalle: `${String(f.fila.producto)} · ${String(f.fila.linea)}` });
    revalidatePath("/costos-mercancia");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo quitar." };
  }
}

/** Trae ahora las compras de Panamá En Bodega o Completado (lo mismo que pasa solo al cambiar la etapa en Compras). */
export async function traerComprasAHoja(): Promise<{ error: string } | { lotes: number; quitados: number }> {
  try {
    const acceso = await exigirAcceso({ modulo: MODULO, escritura: true });
    if (!acceso.usuario) return { error: acceso.error ?? "Sin acceso." };
    const r = await sincronizarCostosCompras(createServiceClient(), hoyPanama());
    if ("error" in r) return r;
    await registrarAuditoria({ accion: "traer_compras_costos", entidad: "fin_costos_lotes", detalle: `${r.lotes} filas de compras, ${r.quitados} quitadas` });
    revalidatePath("/costos-mercancia");
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron traer las compras." };
  }
}
