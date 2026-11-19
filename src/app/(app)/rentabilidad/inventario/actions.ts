"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { CLAVE_TASA, cargarInventario } from "@/lib/finanzas/cargar-inventario";
import { ajusteProvision, CLAVE_CONSIGNACION, claveProvision, leerConsignacion, provisionObsoleto, separarConsignacion, TIPO_PROVISION } from "@/lib/finanzas/inventario-contable";
import { ajusteConteo, claveBusqueda, leerTasa, resumirInventario, validarFilaConteo } from "@/lib/finanzas/inventario-valorizado";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { createServiceClient } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import {
  AJUSTES_EDITABLES,
  CLAVE_ALERTA_COSTO,
  CLAVE_REORDEN,
  CLAVE_SOBRESTOCK,
  claveMerma,
  esAjusteEditable,
  esModoMerma,
  montoMerma,
  validarAjuste,
} from "@/lib/finanzas/inventario-decisiones";
import { PAIS_FINANZAS } from "@/lib/finanzas/cargar-inventario";
import { paisDeOperacionActual } from "@/lib/finanzas/pais-servidor";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";

const MODULO = "rentabilidad";
/** Un conteo mueve el stock del WMS: hace falta poder modificar Inventario. */
const MODULO_INVENTARIO = "inventario";
const MAX_FILAS = 400;

const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });

/** Cambia la tasa anual del costo de mantener inventario (en %, de 0 a 100). */
export async function guardarTasaMantener(porcentaje: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const accesoEmpresa = await sinAccesoTodaLaEmpresa();
    if (accesoEmpresa) return { error: accesoEmpresa };
    const n = typeof porcentaje === "number" ? porcentaje : typeof porcentaje === "string" ? Number(porcentaje.replace(",", ".")) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: "La tasa va de 0 a 100 %." };
    const valor = Math.round(n * 100) / 10_000;
    const supabase = createServiceClient();
    const { data: antes, error: e1 } = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_TASA).maybeSingle();
    if (e1) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave: CLAVE_TASA, valor, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudo guardar la tasa." };
    const pct = (v: number) => `${(v * 100).toLocaleString("es-PA", { maximumFractionDigits: 2 })} %`;
    await registrarAuditoria({
      accion: "ajustar_tasa_inventario",
      entidad: "fin_config",
      detalle: `Costo de mantener inventario: ${pct(valor)} anual`,
      antes: { Tasa: pct(leerTasa(antes?.valor)) },
      despues: { Tasa: pct(valor) },
    });
    revalidatePath("/rentabilidad/inventario");
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar la tasa.");
  }
}

export interface ResultadoConteo {
  ajustados: number;
  sinCambio: number;
  /** Ajustes que quedaron pendientes de aprobación (mejora 79). */
  enAprobacion: number;
  rechazados: { fila: number; motivo: string }[];
}

type FilaValida = NonNullable<ReturnType<typeof validarFilaConteo>>;
interface Diferencia {
  f: FilaValida;
  skuId: string;
  codigo: string;
  bodegaId: string;
  bodega: string;
  actual: number;
  delta: number;
}

/**
 * Revisa las filas de un conteo contra el WMS: rechaza lo que no se puede ajustar y, de lo demás, calcula la diferencia
 * entre lo contado y lo que dice el WMS hoy. Con `aplicar`, registra cada ajuste con la función de siempre
 * (`wms_registrar_movimiento`, origen «conteo»), nunca escribiendo `wms_stock`.
 */
