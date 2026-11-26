"use server";

// Acciones de la hoja de Costos de producto (migración 0992). Francis y María José llenan los costos asociados de cada
// compra; el % por financiamiento y el costo total los calcula la base. Todas piden poder modificar «Costos de producto»
// y devuelven el error como valor (en producción Next.js oculta el mensaje de una excepción).

import { revalidatePath } from "next/cache";
import { exigirAcceso } from "@/lib/seguridad/exigir-acceso";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/af4/fecha";
import { COSTOS_ASOCIADOS, cerradaPorCierre, codigoComparable, esCampoAsociado, leerMontoAsociado, repartirPorPeso, type CampoAsociado } from "@/lib/finanzas/hoja-costos";
import { esAdministrador } from "@/lib/permisos/acceso";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { sincronizarCostosCompras } from "@/lib/finanzas/sincronizar-costos-compras";
import { normalizar } from "@/lib/finanzas/clasificacion";
import { SIN_MIGRACION_HOJA, ultimoMesCerrado } from "@/lib/finanzas/cargar-hoja-costos";

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

const COLUMNAS_FILA: string = `id, en_hoja_costos, origen, linea, producto, fecha_llegada, cantidad, cantidad_pedida, costo_unitario, costo_final_manual, asoc_nota, ${COSTOS_ASOCIADOS.map((c) => c.id).join(", ")}`;

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

type Usuario = { modulos: readonly string[]; modulosSoloLectura: readonly string[] };

/**
 * Una fila que llegó en o antes del último mes cerrado ya costeó pedidos de ese mes. El mes cerrado no se recalcula, pero
 * la hoja quedaría distinta de lo contabilizado: solo un administrador la cambia.
 */
