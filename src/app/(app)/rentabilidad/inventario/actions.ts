"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { CLAVE_TASA } from "@/lib/finanzas/cargar-inventario";
import { ajusteConteo, claveBusqueda, leerTasa, validarFilaConteo } from "@/lib/finanzas/inventario-valorizado";
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

const MODULO = "rentabilidad";
/** Un conteo mueve el stock del WMS: hace falta poder modificar Inventario. */
const MODULO_INVENTARIO = "inventario";
const MAX_FILAS = 400;

const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });

/** Cambia la tasa anual del costo de mantener inventario (en %, de 0 a 100). */
export async function guardarTasaMantener(porcentaje: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
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
  rechazados: { fila: number; motivo: string }[];
}

/**
 * Carga un lote (≤ 400 filas) de un conteo físico: por cada producto y bodega, un AJUSTE por la diferencia entre lo
 * contado y lo que dice el WMS, con la función de siempre (`wms_registrar_movimiento`, origen «conteo»), nunca
 * escribiendo `wms_stock`. Volver a cargar el mismo conteo no mueve nada (la diferencia ya es cero). Una bodega externa
 * no acepta movimientos a mano y un producto con vencimiento necesita el lote: esas filas se rechazan y se dicen.
 */
export async function importarConteo(archivo: unknown, filas: unknown[]): Promise<{ error: string } | ResultadoConteo> {
  try {
    const usuario = await requireModuloEscritura(MODULO_INVENTARIO);
    if (!Array.isArray(filas) || !filas.length || filas.length > MAX_FILAS) return { error: "Lote inválido." };
    const nombreArchivo = typeof archivo === "string" ? archivo.replace(/[^\w .\-()]/g, "").slice(0, 120) || "conteo.xlsx" : "conteo.xlsx";
    const supabase = createServiceClient();
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
    const resultado: ResultadoConteo = { ajustados: 0, sinCambio: 0, rechazados: [] };
    const auditoria: string[] = [];
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
      const delta = ajusteConteo(f.unidades, actual);
      if (delta === 0) {
        resultado.sinCambio++;
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
      auditoria.push(`${sku.codigo} ${delta > 0 ? "+" : ""}${delta}${f.lote ? ` lote ${f.lote}` : ""} en ${bodega.nombre}`);
    }
    if (auditoria.length) {
      await registrarAuditoria({
        accion: "conteo_inventario",
        entidad: "wms_stock",
        detalle: `${nombreArchivo}: ${auditoria.length} ajustes · ${auditoria.slice(0, 20).join(", ")}${auditoria.length > 20 ? "…" : ""}`.slice(0, 1000),
      });
      revalidatePath("/inventario");
      revalidatePath("/rentabilidad/inventario");
      revalidatePath("/rentabilidad/capital-trabajo");
    }
    return resultado;
  } catch (e) {
    return fallo(e, "No se pudo cargar el conteo.");
  }
}

// ---------------------------------------------------------------------------------------------
// Ajustes de las decisiones de inventario (migración 0935)
// ---------------------------------------------------------------------------------------------
/** Cambia un ajuste: días de sobrestock, alza de costo que alerta, días de seguridad o de cobertura del reorden. */
export async function guardarAjusteInventario(clave: unknown, valor: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
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