async function procesarConteo(
  supabase: ReturnType<typeof createServiceClient>,
  usuario: { id: string; paisesPermitidos: string[] | null },
  nombreArchivo: string,
  filas: unknown[],
  aplicar: boolean,
): Promise<{ error: string } | { resultado: ResultadoConteo; diferencias: Diferencia[]; validas: FilaValida[] }> {
  const [skus, bodegas] = await Promise.all([
    supabase.from("skus_maestros").select("id, codigo, nombre, tipo, clase, maneja_vencimiento, codigo_barras"),
    supabase.from("wms_bodegas").select("id, nombre, codigo, tipo, pais_id, paises(codigo)"),
  ]);
  if (skus.error || bodegas.error) return { error: "No se pudo leer el WMS (productos o bodegas)." };
  type Sku = { id: string; codigo: string; nombre: string; tipo: string; clase: string; maneja_vencimiento: boolean; codigo_barras: string | null };
  const porClave = new Map<string, Sku[]>();
  for (const s of (skus.data ?? []) as Sku[]) {
    for (const k of new Set([s.codigo, s.codigo_barras, s.nombre].filter((x): x is string => !!x).map(claveBusqueda))) porClave.set(k, [...(porClave.get(k) ?? []), s]);
  }
  type Bodega = { id: string; nombre: string; codigo: string | null; tipo: string; paises: { codigo: string } | { codigo: string }[] | null };
  const visibles = ((bodegas.data ?? []) as Bodega[]).filter((b) => {
    const p = Array.isArray(b.paises) ? b.paises[0] : b.paises;
    return p?.codigo ? puedeVerPais(usuario.paisesPermitidos, p.codigo) : false;
  });
  const resultado: ResultadoConteo = { ajustados: 0, sinCambio: 0, enAprobacion: 0, rechazados: [] };
  const diferencias: Diferencia[] = [];
  const validas: FilaValida[] = [];
  for (const crudo of filas) {
    const f = validarFilaConteo(crudo);
    if (!f) {
      resultado.rechazados.push({ fila: 0, motivo: "Fila inválida." });
      continue;
    }
    const rechazar = (motivo: string) => resultado.rechazados.push({ fila: f.fila, motivo: `${f.producto}: ${motivo}` });
    const candidatos = porClave.get(claveBusqueda(f.producto)) ?? [];
    if (candidatos.length !== 1) {
      rechazar(candidatos.length ? "el nombre es de varios productos, usa el código." : "no existe en Producto.");
      continue;
    }
    const sku = candidatos[0];
    const kb = claveBusqueda(f.bodega);
    const bods = visibles.filter((b) => claveBusqueda(b.nombre) === kb || (b.codigo && claveBusqueda(b.codigo) === kb));
    if (bods.length !== 1) {
      rechazar(bods.length ? `la bodega «${f.bodega}» existe en varios países, usa una que no se repita.` : `no conozco la bodega «${f.bodega}».`);
      continue;
    }
    const bodega = bods[0];
    if (sku.tipo === "combo") {
      rechazar("es un compuesto: se cuenta por sus componentes.");
      continue;
    }
    if (sku.clase === "test") {
      rechazar("es un producto de prueba: no tiene stock.");
      continue;
    }
    if (bodega.tipo === "externa") {
      rechazar(`«${bodega.nombre}» es externa: su stock llega por sincronización.`);
      continue;
    }
    if (sku.maneja_vencimiento && !f.lote) {
      rechazar("maneja vencimiento: indica el lote.");
      continue;
    }
    if (!sku.maneja_vencimiento && f.lote) {
      rechazar("no maneja vencimiento: quita el lote.");
      continue;
    }
    // Lo que dice el WMS hoy (del lote, si lo hay).
    let actual = 0;
    if (f.lote) {
      const { data: lote } = await supabase.from("wms_lotes").select("id, codigo").eq("sku_maestro_id", sku.id);
      const l = (lote ?? []).find((x) => claveBusqueda(String(x.codigo)) === claveBusqueda(f.lote!));
      if (!l) {
        rechazar(`el lote ${f.lote} no existe: entra con una entrada en Inventario (necesita su fecha de vencimiento).`);
        continue;
      }
      const { data: sl } = await supabase.from("wms_stock_lote").select("cantidad").eq("lote_id", l.id).eq("bodega_id", bodega.id).maybeSingle();
      actual = Number(sl?.cantidad ?? 0);
    } else {
      const { data: st } = await supabase.from("wms_stock").select("fisico").eq("sku_maestro_id", sku.id).eq("bodega_id", bodega.id).maybeSingle();
      actual = Number(st?.fisico ?? 0);
    }
    validas.push(f);
    const delta = ajusteConteo(f.unidades, actual);
    if (delta === 0) {
      resultado.sinCambio++;
      continue;
    }
    if (!aplicar) {
      diferencias.push({ f, skuId: sku.id, codigo: sku.codigo, bodegaId: bodega.id, bodega: bodega.nombre, actual, delta });
      continue;
    }
    const { error } = await supabase.rpc("wms_registrar_movimiento", {
      p_sku: sku.id,
      p_bodega: bodega.id,
      p_tipo: "ajuste",
      p_cantidad: delta,
      p_ubicacion: null,
      p_origen: "conteo",
      p_referencia: nombreArchivo,
      p_motivo: `Conteo físico: ${f.unidades} contadas (${nombreArchivo})`.slice(0, 500),
      p_usuario: usuario.id,
      p_lote: null,
      p_lote_codigo: f.lote,
      p_vencimiento: null,
    });
    if (error) {
      rechazar(error.message.length < 200 ? error.message : "no se pudo registrar el ajuste.");
      continue;
    }
    resultado.ajustados++;
    diferencias.push({ f, skuId: sku.id, codigo: sku.codigo, bodegaId: bodega.id, bodega: bodega.nombre, actual, delta });
  }
  return { resultado, diferencias, validas };
}

