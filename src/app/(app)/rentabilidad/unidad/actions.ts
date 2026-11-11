"use server";

import { sinAccesoARegistros, sinAccesoAUnidades } from "@/lib/finanzas/acceso-tienda";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { detectarAdjunto } from "@/lib/compras/adjuntos";
import { SIN_MIGRACION_UE } from "@/lib/finanzas/cargar-unidad-economica";
import { claveFilaMeta, leerCsvMeta, MAX_BYTES_META, TEXTO_MAX_META } from "@/lib/finanzas/meta-ads-csv";
import { CLAVE_SUPUESTOS_UE, leerSupuestosUE, validarSupuestosUE } from "@/lib/finanzas/unidad-economica";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "rentabilidad";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUTAS = ["/rentabilidad/productos", "/rentabilidad/pedidos", "/rentabilidad/zonas", "/rentabilidad/marketing", "/rentabilidad/equilibrio"];

const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });
const revalidar = () => RUTAS.forEach((r) => revalidatePath(r));

async function tiendasActivas(): Promise<string[]> {
  const { data } = await createServiceClient().from("fin_unidades").select("id");
  return (data ?? []).map((u) => String(u.id));
}

/** Guarda los supuestos de la unidad económica (envío, devolución, comisiones, margen objetivo y fijos por tienda). */
export async function guardarSupuestosUE(entrada: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const v = validarSupuestosUE(entrada, await tiendasActivas());
    if ("error" in v) return v;
    const supabase = createServiceClient();
    const { data: antes, error: e1 } = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_SUPUESTOS_UE).maybeSingle();
    if (e1) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave: CLAVE_SUPUESTOS_UE, valor: v.valor, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudieron guardar los supuestos." };
    const a = leerSupuestosUE(antes?.valor);
    const d = v.supuestos;
    const resumen = (s: typeof d) => ({
      "Envío por orden": String(s.envioPorOrden),
      "Vuelta (× envío)": String(s.envioVueltaFactor),
      "Producto perdido %": String(s.perdidaDevolucionPct),
      "Margen objetivo %": String(s.margenObjetivoPct),
      "Comisiones %": Object.entries(s.comisionPct).map(([k, x]) => `${k} ${x}`).join(", "),
      "Fijos por tienda": String(Object.keys(s.fijosPorTienda).length),
    });
    await registrarAuditoria({ accion: "ajustar_supuestos_unidad", entidad: "fin_config", detalle: "Supuestos de la unidad económica", antes: resumen(a), despues: resumen(d) });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudieron guardar los supuestos.");
  }
}

export interface ResultadoImportacionMeta {
  filas: number;
  asignadas: number;
  sinAsignar: number;
  errores: { fila: number; motivo: string }[];
  gasto: number;
}

/**
 * Importa el CSV de exportación de Meta Ads Manager. El archivo se revisa por su contenido (texto sin bytes nulos ni HTML,
 * `detectarAdjunto`), se vuelve a leer aquí (`leerCsvMeta`) y cada fila (día + campaña + conjunto) se guarda o se
 * actualiza por su llave; la tienda y el producto que ya tenía no se pisan. Al final se aplican las reglas de nombre.
 */
