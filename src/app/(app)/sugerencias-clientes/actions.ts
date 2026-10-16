"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoriaLote } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { getUsuarioActual, requireModulo, requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { MODULO_ATENCION } from "@/lib/crm/areas";
import { motivoYaVisto, yaVisto } from "@/lib/scraping/cruces";
import { cargarReferencias } from "@/lib/scraping/referencias";
import { rutaPropia } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { aciertoCliente, armarSeguimiento, exclusividadDe, PLAZOS_EXCLUSIVIDAD, type Exclusividad, type Seguimiento } from "@/lib/sugerencias/seguimiento";
import { ESTADOS_SUGERENCIA, etiquetaEstadoSugerencia } from "./def-sugerencias";

const MODULO = "sugerencias-clientes";
const ENTIDAD = "sugerencias_clientes";
const RUTA = "/sugerencias-clientes";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS: Set<string> = new Set(ESTADOS_SUGERENCIA.map((e) => e.valor));

const BUCKET_FOTOS = "wms-productos";
const CARPETA_FOTOS = "sugerencias";
const PREFIJO_URL_PUBLICA = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;

const puedeEscribir = (u: { modulos: string[]; modulosSoloLectura: string[] }, modulo: string) => u.modulos.includes(modulo) && !u.modulosSoloLectura.includes(modulo);

const limpiarNombreArchivo = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-120);

/**
 * Permiso (URL firmada) para subir la foto directo desde el navegador. La pide Atención desde el CRM o quien trabaja en
 * Sugerencias de clientes: basta poder escribir en uno de los dos.
 */