/**
 * Carga un lote (≤ 400 filas) de un conteo físico (mejora 79): no mueve el stock. Revisa las filas y, si alguna cambia el
 * WMS, deja una solicitud pendiente con su soporte; los ajustes se aplican cuando otra persona la aprueba. Volver a
 * cargar el mismo conteo después de aprobado no mueve nada (la diferencia ya es cero).
 */
export async function importarConteo(archivo: unknown, filas: unknown[], soporte: unknown): Promise<{ error: string } | ResultadoConteo> {
  try {
    const usuario = await requireModuloEscritura(MODULO_INVENTARIO);
    const accesoEmpresa = await sinAccesoTodaLaEmpresa();
    if (accesoEmpresa) return { error: accesoEmpresa };
    if (!Array.isArray(filas) || !filas.length || filas.length > MAX_FILAS) return { error: "Lote inválido." };
    const sop = typeof soporte === "string" ? soporte.replace(/\s+/g, " ").trim().slice(0, 500) : "";
    if (sop.length < 5) return { error: "Escribe el soporte del conteo (quién contó, cuándo, el acta o el archivo firmado)." };
    const nombreArchivo = typeof archivo === "string" ? archivo.replace(/[^\w .\-()]/g, "").slice(0, 120) || "conteo.xlsx" : "conteo.xlsx";
    const supabase = createServiceClient();
    const r = await procesarConteo(supabase, usuario, nombreArchivo, filas, false);
    if ("error" in r) return r;
    if (!r.diferencias.length) return r.resultado;
    const { data, error } = await supabase
      .from("fin_ajustes_inventario")
      .insert({
        archivo: nombreArchivo,
        soporte: sop,
        filas: r.diferencias.map((d) => d.f),
        diferencias: r.diferencias.map((d) => ({ codigo: d.codigo, bodega: d.bodega, lote: d.f.lote, actual: d.actual, contado: d.f.unidades, diferencia: d.delta })),
        solicitado_por: usuario.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message.includes("fin_ajustes_inventario") ? "Falta correr la migración 0990 (aprobación de ajustes) en Supabase." : "No se pudo guardar la solicitud." };
    await registrarAuditoria({
      accion: "pedir_ajuste_inventario",
      entidad: "wms_stock",
      entidadId: data.id as string,
      detalle: `${nombreArchivo}: ${r.diferencias.length} ajustes por aprobar · Soporte: ${sop}`.slice(0, 1000),
    });
    revalidatePath("/rentabilidad/inventario/conteo");
    return { ...r.resultado, enAprobacion: r.diferencias.length };
  } catch (e) {
    return fallo(e, "No se pudo cargar el conteo.");
  }
}

/** Aprueba (aplica al WMS) o rechaza una solicitud de ajustes de un conteo. No la resuelve quien la pidió, salvo un administrador. */
export async function resolverAjusteInventario(id: unknown, aprobar: unknown, motivo: unknown): Promise<{ error?: string; ajustados?: number }> {
  try {
    const usuario = await requireModuloEscritura(MODULO_INVENTARIO);
    const accesoEmpresa = await sinAccesoTodaLaEmpresa();
    if (accesoEmpresa) return { error: accesoEmpresa };
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Solicitud inválida." };
    const supabase = createServiceClient();
    const { data: s } = await supabase.from("fin_ajustes_inventario").select("id, archivo, soporte, filas, estado, solicitado_por").eq("id", id).maybeSingle();
    if (!s) return { error: "La solicitud ya no existe." };
    if (s.estado !== "pendiente") return { error: "La solicitud ya se resolvió." };
    const esAdmin = usuario.modulos.includes("usuarios") && !usuario.modulosSoloLectura.includes("usuarios");
    if (s.solicitado_por === usuario.id && !esAdmin) return { error: "La aprueba o rechaza otra persona, no quien la pidió." };
    const ahora = new Date().toISOString();
    if (aprobar !== true) {
      const m = typeof motivo === "string" ? motivo.trim().slice(0, 500) : "";
      if (m.length < 3) return { error: "Escribe por qué se rechaza." };
      const { error } = await supabase.from("fin_ajustes_inventario").update({ estado: "rechazado", motivo_rechazo: m, resuelto_por: usuario.id, resuelto_en: ahora }).eq("id", id).eq("estado", "pendiente");
      if (error) return { error: error.message };
      await registrarAuditoria({ accion: "rechazar_ajuste_inventario", entidad: "wms_stock", entidadId: id, detalle: `${s.archivo}: ${m}` });
      revalidatePath("/rentabilidad/inventario/conteo");
      return {};
    }
    // Se marca primero, para que dos aprobaciones a la vez no apliquen dos veces.
    const { data: tomada } = await supabase.from("fin_ajustes_inventario").update({ estado: "aprobado", resuelto_por: usuario.id, resuelto_en: ahora }).eq("id", id).eq("estado", "pendiente").select("id");
    if (!tomada?.length) return { error: "La solicitud ya se resolvió." };
    const r = await procesarConteo(supabase, usuario, String(s.archivo), Array.isArray(s.filas) ? s.filas : [], true);
    if ("error" in r) {
      await supabase.from("fin_ajustes_inventario").update({ estado: "pendiente", resuelto_por: null, resuelto_en: null }).eq("id", id);
      return r;
    }
    await supabase.from("fin_ajustes_inventario").update({ resultado: r.resultado }).eq("id", id);
    await registrarAuditoria({
      accion: "conteo_inventario",
      entidad: "wms_stock",
      entidadId: id,
      detalle: `${s.archivo} (aprobado): ${r.resultado.ajustados} ajustes · ${r.diferencias
        .slice(0, 20)
        .map((d) => `${d.codigo} ${d.delta > 0 ? "+" : ""}${d.delta}${d.f.lote ? ` lote ${d.f.lote}` : ""} en ${d.bodega}`)
        .join(", ")} · Soporte: ${s.soporte}`.slice(0, 1000),
    });
    revalidatePath("/inventario");
    revalidatePath("/rentabilidad/inventario");
    revalidatePath("/rentabilidad/inventario/conteo");
    revalidatePath("/rentabilidad/capital-trabajo");
    return { ajustados: r.resultado.ajustados };
  } catch (e) {
    return fallo(e, "No se pudo resolver la solicitud.");
  }
}

// ---------------------------------------------------------------------------------------------
// Ajustes de las decisiones de inventario (migración 0935)
// ---------------------------------------------------------------------------------------------
/** Cambia un ajuste: días de sobrestock, alza de costo que alerta, días de seguridad o de cobertura del reorden. */
export async function guardarAjusteInventario(clave: unknown, valor: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const accesoEmpresa = await sinAccesoTodaLaEmpresa();
    if (accesoEmpresa) return { error: accesoEmpresa };
    if (!esAjusteEditable(clave)) return { error: "Ajuste inválido." };
    const v = validarAjuste(clave, valor);
    if ("error" in v) return v;
    const supabase = createServiceClient();
    let filaClave: string = CLAVE_SOBRESTOCK;
    let nuevo: unknown = v.valor;
    let antes: unknown = null;
    if (clave === "alertaCosto") filaClave = CLAVE_ALERTA_COSTO;
    if (clave === "seguridad" || clave === "cobertura") {
      filaClave = CLAVE_REORDEN;
      const { data, error } = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_REORDEN).maybeSingle();
      if (error) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };
      const previo = data?.valor && typeof data.valor === "object" ? (data.valor as Record<string, unknown>) : {};
      antes = previo[clave] ?? null;
      nuevo = { ...previo, [clave]: v.valor };
    } else {
      const { data, error } = await supabase.from("fin_config").select("valor").eq("clave", filaClave).maybeSingle();
      if (error) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };
      antes = data?.valor ?? null;
    }
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave: filaClave, valor: nuevo, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudo guardar el ajuste." };
    const texto = (x: unknown) => (x === null || x === undefined ? "—" : clave === "alertaCosto" ? `${Math.round(Number(x) * 1000) / 10} %` : String(x));
    await registrarAuditoria({
      accion: "ajustar_inventario_finanzas",
      entidad: "fin_config",
      detalle: `${AJUSTES_EDITABLES[clave].etiqueta}: ${texto(v.valor)}`,
      antes: { [AJUSTES_EDITABLES[clave].etiqueta]: texto(antes) },
      despues: { [AJUSTES_EDITABLES[clave].etiqueta]: texto(v.valor) },
    });
    revalidatePath("/rentabilidad/inventario");
    revalidatePath("/rentabilidad/inventario/reorden");
    revalidatePath("/rentabilidad/compras");
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar el ajuste.");
  }
}

