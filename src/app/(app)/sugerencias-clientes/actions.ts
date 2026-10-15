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
}

/**
 * Las recomendaciones de un dropshipper, para su ficha en el CRM. Basta poder abrir Atención (es lo que el cliente nos
 * mandó; no muestra cantidades ni costos). Devuelve el error como valor.
 */
export async function recomendacionesDeDropshipper(dropshipperId: string): Promise<{ recomendaciones: RecomendacionCliente[] } | { error: string }> {
  await requireModulo(MODULO_ATENCION);
  if (!UUID.test(dropshipperId)) return { error: "Cliente no válido." };
  const { data, error } = await createServiceClient()
    .from(ENTIDAD)
    .select("id, codigo, nombre, foto_url, estado, creado_en")
    .eq("dropshipper_id", dropshipperId)
    .order("creado_en", { ascending: false })
    .limit(100);
  if (error) return { error: "No se pudieron cargar las recomendaciones." };
  return {
    recomendaciones: (data ?? []).map((s) => ({ id: s.id, codigo: s.codigo, nombre: s.nombre, fotoUrl: s.foto_url, estado: s.estado, creadoEn: s.creado_en })),
  };
}