export async function prepararSubidaFotoSugerencia(nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !(puedeEscribir(usuario, MODULO_ATENCION) || puedeEscribir(usuario, MODULO))) return { error: "No tienes permiso para subir la foto." };
  if (typeof nombreArchivo !== "string" || !nombreArchivo.trim()) return { error: "El archivo no tiene nombre." };
  const ruta = `${CARPETA_FOTOS}/${crypto.randomUUID()}/${Date.now()}-${limpiarNombreArchivo(nombreArchivo)}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET_FOTOS).createSignedUploadUrl(ruta);
  if (error || !data) return { error: error?.message ?? "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

const texto = (formData: FormData, campo: string, max = 500): string | null => {
  const t = String(formData.get(campo) ?? "").trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Crea la sugerencia (desde el CRM o a mano en el módulo) con el siguiente SUG-, en el país de operación de la barra de arriba
 * (donde se testearía y vendería; un cliente de otro país también puede vender aquí). Deja una línea en
 * la actividad de la sugerencia y otra en la del dropshipper (visible para Atención). `usuarioId` es quien la carga.
 */
async function crearSugerencia(formData: FormData, dropshipperId: string, usuarioId: string, desde: string): Promise<{ error?: string; codigo?: string }> {
  const nombre = texto(formData, "nombre", 200);
  if (!nombre) return { error: "Escribe el nombre del producto." };
  const foto = texto(formData, "foto_url", 2000);
  if (foto && !rutaPropia(foto, PREFIJO_URL_PUBLICA, CARPETA_FOTOS)) return { error: "La foto no es válida: súbela de nuevo." };
  const paisVisto = String(formData.get("pais_detectado") ?? "").trim().toUpperCase();
  if (paisVisto && !/^[A-Z]{2}$/.test(paisVisto)) return { error: "Elige un país válido." };

  const supabase = createServiceClient();
  const [{ data: d }, pais] = await Promise.all([supabase.from("dropshippers").select("id, codigo, nombre").eq("id", dropshipperId).maybeSingle(), getPaisActual(supabase)]);
  if (!d) return { error: "No se encontró el cliente." };
  const { data: codigo, error: errorCodigo } = await supabase.rpc("wms_siguiente_codigo_fuente", { p_fuente: "sugerencia_cliente" });
  if (errorCodigo || !codigo) return { error: "No se pudo dar el código SUG. ¿Ya se corrió la migración 0109?" };

  const { data: creada, error } = await supabase
    .from(ENTIDAD)
    .insert({
      codigo,
      dropshipper_id: d.id,
      pais_id: pais.id,
      nombre,
      foto_url: foto,
      notas: texto(formData, "notas", 4000),
      categoria: texto(formData, "categoria", 80),
      pais_detectado: paisVisto || null,
      creado_por: usuarioId,
    })
    .select("id")
    .single();
  if (error) return { error: "No se pudo guardar la sugerencia." };

  const cliente = `${d.codigo ? `${d.codigo} · ` : ""}${d.nombre}`;
  await registrarAuditoriaLote([
    { accion: "crear_sugerencia", entidad: ENTIDAD, entidadId: creada.id, detalle: `${codigo} · ${nombre} · recomendado por ${cliente} (${desde})` },
    { accion: "recomendar_producto", entidad: "dropshippers", entidadId: d.id, detalle: `${codigo} · ${nombre}` },
  ]);
  revalidatePath(RUTA);
  revalidatePath("/crm-dropshippers", "layout");
  return { codigo: codigo as string };
}

/**
 * «Recomendar producto» desde la ficha del dropshipper en el CRM. Basta poder escribir en Atención: quien atiende al cliente
 * carga la recomendación sin ver el módulo de Sugerencias de clientes (como «Escalar caso» crea tareas de Comercial).
 */
export async function recomendarProducto(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO_ATENCION);
  const dropshipperId = String(formData.get("dropshipper_id") ?? "");
  if (!UUID.test(dropshipperId)) return { error: "Cliente no válido." };
  const r = await crearSugerencia(formData, dropshipperId, usuario.id, "desde el CRM");
  return r.error ? { error: r.error } : {};
}

/** «Agregar» en Sugerencias de clientes: una sugerencia a mano, asignada a un cliente del CRM por su código. */
export async function crearSugerenciaManual(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const dropshipperId = String(formData.get("dropshipper_id") ?? "");
  if (!UUID.test(dropshipperId)) return { error: "Elige el cliente que lo recomendó." };
  const r = await crearSugerencia(formData, dropshipperId, usuario.id, "a mano");
  return r.error ? { error: r.error } : {};
}

/**
 * Mueve sugerencias de estado. **Seleccionado** crea su fila en Selección de productos (fuente «Sugerencia de cliente», el
 * mismo código SUG-) y queda vinculada; si el producto ya se testeó o ya está en Producto, en Selección llega Descartado
 * con el motivo, como lo que envía Scraping. Una sugerencia ya seleccionada no vuelve atrás: su recorrido sigue en Selección.
 * Para seleccionar hay que poder escribir también en Selección de productos.
 */
export async function cambiarEstadoSugerencia(ids: string[], estado: string): Promise<{ error?: string; cambiadas?: number }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!ESTADOS.has(estado)) return { error: "Estado no válido." };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every((i) => typeof i === "string" && UUID.test(i))) return { error: "Selección no válida." };
  if (estado === "seleccionado" && !puedeEscribir(usuario, "seleccion-productos")) return { error: "Tu rol no puede agregar a Selección de productos." };

  const supabase = createServiceClient();
  const { data: actuales, error: errorLeer } = await supabase
    .from(ENTIDAD)
    .select("id, codigo, nombre, estado, foto_url, notas, categoria, pais_id, seleccion_id, dropshippers(codigo, nombre)")
    .in("id", ids);
  if (errorLeer) return { error: "No se pudieron leer las sugerencias. ¿Ya se corrió la migración 0109?" };
  const yaSeleccionadas = (actuales ?? []).filter((s) => s.estado === "seleccionado" && estado !== "seleccionado");
  if (yaSeleccionadas.length) return { error: `${yaSeleccionadas.map((s) => s.codigo).join(", ")} ya pasó a Selección: su recorrido sigue allí.` };
  const cambian = (actuales ?? []).filter((s) => s.estado !== estado);
  if (cambian.length === 0) return { cambiadas: 0 };

  const vinculos = new Map<string, string>();
  if (estado === "seleccionado") {
    const indice = await cargarReferencias(supabase);
    const filas = cambian.map((s) => {
      const d = (Array.isArray(s.dropshippers) ? s.dropshippers[0] : s.dropshippers) as { codigo: string | null; nombre: string } | null;
      const visto = yaVisto(s.nombre, null, indice);
      return {
        pais_id: s.pais_id,
        nombre: s.nombre,
        estado: visto ? "descartado" : "seleccionado",
        motivo_descarte: visto ? motivoYaVisto(visto) : null,
        fuente: "sugerencia_cliente",
        codigo_fuente: s.codigo,
        foto_url: s.foto_url,
        categoria: s.categoria,
        notas: [`Recomendado por ${d ? `${d.codigo ? `${d.codigo} · ` : ""}${d.nombre}` : "un cliente"}`, s.notas].filter(Boolean).join(" — "),
        sugerencia_id: s.id,
        creado_por: usuario.id,
      };
    });
    const { data: creadas, error: errorCrear } = await supabase.from("wms_seleccion_productos").insert(filas).select("id, sugerencia_id, codigo_fuente, nombre, estado");
    if (errorCrear) return { error: "No se pudieron crear las filas en Selección. ¿Ya se corrió la migración 0109?" };
    for (const c of creadas ?? []) vinculos.set(c.sugerencia_id as string, c.id as string);
    await registrarAuditoriaLote(
      (creadas ?? []).map((c) => ({
        accion: "crear_seleccion",
        entidad: "wms_seleccion_productos",
        entidadId: c.id,
        detalle: `${c.codigo_fuente} · ${c.nombre} (desde Sugerencias de clientes${c.estado === "descartado" ? ", descartado: ya visto" : ""})`,
      })),
    );
  }

  for (const s of cambian) {
    const { error } = await supabase
      .from(ENTIDAD)
      .update({ estado, seleccion_id: vinculos.get(s.id) ?? s.seleccion_id, actualizado_en: new Date().toISOString() })
      .eq("id", s.id);
    if (error) return { error: "No se pudo cambiar el estado." };
  }
  await registrarAuditoriaLote(
    cambian.map((s) => ({
      accion: "cambiar_estado_sugerencia",
      entidad: ENTIDAD,
      entidadId: s.id,
      antes: { Estado: etiquetaEstadoSugerencia(s.estado) },
      despues: { Estado: etiquetaEstadoSugerencia(estado) },
    })),
  );
  revalidatePath(RUTA);
  if (estado === "seleccionado") revalidatePath("/seleccion-productos");
  return { cambiadas: cambian.length };
}

/** La actividad de una sugerencia, de la más nueva a la más vieja. */
export async function obtenerHistorialSugerencia(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Sugerencia no válida." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", ENTIDAD)
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}

export interface RecomendacionCliente {
  id: string;
  codigo: string;
  nombre: string;
  fotoUrl: string | null;
  estado: string;
  creadoEn: string;
  /** Su recorrido para contárselo al cliente: etapas, fechas y días (sin cantidades ni costos). */
  seguimiento: Seguimiento;
  /** Su exclusividad sobre el producto: 30, 60 o 90 días desde que quedó disponible para vender. */
  exclusividad: Exclusividad;
}

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * Las recomendaciones de un dropshipper con el recorrido de cada una (Sugerencia → Selección → oferta → test → compra) y su
 * % de acierto, para su ficha en el CRM. Basta poder abrir Atención: es lo que el cliente nos mandó y no muestra cantidades
 * ni costos. Devuelve el error como valor.
 */
export async function recomendacionesDeDropshipper(
  dropshipperId: string,
): Promise<{ recomendaciones: RecomendacionCliente[]; acierto: ReturnType<typeof aciertoCliente> } | { error: string }> {
  await requireModulo(MODULO_ATENCION);
  if (!UUID.test(dropshipperId)) return { error: "Cliente no válido." };
  const recomendaciones = await recomendacionesDeDropshipperSinPermiso(dropshipperId).catch(() => null);
  if (!recomendaciones) return { error: "No se pudieron cargar las recomendaciones." };
  return { recomendaciones, acierto: aciertoCliente(recomendaciones.map((r) => r.seguimiento)) };
}

/** El cálculo de las recomendaciones y su recorrido; quien lo llama ya comprobó el permiso. Lanza si falla la lectura. */
async function recomendacionesDeDropshipperSinPermiso(dropshipperId: string): Promise<RecomendacionCliente[]> {
  const supabase = createServiceClient();
  const consulta = (columnas: string) => supabase.from(ENTIDAD).select(columnas).eq("dropshipper_id", dropshipperId).order("creado_en", { ascending: false }).limit(100);
  // Sin la migración 0111 no existe `exclusividad_dias`: se lee sin ella (30 días por defecto).
  let r = await consulta("id, codigo, nombre, foto_url, estado, creado_en, actualizado_en, seleccion_id, exclusividad_dias");
  if (r.error) r = await consulta("id, codigo, nombre, foto_url, estado, creado_en, actualizado_en, seleccion_id");
  if (r.error) throw new Error("No se pudieron cargar las recomendaciones.");
  const lista = (r.data ?? []) as unknown as {
    id: string;
    codigo: string;
    nombre: string;
    foto_url: string | null;
    estado: string;
    creado_en: string;
    actualizado_en: string;
    seleccion_id: string | null;
    exclusividad_dias?: number;
  }[];
  const selIds = lista.map((s) => s.seleccion_id).filter((x): x is string => !!x);

  // Selección (y cuándo pasó a «Crear oferta»), test y compra de cada una.
  const [{ data: sels }, { data: auditoria }, { data: ofertas }, { data: tests }] = await Promise.all([
    selIds.length ? supabase.from("wms_seleccion_productos").select("id, estado, creado_en").in("id", selIds) : Promise.resolve({ data: [] as never[] }),
    selIds.length
      ? supabase.from("historial_auditoria").select("entidad_id, despues, creado_en").eq("entidad", "wms_seleccion_productos").in("entidad_id", selIds).eq("accion", "cambiar_estado_seleccion").order("creado_en")
      : Promise.resolve({ data: [] as never[] }),
    selIds.length ? supabase.from("wms_seleccion_ofertas").select("seleccion_id, creado_en").in("seleccion_id", selIds).order("creado_en") : Promise.resolve({ data: [] as never[] }),
    selIds.length ? supabase.from("wms_productos_test").select("seleccion_id, estado, creado_en, fecha_test, actualizado_en, sku_maestro_id").in("seleccion_id", selIds) : Promise.resolve({ data: [] as never[] }),
  ]);
  const skuIds = (tests ?? []).map((t) => t.sku_maestro_id as string | null).filter((x): x is string => !!x);
  const [{ data: comprasDirectas }, { data: items }] = await Promise.all([
    skuIds.length ? supabase.from("wms_compras").select("id, sku_maestro_id, etapa, anulada_en, creado_en").in("sku_maestro_id", skuIds) : Promise.resolve({ data: [] as never[] }),
    skuIds.length ? supabase.from("wms_compra_items").select("sku_maestro_id, wms_compras(id, etapa, anulada_en, creado_en)").in("sku_maestro_id", skuIds) : Promise.resolve({ data: [] as never[] }),
  ]);
  // La compra de cada producto: la que nació de él (sku_maestro_id) o, si no, la primera donde aparece como línea.
  const compraDeSku = new Map<string, { id: string; etapa: string; anulada: boolean; creadoEn: string }>();
  for (const c of comprasDirectas ?? []) {
    const ya = compraDeSku.get(c.sku_maestro_id as string);
    if (!ya || c.creado_en < ya.creadoEn) compraDeSku.set(c.sku_maestro_id as string, { id: c.id, etapa: c.etapa, anulada: !!c.anulada_en, creadoEn: c.creado_en });
  }
  for (const it of items ?? []) {
    const c = uno(it.wms_compras as never) as { id: string; etapa: string; anulada_en: string | null; creado_en: string } | null;
    if (c && !compraDeSku.has(it.sku_maestro_id as string)) compraDeSku.set(it.sku_maestro_id as string, { id: c.id, etapa: c.etapa, anulada: !!c.anulada_en, creadoEn: c.creado_en });
  }
  const compraIds = [...compraDeSku.values()].map((c) => c.id);
  const { data: eventos } = compraIds.length
    ? await supabase.from("wms_compra_eventos").select("compra_id, valor_despues, ocurrido_en").eq("campo", "etapa").in("compra_id", compraIds).order("ocurrido_en")
    : { data: [] as { compra_id: string; valor_despues: string; ocurrido_en: string }[] };

  const hoy = new Date().toISOString().slice(0, 10);
  const recomendaciones: RecomendacionCliente[] = lista.map((s) => {
    const sel = (sels ?? []).find((x) => x.id === s.seleccion_id) ?? null;
    const enOferta =
      (auditoria ?? []).find((a) => a.entidad_id === s.seleccion_id && (a.despues as { Estado?: string } | null)?.Estado === "Crear oferta")?.creado_en ??
      (ofertas ?? []).find((o) => o.seleccion_id === s.seleccion_id)?.creado_en ??
      null;
    const t = (tests ?? []).find((x) => x.seleccion_id === s.seleccion_id) ?? null;
    const compra = t?.sku_maestro_id ? compraDeSku.get(t.sku_maestro_id) : undefined;
    const etapasCompra: Record<string, string> = {};
    if (compra) for (const e of eventos ?? []) if (e.compra_id === compra.id && !etapasCompra[e.valor_despues]) etapasCompra[e.valor_despues] = e.ocurrido_en;
    const seguimiento = armarSeguimiento(
      {
        recomendado: s.creado_en,
        sugerencia: { estado: s.estado, actualizadoEn: s.actualizado_en },
        seleccion: sel ? { estado: sel.estado, creadoEn: sel.creado_en, enOfertaEn: enOferta } : null,
        test: t ? { estado: t.estado, creadoEn: t.creado_en, resultadoEn: t.fecha_test ?? (t.estado === "winner" || t.estado === "fallido" ? t.actualizado_en : null) } : null,
        compra: compra ? { etapa: compra.etapa, anulada: compra.anulada, etapas: etapasCompra } : null,
      },
      hoy,
    );
    const exclusividad = exclusividadDe(seguimiento, s.exclusividad_dias ?? 30, hoy);
    return { id: s.id, codigo: s.codigo, nombre: s.nombre, fotoUrl: s.foto_url, estado: s.estado, creadoEn: s.creado_en, seguimiento, exclusividad };
  });
  return recomendaciones;
}

/**
 * Cambia el plazo de exclusividad de una recomendación (30, 60 o 90 días). Puede Atención (desde la ficha del cliente) o quien
 * trabaja en Sugerencias de clientes. Queda en la actividad de la sugerencia y en la del cliente.
 */
export async function cambiarExclusividad(id: string, dias: number): Promise<{ error?: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !(puedeEscribir(usuario, MODULO_ATENCION) || puedeEscribir(usuario, MODULO))) return { error: "No tienes permiso para cambiar la exclusividad." };
  if (!UUID.test(id)) return { error: "Recomendación no válida." };
  if (!(PLAZOS_EXCLUSIVIDAD as readonly number[]).includes(dias)) return { error: "El plazo es de 30, 60 o 90 días." };
  const supabase = createServiceClient();
  const { data: actual } = await supabase.from(ENTIDAD).select("codigo, dropshipper_id, exclusividad_dias").eq("id", id).maybeSingle();
  if (!actual) return { error: "No se encontró la recomendación. ¿Ya se corrió la migración 0111?" };
  if (actual.exclusividad_dias === dias) return {};
  const { error } = await supabase.from(ENTIDAD).update({ exclusividad_dias: dias, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo cambiar el plazo." };
  await registrarAuditoriaLote([
    { accion: "cambiar_exclusividad", entidad: ENTIDAD, entidadId: id, antes: { Exclusividad: `${actual.exclusividad_dias} días` }, despues: { Exclusividad: `${dias} días` } },
    { accion: "cambiar_exclusividad", entidad: "dropshippers", entidadId: actual.dropshipper_id, detalle: `${actual.codigo}: ${dias} días` },
  ]);
  revalidatePath(RUTA);
  return {};
}

/**
 * La exclusividad de un producto de Producto, si salió de la recomendación de un cliente (producto → test → Selección →
 * sugerencia). Para la ficha de Producto: basta poder abrir Producto. null si no viene de una recomendación.
 */
export async function exclusividadDeProducto(skuId: string): Promise<{ cliente: string; codigo: string; exclusividad: Exclusividad } | null> {
  await requireModulo("producto");
  if (!UUID.test(skuId)) return null;
  const supabase = createServiceClient();
  const { data: test } = await supabase.from("wms_productos_test").select("seleccion_id").eq("sku_maestro_id", skuId).not("seleccion_id", "is", null).limit(1).maybeSingle();
  if (!test?.seleccion_id) return null;
  const { data: sug } = await supabase.from(ENTIDAD).select("dropshipper_id, codigo, dropshippers(codigo, nombre)").eq("seleccion_id", test.seleccion_id).maybeSingle();
  if (!sug) return null;
  // El mismo cálculo que ve Atención en la ficha del cliente, para no tener dos reglas.
  const r = await recomendacionesDeDropshipperSinPermiso(sug.dropshipper_id);
  const rec = r.find((x) => x.codigo === sug.codigo);
  if (!rec) return null;
  const d = uno(sug.dropshippers as never) as { codigo: string | null; nombre: string } | null;
  return { cliente: d ? `${d.codigo ? `${d.codigo} · ` : ""}${d.nombre}` : "un cliente", codigo: sug.codigo, exclusividad: rec.exclusividad };
}