// ---------------------------------------------------------------------------------------------
// 74. Merma del conteo físico al libro (EERR)
// ---------------------------------------------------------------------------------------------
const TIPO_MERMA = "Merma y faltantes de inventario";
const UNIDAD_MERMA = "A DISTRIBUIR";

/**
 * Lleva al libro la merma de un mes del conteo físico: un movimiento «Merma y faltantes de inventario» en A DISTRIBUIR
 * (se reparte entre las tiendas por envíos), en el EERR y fuera del flujo (no mueve caja). Uno por mes: volver a
 * llevarlo lo actualiza; con monto cero se quita. Un mes cerrado lo rechaza el bloqueo del cierre; un movimiento
 * editado a mano en el libro no se pisa. Pide poder modificar Rentabilidad y el Libro de movimientos.
 */
export async function llevarMermaAlLibro(mes: unknown, modo: unknown): Promise<{ error?: string; monto?: number }> {
  try {
    await requireModuloEscritura(MODULO);
    const accesoEmpresa = await sinAccesoTodaLaEmpresa();
    if (accesoEmpresa) return { error: accesoEmpresa };
    const usuario = await requireModuloEscritura("libro-movimientos");
    if (typeof mes !== "string" || !/^\d{4}-\d{2}-01$/.test(mes)) return { error: "Mes inválido." };
    if (!esModoMerma(modo)) return { error: "Modo inválido." };
    if (mes > hoyPanama()) return { error: "Ese mes todavía no empezó." };
    if ((await paisDeOperacionActual(usuario.paisesPermitidos)) !== PAIS_FINANZAS) return { error: "Llevar la merma al libro es solo de Panamá por ahora: cambia el país en la barra de arriba." };
    const supabase = createServiceClient();
    const { data: filas, error: e1 } = await supabase.rpc("fin_merma_conteo", { p_desde: mes, p_pais: PAIS_FINANZAS });
    if (e1) return { error: "Falta correr la migración 0935 (inventario y compras) en Supabase." };
    const delMes = ((filas ?? []) as Record<string, unknown>[]).filter((f) => String(f.mes).slice(0, 10) === mes);
    const valorFaltante = delMes.reduce((a, f) => a + (Number(f.valor_faltante) || 0), 0);
    const valorSobrante = delMes.reduce((a, f) => a + (Number(f.valor_sobrante) || 0), 0);
    const monto = montoMerma({ valorFaltante, valorSobrante }, modo);
    const [tipo, unidad, previo] = await Promise.all([
      supabase.from("fin_tipos").select("id").eq("nombre", TIPO_MERMA).maybeSingle(),
      supabase.from("fin_unidades").select("id").eq("nombre", UNIDAD_MERMA).maybeSingle(),
      supabase.from("fin_movimientos").select("id, monto, editado_a_mano").eq("origen_clave", claveMerma(mes)).maybeSingle(),
    ]);
    if (!tipo.data?.id) return { error: "Falta correr la migración 0935 (tipo «Merma y faltantes de inventario»)." };
    if (!unidad.data?.id) return { error: `No existe la unidad ${UNIDAD_MERMA} en el libro.` };
    if (previo.data?.editado_a_mano) return { error: "El movimiento de merma de ese mes se corrigió a mano en el libro: cámbialo ahí." };
    const descripcion = `Merma del conteo físico ${mes.slice(0, 7)} (${modo === "neto" ? "faltantes menos sobrantes" : "faltantes"})`;
    let error: { message: string } | null = null;
    if (previo.data?.id && Math.abs(monto) < 0.005) {
      ({ error } = await supabase.from("fin_movimientos").delete().eq("id", previo.data.id));
    } else if (previo.data?.id) {
      ({ error } = await supabase.from("fin_movimientos").update({ monto, descripcion, actualizado_en: new Date().toISOString() }).eq("id", previo.data.id));
    } else if (Math.abs(monto) >= 0.005) {
      ({ error } = await supabase.from("fin_movimientos").insert({
        periodo: mes,
        fecha_registro: hoyPanama(),
        unidad_id: unidad.data.id,
        tipo_id: tipo.data.id,
        descripcion,
        en_eerr: true,
        en_flujo: false,
        monto,
        origen: "inventario",
        origen_clave: claveMerma(mes),
        creado_por: usuario.id,
      }));
    } else {
      return { error: "Ese mes no tiene merma valorizada." };
    }
    if (error) return { error: error.message.includes("está cerrado") ? error.message : "No se pudo guardar el movimiento en el libro." };
    await registrarAuditoria({
      accion: "merma_al_libro",
      entidad: "fin_movimientos",
      entidadId: previo.data?.id ?? undefined,
      detalle: descripcion,
      antes: { Monto: previo.data ? dinero(Number(previo.data.monto), "USD", { decimales: 2 }) : "—" },
      despues: { Monto: dinero(monto, "USD", { decimales: 2 }) },
    });
    revalidatePath("/rentabilidad/inventario");
    revalidatePath("/estado-resultados");
    revalidatePath("/libro-movimientos");
    return { monto };
  } catch (e) {
    return fallo(e, "No se pudo llevar la merma al libro.");
  }
}