export async function importarMetaCsv(formulario: FormData): Promise<{ error: string } | ResultadoImportacionMeta> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const archivo = formulario.get("archivo");
    if (!(archivo instanceof File)) return { error: "Elige el CSV exportado de Meta Ads Manager." };
    if (archivo.size <= 0 || archivo.size > MAX_BYTES_META) return { error: `El archivo debe pesar menos de ${TEXTO_MAX_META}.` };
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const nombre = (archivo.name || "meta.csv").replace(/[^\w .\-()]/g, "").slice(0, 120) || "meta.csv";
    // Se revisa como CSV sea cual sea la extensión: texto sin bytes nulos y que no sea una página web.
    const tipo = detectarAdjunto(bytes, "meta.csv");
    if (!tipo || tipo.clase !== "documento" || !tipo.tipo.startsWith("text/plain")) return { error: "El archivo no es un CSV de texto." };
    const lectura = leerCsvMeta(new TextDecoder("utf-8").decode(bytes));
    if (lectura.faltan.length) return { error: `Faltan columnas: ${lectura.faltan.join(", ")}.` };
    if (lectura.moneda && lectura.moneda !== "USD") return { error: `El gasto viene en ${lectura.moneda}: exporta el informe en USD.` };
    if (!lectura.filas.length) return { error: lectura.errores.length ? `Ninguna fila válida (${lectura.errores[0].motivo})` : "El archivo no tiene filas." };

    const supabase = createServiceClient();
    const lote = randomUUID();
    const ahora = new Date().toISOString();
    const filas = lectura.filas.map((f) => ({
      fecha: f.fecha,
      fecha_fin: f.fechaFin,
      campana: f.campana,
      conjunto: f.conjunto,
      gasto: f.gasto,
      compras: f.compras,
      moneda: "USD",
      archivo: nombre,
      lote,
      origen_clave: createHash("sha256").update(claveFilaMeta(f)).digest("hex"),
      creado_por: usuario.id,
      actualizado_en: ahora,
    }));
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await supabase.from("mkt_meta_campanas").upsert(filas.slice(i, i + 500), { onConflict: "origen_clave" });
      if (error) {
        console.error("importarMetaCsv:", error.message);
        return { error: i === 0 ? SIN_MIGRACION_UE : `Se guardaron ${i} filas y falló el resto. Vuelve a importar el archivo.` };
      }
    }
    const reglas = await supabase.rpc("mkt_meta_aplicar_reglas");
    if (reglas.error) console.error("mkt_meta_aplicar_reglas:", reglas.error.message);
    const { data: delLote } = await supabase.from("mkt_meta_campanas").select("unidad_id").eq("lote", lote);
    const asignadas = (delLote ?? []).filter((x) => x.unidad_id).length;
    const gasto = Math.round(filas.reduce((a, f) => a + f.gasto, 0) * 100) / 100;
    await registrarAuditoria({
      accion: "importar_meta_ads",
      entidad: "mkt_meta_campanas",
      detalle: `${nombre}: ${filas.length} filas, gasto US$${gasto.toLocaleString("es-PA")}, ${asignadas} asignadas${lectura.errores.length ? `, ${lectura.errores.length} con error` : ""}`.slice(0, 1000),
    });
    revalidar();
    return { filas: filas.length, asignadas, sinAsignar: filas.length - asignadas, errores: lectura.errores.slice(0, 50), gasto };
  } catch (e) {
    return fallo(e, "No se pudo importar el archivo.");
  }
}

/** Una regla de nombre: si la campaña o el conjunto contiene `patron`, es de esa tienda (y de ese producto). */
export async function crearReglaMeta(entrada: { patron?: unknown; unidadId?: unknown; productoClave?: unknown; prioridad?: unknown }): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const patron = typeof entrada.patron === "string" ? entrada.patron.replace(/\s+/g, " ").trim() : "";
    if (patron.length < 2 || patron.length > 120) return { error: "El texto a buscar va de 2 a 120 caracteres." };
    const unidadId = typeof entrada.unidadId === "string" && UUID.test(entrada.unidadId) ? entrada.unidadId : null;
    if (!unidadId || !(await tiendasActivas()).includes(unidadId)) return { error: "Elige la tienda." };
    const acceso = await sinAccesoAUnidades([unidadId]);
    if (acceso) return { error: acceso };
    const producto = typeof entrada.productoClave === "string" ? entrada.productoClave.trim().slice(0, 200) : "";
    const prioridad = Number(entrada.prioridad ?? 100);
    if (!Number.isInteger(prioridad) || prioridad < 0 || prioridad > 1000) return { error: "La prioridad va de 0 a 1000." };
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("mkt_meta_reglas")
      .insert({ patron, unidad_id: unidadId, producto_clave: producto || null, prioridad, creado_por: usuario.id })
      .select("id")
      .single();
    if (error) return { error: error.code === "23505" ? "Esa regla ya existe." : SIN_MIGRACION_UE };
    await supabase.rpc("mkt_meta_aplicar_reglas");
    await registrarAuditoria({
      accion: "crear_regla_meta",
      entidad: "mkt_meta_reglas",
      entidadId: String(data.id),
      detalle: `«${patron}»${producto ? ` → ${producto}` : ""}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo crear la regla.");
  }
}

export async function eliminarReglaMeta(id: unknown): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Regla inválida." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "mkt_meta_reglas", [id]);
    if (acceso) return { error: acceso };
    const { data: antes } = await supabase.from("mkt_meta_reglas").select("patron, producto_clave").eq("id", id).maybeSingle();
    if (!antes) return { error: "La regla ya no existe." };
    const { error } = await supabase.from("mkt_meta_reglas").delete().eq("id", id);
    if (error) return { error: "No se pudo eliminar la regla." };
    await supabase.rpc("mkt_meta_aplicar_reglas");
    await registrarAuditoria({ accion: "eliminar_regla_meta", entidad: "mkt_meta_reglas", entidadId: id, detalle: `«${antes.patron}»` });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo eliminar la regla.");
  }
}