async function bloqueoPorCierre(llegada: unknown, usuario: Usuario): Promise<string | null> {
  if (esAdministrador(usuario)) return null;
  const ultimo = await ultimoMesCerrado(createServiceClient());
  const fecha = typeof llegada === "string" ? llegada.slice(0, 10) : null;
  if (!cerradaPorCierre(fecha, ultimo)) return null;
  return `Esta compra llegó en un mes ya cerrado (${ultimo?.slice(0, 7)}): ya costeó pedidos de ese mes. Pídele el cambio a un administrador.`;
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
    const bloqueo = await bloqueoPorCierre(f.fila.fecha_llegada, acceso.usuario);
    if (bloqueo) return { error: bloqueo };
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
    const bloqueo = await bloqueoPorCierre(f.fila.fecha_llegada, acceso.usuario);
    if (bloqueo) return { error: bloqueo };
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
      .update({ asoc_nota: textoNota, costo_final_manual: final, ...(antesFinal !== final ? { costo_final_excel: false } : {}), costos_por: acceso.usuario.id, costos_por_nombre: acceso.usuario.nombre || acceso.usuario.email, costos_en: new Date().toISOString(), actualizado_en: new Date().toISOString() })
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
export async function traerComprasAHoja(): Promise<{ error: string } | { lotes: number; quitados: number; unidas: number }> {
  try {
    const acceso = await exigirAcceso({ modulo: MODULO, escritura: true });
    if (!acceso.usuario) return { error: acceso.error ?? "Sin acceso." };
    const r = await sincronizarCostosCompras(createServiceClient(), hoyPanama());
    if ("error" in r) return r;
    await registrarAuditoria({ accion: "traer_compras_costos", entidad: "fin_costos_lotes", detalle: `${r.lotes} filas de compras, ${r.quitados} quitadas, ${r.unidas} de la carga inicial unidas a su compra` });
    revalidatePath("/costos-mercancia");
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron traer las compras." };
  }
}

/**
 * Los costos asociados de toda una compra (los de sus productos juntos): se escriben una vez y se reparten entre los
 * productos por su costo de compra (FOB), con los centavos exactos. Un campo vacío no cambia lo que había.
 */
export async function guardarAsociadosCompra(ids: string[], totales: Record<string, unknown>): Promise<{ error: string } | { filas: { id: string; asociados: Partial<Record<CampoAsociado, number>>; costoTotal: number }[] }> {
  try {
    const acceso = await exigirAcceso({ modulo: MODULO, escritura: true });
    if (!acceso.usuario) return { error: acceso.error ?? "Sin acceso." };
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || !ids.every((i) => typeof i === "string" && UUID.test(i))) return { error: "Compra no válida." };
    const campos: { campo: CampoAsociado; total: number }[] = [];
    for (const c of COSTOS_ASOCIADOS) {
      const v = totales?.[c.id];
      if (v === undefined || v === null || String(v).trim() === "") continue;
      const m = leerMontoAsociado(v);
      if ("error" in m) return { error: `${c.etiqueta}: ${m.error}` };
      campos.push({ campo: c.id, total: m.valor });
    }
    if (!campos.length) return { error: "Escribe al menos un costo." };
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("fin_costos_lotes").select(COLUMNAS_FILA).in("id", ids);
    if (error) return { error: SIN_MIGRACION_HOJA };
    const filas = ((data ?? []) as unknown as Record<string, unknown>[]).filter((f) => f.en_hoja_costos);
    if (filas.length !== new Set(ids).size) return { error: "Alguna fila ya no está en la hoja. Recarga la página." };
    const codigos = new Set(filas.map((f) => codigoComparable(String(f.linea ?? ""))));
    if (codigos.size !== 1) return { error: "Las filas no son de la misma compra." };
    for (const f of filas) {
      const bloqueo = await bloqueoPorCierre(f.fecha_llegada, acceso.usuario);
      if (bloqueo) return { error: bloqueo };
    }
    filas.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const pesos = filas.map((f) => (Number(f.cantidad_pedida ?? f.cantidad) || 0) * (Number(f.costo_unitario) || 0));
    const cambios = filas.map(() => ({}) as Partial<Record<CampoAsociado, number>>);
    for (const { campo, total } of campos) repartirPorPeso(total, pesos).forEach((v, i) => (cambios[i][campo] = v));
    const quien = { costos_por: acceso.usuario.id, costos_por_nombre: acceso.usuario.nombre || acceso.usuario.email, costos_en: new Date().toISOString(), actualizado_en: new Date().toISOString() };
    for (let i = 0; i < filas.length; i++) {
      const { error: e } = await supabase.from("fin_costos_lotes").update({ ...cambios[i], ...quien }).eq("id", String(filas[i].id));
      if (e) return { error: `No se pudo guardar: ${e.message}` };
      await registrarAuditoria({
        accion: "editar_costo_producto",
        entidad: "fin_costos_lotes",
        entidadId: String(filas[i].id),
        detalle: `${String(filas[i].producto)} · ${String(filas[i].linea)} · repartido de la compra entre ${filas.length} productos`,
        antes: Object.fromEntries(campos.map(({ campo }) => [etiquetaDe(campo), usd(Number(filas[i][campo] ?? 0))])),
        despues: Object.fromEntries(campos.map(({ campo }) => [etiquetaDe(campo), usd(cambios[i][campo] ?? 0)])),
      });
    }
    const { data: despues } = await supabase.from("fin_costos_lotes").select("id, costo_total").in("id", ids);
    const total = new Map((despues ?? []).map((d) => [String(d.id), Number(d.costo_total)]));
    revalidatePath("/costos-mercancia");
    return { filas: filas.map((f, i) => ({ id: String(f.id), asociados: cambios[i], costoTotal: total.get(String(f.id)) ?? 0 })) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

export interface MovimientoLibro {
  id: string;
  fecha: string | null;
  descripcion: string;
  tipo: string;
  monto: number;
  comision: boolean;
}

/**
 * Lo que hay en el Libro de movimientos con el código de esta compra (en la descripción o la factura): las comisiones
 * bancarias y de cambio del pago al proveedor se proponen para no buscarlas a mano. Solo lectura.
 */
export async function buscarMovimientosCompra(codigo: string): Promise<{ error: string } | { movimientos: MovimientoLibro[] }> {
  const acceso = await exigirAcceso({ modulo: MODULO });
  if (!acceso.usuario) return { error: acceso.error ?? "Sin acceso." };
  const limpio = String(codigo ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{3,30}$/.test(limpio)) return { movimientos: [] };
  const supabase = createServiceClient();
  const sel = "id, fecha_pago, fecha_registro, periodo, descripcion, monto, tipo_texto, fin_tipos(nombre)";
  const [porDesc, porFactura] = await Promise.all([
    supabase.from("fin_movimientos").select(sel).ilike("descripcion", `%${limpio}%`).limit(30),
    supabase.from("fin_movimientos").select(sel).ilike("factura_numero", `%${limpio}%`).limit(30),
  ]);
  if (porDesc.error) return { error: "No se pudo leer el Libro de movimientos." };
  const vistos = new Set<string>();
  const movimientos: MovimientoLibro[] = [];
  for (const m of [...(porDesc.data ?? []), ...(porFactura.data ?? [])] as Record<string, unknown>[]) {
    if (vistos.has(String(m.id))) continue;
    vistos.add(String(m.id));
    const t = m.fin_tipos as { nombre?: string } | { nombre?: string }[] | null;
    const tipo = String((Array.isArray(t) ? t[0]?.nombre : t?.nombre) ?? m.tipo_texto ?? "");
    const texto = `${tipo} ${String(m.descripcion ?? "")}`.toLowerCase();
    movimientos.push({
      id: String(m.id),
      fecha: String(m.fecha_pago ?? m.fecha_registro ?? m.periodo ?? "").slice(0, 10) || null,
      descripcion: String(m.descripcion ?? ""),
      tipo,
      monto: Number(m.monto ?? 0),
      comision: /comisi|banc|cargo|cambio|swift|transfer/.test(texto),
    });
  }
  movimientos.sort((a, b) => Number(b.comision) - Number(a.comision) || (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  return { movimientos: movimientos.slice(0, 30) };
}

/** La actividad de una fila de la hoja (quién cambió qué y cuándo). */
export async function obtenerHistorialCostoFila(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  const acceso = await exigirAcceso({ modulo: MODULO });
  if (!acceso.usuario) return { error: acceso.error ?? "Sin acceso." };
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Fila no válida." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "fin_costos_lotes")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(40);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}