// ---------------------------------------------------------------------------------------------
// Inventario contable (mejoras 73 y 78, migración 0990)
// ---------------------------------------------------------------------------------------------

/** Las bodegas cuya mercancía no es nuestra (consignación): no suman al inventario contable. */
export async function guardarConsignacion(bodegas: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const accesoEmpresa = await sinAccesoTodaLaEmpresa();
    if (accesoEmpresa) return { error: accesoEmpresa };
    const lista = leerConsignacion(bodegas);
    const supabase = createServiceClient();
    if (lista.length) {
      const { data } = await supabase.from("wms_bodegas").select("id").in("id", lista);
      if ((data ?? []).length !== lista.length) return { error: "Alguna bodega ya no existe." };
    }
    const [{ data: antes }, nombres] = await Promise.all([
      supabase.from("fin_config").select("valor").eq("clave", CLAVE_CONSIGNACION).maybeSingle(),
      supabase.from("wms_bodegas").select("id, nombre"),
    ]);
    const { error } = await supabase.from("fin_config").upsert({ clave: CLAVE_CONSIGNACION, valor: lista, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "Falta correr la migración 0990 en Supabase." };
    const nombre = new Map((nombres.data ?? []).map((b) => [b.id as string, b.nombre as string]));
    const texto = (ids: string[]) => (ids.length ? ids.map((i) => nombre.get(i) ?? "—").join(", ") : "ninguna");
    await registrarAuditoria({ accion: "inventario_consignacion", entidad: "fin_config", detalle: "Bodegas en consignación", antes: { Bodegas: texto(leerConsignacion(antes?.valor)) }, despues: { Bodegas: texto(lista) } });
    revalidatePath("/rentabilidad/inventario");
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar.");
  }
}

/**
 * Lleva al libro la provisión por inventario obsoleto del mes (mejora 73): la provisión de hoy (120 a 179 días sin
 * salidas, 50 %; 180 o más, 100 %) menos lo ya provisionado en meses anteriores, en A DISTRIBUIR, en el EERR y fuera del
 * flujo. Uno por mes: volver a llevarlo lo actualiza. Solo Panamá; pide poder modificar Rentabilidad y el Libro.
 */
export async function llevarProvisionAlLibro(): Promise<{ error?: string; monto?: number }> {
  try {
    await requireModuloEscritura(MODULO);
    const accesoEmpresa = await sinAccesoTodaLaEmpresa();
    if (accesoEmpresa) return { error: accesoEmpresa };
    const usuario = await requireModuloEscritura("libro-movimientos");
    if ((await paisDeOperacionActual(usuario.paisesPermitidos)) !== PAIS_FINANZAS) return { error: "La provisión va al libro de Panamá: cambia el país en la barra de arriba." };
    const hoy = hoyPanama();
    const mes = `${hoy.slice(0, 7)}-01`;
    const supabase = createServiceClient();
    const [datos, cfg] = await Promise.all([cargarInventario(supabase, PAIS_FINANZAS), supabase.from("fin_config").select("valor").eq("clave", CLAVE_CONSIGNACION).maybeSingle()]);
    if ("error" in datos) return datos;
    const { propias } = separarConsignacion(datos.filas, leerConsignacion(cfg.data?.valor));
    const r = resumirInventario(propias, datos.vendido, hoy, datos.tasa);
    const provision = provisionObsoleto(r.porProducto, hoy);
    const [tipo, unidad, previo, anteriores] = await Promise.all([
      supabase.from("fin_tipos").select("id").eq("nombre", TIPO_PROVISION).maybeSingle(),
      supabase.from("fin_unidades").select("id").eq("nombre", UNIDAD_MERMA).maybeSingle(),
      supabase.from("fin_movimientos").select("id, monto, editado_a_mano").eq("origen_clave", claveProvision(mes)).maybeSingle(),
      supabase.from("fin_movimientos").select("monto").like("origen_clave", "provision-obsoleto:%").lt("periodo", mes),
    ]);
    if (!tipo.data?.id) return { error: "Falta correr la migración 0990 (tipo «Provisión por inventario obsoleto»)." };
    if (!unidad.data?.id) return { error: `No existe la unidad ${UNIDAD_MERMA} en el libro.` };
    if (previo.data?.editado_a_mano) return { error: "La provisión de este mes se corrigió a mano en el libro: cámbiala ahí." };
    const ya = (anteriores.data ?? []).reduce((a, x) => a + Number(x.monto), 0);
    const monto = ajusteProvision(provision.total, ya);
    const descripcion = `Provisión por inventario obsoleto ${mes.slice(0, 7)}: ${dinero(provision.total, "USD", { decimales: 2 })} de provisión, menos ${dinero(ya, "USD", { decimales: 2 })} ya asentados`;
    let error: { message: string } | null = null;
    if (previo.data?.id && Math.abs(monto) < 0.005) ({ error } = await supabase.from("fin_movimientos").delete().eq("id", previo.data.id));
    else if (previo.data?.id) ({ error } = await supabase.from("fin_movimientos").update({ monto, descripcion, actualizado_en: new Date().toISOString() }).eq("id", previo.data.id));
    else if (Math.abs(monto) >= 0.005)
      ({ error } = await supabase.from("fin_movimientos").insert({
        periodo: mes,
        fecha_registro: hoy,
        unidad_id: unidad.data.id,
        tipo_id: tipo.data.id,
        descripcion,
        en_eerr: true,
        en_flujo: false,
        monto,
        origen: "inventario",
        origen_clave: claveProvision(mes),
        creado_por: usuario.id,
      }));
    else return { error: "La provisión ya está al día: no hay nada que asentar." };
    if (error) return { error: error.message.includes("está cerrado") ? error.message : "No se pudo guardar el movimiento en el libro." };
    await registrarAuditoria({
      accion: "provision_al_libro",
      entidad: "fin_movimientos",
      entidadId: previo.data?.id ?? undefined,
      detalle: descripcion,
      antes: { Monto: previo.data ? dinero(Number(previo.data.monto), "USD", { decimales: 2 }) : "—" },
      despues: { Monto: dinero(monto, "USD", { decimales: 2 }) },
    });
    revalidatePath("/rentabilidad/inventario");
    revalidatePath("/estado-resultados");
    revalidatePath("/libro-movimientos");
    return { monto };
  } catch (e) {
    return fallo(e, "No se pudo llevar la provisión al libro.");
  }
}
