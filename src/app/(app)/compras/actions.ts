"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura, getUsuarioActual } from "@/lib/auth";
import { ESTADOS_COMPRA, ETAPAS_COMPRA, PRIORIDADES, VIAS_ENVIO } from "./def-compras";

const ETAPAS_VALIDAS: Set<string> = new Set(ETAPAS_COMPRA.map((e) => e.valor));
const ESTADOS_VALIDOS: Set<string> = new Set(ESTADOS_COMPRA.map((e) => e.valor));
const PRIORIDADES_VALIDAS: Set<string> = new Set(PRIORIDADES.map((p) => p.valor));
const VIAS_VALIDAS: Set<string> = new Set(VIAS_ENVIO.map((v) => v.valor));
const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/** «a, b ,c» → ["a", "b", "c"] (sin vacíos ni repetidos). */
const listaDeTexto = (texto: string | null): string[] => [...new Set((texto ?? "").split(",").map((x) => x.trim()).filter(Boolean))];

// La foto del producto vive en el mismo bucket público que Filtros y las fichas de producto Shopify/Dropi.
const BUCKET_FOTOS = "wms-productos";
const PREFIJO_URL_PUBLICA = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;

/** Da permiso (URL firmada) para subir la foto directo desde el navegador, sin pasar el archivo por la acción. */
export async function prepararSubidaFotoCompra(nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  await requireModuloEscritura("compras");
  if (typeof nombreArchivo !== "string" || !nombreArchivo.trim()) return { error: "El archivo no tiene nombre." };

  const ruta = `compras/${crypto.randomUUID()}/${Date.now()}-${nombreArchivo.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120)}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET_FOTOS).createSignedUploadUrl(ruta);
  if (error || !data) return { error: error?.message ?? "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

/** Borra del bucket una foto que ya no queda referenciada (se reemplazó o se quitó). Nunca lanza. */
async function borrarFotoSiEsNuestra(url: string | null) {
  if (!url || !url.startsWith(PREFIJO_URL_PUBLICA)) return;
  const ruta = url.slice(PREFIJO_URL_PUBLICA.length);
  await createServiceClient().storage.from(BUCKET_FOTOS).remove([ruta]);
}

const numeroOptativo = (formData: FormData, campo: string): number | null => {
  const texto = formData.get(campo) as string | null;
  return texto && texto !== "" ? Number(texto) : null;
};

const textoOptativo = (formData: FormData, campo: string): string | null => {
  const texto = (formData.get(campo) as string | null)?.trim();
  return texto ? texto : null;
};

const fechaOptativa = (formData: FormData, campo: string): string | null => (formData.get(campo) as string) || null;

/** Los campos comunes a crear y actualizar (todo lo que no sea el nombre, la etapa o el país). */
function leerCambios(formData: FormData) {
  return {
    foto_url: textoOptativo(formData, "foto_url"),
    proveedor: textoOptativo(formData, "proveedor"),
    cliente: textoOptativo(formData, "cliente"),
    tienda: textoOptativo(formData, "tienda"),
    track_id: textoOptativo(formData, "track_id"),
    orden: textoOptativo(formData, "orden"),
    producto_relacionado: textoOptativo(formData, "producto_relacionado"),
    qty_total: numeroOptativo(formData, "qty_total"),
    monto_total: numeroOptativo(formData, "monto_total"),
    primer_pago: numeroOptativo(formData, "primer_pago"),
    segundo_pago: numeroOptativo(formData, "segundo_pago"),
    pagado_a_proveedor: numeroOptativo(formData, "pagado_a_proveedor"),
    pago_pendiente: numeroOptativo(formData, "pago_pendiente"),
    cobrado_cliente: numeroOptativo(formData, "cobrado_cliente"),
    pendiente_cliente: numeroOptativo(formData, "pendiente_cliente"),
    pago_cliente: textoOptativo(formData, "pago_cliente"),
    cuenta_receptora: textoOptativo(formData, "cuenta_receptora"),
    factura: formData.get("factura") === "on",
    financiamiento: formData.get("financiamiento") === "on",
    revisado_aa: formData.get("revisado_aa") === "on",
    fecha_limite: fechaOptativa(formData, "fecha_limite"),
    fecha_llegada: fechaOptativa(formData, "fecha_llegada"),
    fecha_pago_1: fechaOptativa(formData, "fecha_pago_1"),
    fecha_pago_2: fechaOptativa(formData, "fecha_pago_2"),
    fecha_envio: fechaOptativa(formData, "fecha_envio"),
    inconveniente: textoOptativo(formData, "inconveniente"),
    planificacion: textoOptativo(formData, "planificacion"),
    documentos: textoOptativo(formData, "documentos"),
    notas: textoOptativo(formData, "notas"),
    codigo: textoOptativo(formData, "codigo")?.slice(0, 40) ?? null,
    prioridad: PRIORIDADES_VALIDAS.has(String(formData.get("prioridad") ?? "")) ? String(formData.get("prioridad")) : null,
    via_envio: formData.getAll("via_envio").map(String).filter((v) => VIAS_VALIDAS.has(v)),
    etiquetas: listaDeTexto(textoOptativo(formData, "etiquetas")),
    url_producto: textoOptativo(formData, "url_producto"),
    descripcion: textoOptativo(formData, "descripcion"),
  };
}

/**
 * Tipo y país de la compra: una de país lleva su país (por código); una de Importadora nunca lleva país (es un servicio a
 * un cliente, no una compra nuestra) y guarda a dónde se entrega en `paises_destino`.
 */
async function leerTipoYPais(formData: FormData): Promise<{ tipo: string; pais_id: string | null; paises_destino: string[] } | { error: string }> {
  const tipo = formData.get("tipo") === "importacion" ? "importacion" : "pais";
  if (tipo === "importacion") return { tipo, pais_id: null, paises_destino: listaDeTexto(textoOptativo(formData, "paises_destino")) };
  const codigo = String(formData.get("pais") ?? "");
  if (!codigo) return { error: "Elige el país de la compra." };
  const { data } = await createServiceClient().from("paises").select("id").eq("codigo", codigo).maybeSingle();
  if (!data) return { error: "País no válido." };
  return { tipo, pais_id: data.id as string, paises_destino: [] };
}

/** Anota los cambios de etapa y de estado con su hora: de ahí salen los tiempos por etapa del tablero de compras. */
async function anotarEventos(compraId: string, antes: { etapa: string; estado: string } | null, despues: { etapa: string; estado: string }) {
  const usuario = await getUsuarioActual();
  const autor = usuario?.nombre || usuario?.email || null;
  const filas = (["etapa", "estado"] as const)
    .filter((campo) => !antes || antes[campo] !== despues[campo])
    .map((campo) => ({ compra_id: compraId, campo, valor_antes: antes ? antes[campo] : null, valor_despues: despues[campo], autor, origen: "sistema" }));
  if (filas.length) await createServiceClient().from("wms_compra_eventos").insert(filas);
}

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearCompra(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const nombre = (formData.get("nombre") as string).trim();
  const etapa = (formData.get("etapa") as string) || "backlog";
  const estado = (formData.get("estado") as string) || "backlog";

  if (!nombre) return { error: "Escribe el nombre de la compra." };
  if (!ETAPAS_VALIDAS.has(etapa)) return { error: "Elige una etapa válida." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };

  const tipoYPais = await leerTipoYPais(formData);
  if ("error" in tipoYPais) return tipoYPais;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("wms_compras")
    .insert({ ...tipoYPais, nombre, etapa, estado, ...leerCambios(formData) })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await anotarEventos(data.id, null, { etapa, estado });

  await registrarAuditoria({ accion: "crear_compra", entidad: "wms_compras", entidadId: data.id, detalle: nombre });
  revalidatePath("/compras");
  return {};
}

/** Edita cualquier dato de una compra ya creada — todo junto, desde su ficha. */
export async function actualizarCompra(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string).trim();
  const etapa = formData.get("etapa") as string;
  const estado = formData.get("estado") as string;

  if (!nombre) return { error: "Escribe el nombre de la compra." };
  if (!ETAPAS_VALIDAS.has(etapa)) return { error: "Elige una etapa válida." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };

  if (!ES_ID(id)) return { error: "Compra no válida." };
  const tipoYPais = await leerTipoYPais(formData);
  if ("error" in tipoYPais) return tipoYPais;

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("wms_compras").select("foto_url, etapa, estado").eq("id", id).single();
  const cambios = leerCambios(formData);
  // Al cerrar (completado o descartado) se sella la fecha de cierre; al reabrir se quita.
  const cierra = etapa === "completado" || etapa === "descartado";
  const cerrado_en = cierra ? (actual && (actual.etapa === "completado" || actual.etapa === "descartado") ? undefined : new Date().toISOString()) : null;
  const { error } = await supabase
    .from("wms_compras")
    .update({ ...tipoYPais, nombre, etapa, estado, ...cambios, ...(cerrado_en !== undefined ? { cerrado_en } : {}), actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  if (actual) await anotarEventos(id, { etapa: actual.etapa, estado: actual.estado }, { etapa, estado });

  if (actual && actual.foto_url !== cambios.foto_url) await borrarFotoSiEsNuestra(actual.foto_url);

  revalidatePath("/compras");
  return {};
}

export async function eliminarCompra(formData: FormData) {
  await requireModuloEscritura("compras");
  const id = formData.get("id") as string;
  const nombre = formData.get("nombre") as string;

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("wms_compras").select("foto_url").eq("id", id).single();
  const { error } = await supabase.from("wms_compras").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (actual?.foto_url) await borrarFotoSiEsNuestra(actual.foto_url);

  await registrarAuditoria({ accion: "eliminar_compra", entidad: "wms_compras", entidadId: id, detalle: nombre });
  revalidatePath("/compras");
}

export interface ActividadCompra {
  comentarios: { id: string; autor: string | null; texto: string; creadoEn: string }[];
  subtareas: { id: string; nombre: string; estado: string | null; responsable: string | null; creadoEn: string; cerradoEn: string | null }[];
  adjuntos: { id: string; nombre: string; clase: string; url: string | null; creadoEn: string }[];
  eventos: { id: string; campo: string; antes: string | null; despues: string | null; ocurridoEn: string; autor: string | null; origen: string }[];
}

const BUCKET_COMPRAS = "wms-compras";

/**
 * Lo que cuelga de una compra para su ficha: comentarios, subtareas, adjuntos (fotos y documentos con un enlace firmado de
 * una hora; los videos, con su enlace de ClickUp) y el historial de cambios de etapa y estado. Basta poder abrir Compras.
 */
export async function obtenerActividadCompra(id: string): Promise<ActividadCompra | { error: string }> {
  await requireModulo("compras");
  if (!ES_ID(id)) return { error: "Compra no válida." };
  const supabase = createServiceClient();
  const [comentarios, subtareas, adjuntos, eventos] = await Promise.all([
    supabase.from("wms_compra_comentarios").select("id, autor, texto, creado_en").eq("compra_id", id).order("creado_en", { ascending: false }).limit(500),
    supabase.from("wms_compra_subtareas").select("id, nombre, estado, responsable_nombre, creado_en, cerrado_en").eq("compra_id", id).order("creado_en"),
    supabase.from("wms_compra_adjuntos").select("id, nombre, clase, ruta, url_clickup, creado_en").eq("compra_id", id).order("creado_en"),
    supabase.from("wms_compra_eventos").select("id, campo, valor_antes, valor_despues, ocurrido_en, autor, origen").eq("compra_id", id).order("ocurrido_en", { ascending: false }),
  ]);
  if (comentarios.error || subtareas.error || adjuntos.error || eventos.error) return { error: "No se pudo cargar la actividad." };

  const rutas = (adjuntos.data ?? []).map((a) => a.ruta as string | null).filter((r): r is string => !!r);
  const firmadas = new Map<string, string>();
  if (rutas.length) {
    const { data } = await supabase.storage.from(BUCKET_COMPRAS).createSignedUrls(rutas, 3600);
    for (const f of data ?? []) if (f.path && f.signedUrl) firmadas.set(f.path, f.signedUrl);
  }
  return {
    comentarios: (comentarios.data ?? []).map((c) => ({ id: c.id, autor: c.autor, texto: c.texto, creadoEn: c.creado_en })),
    subtareas: (subtareas.data ?? []).map((t) => ({ id: t.id, nombre: t.nombre, estado: t.estado, responsable: t.responsable_nombre, creadoEn: t.creado_en, cerradoEn: t.cerrado_en })),
    adjuntos: (adjuntos.data ?? []).map((a) => ({
      id: a.id,
      nombre: a.nombre,
      clase: a.clase,
      url: (a.ruta && firmadas.get(a.ruta)) || a.url_clickup || null,
      creadoEn: a.creado_en,
    })),
    eventos: (eventos.data ?? []).map((e) => ({ id: e.id, campo: e.campo, antes: e.valor_antes, despues: e.valor_despues, ocurridoEn: e.ocurrido_en, autor: e.autor, origen: e.origen })),
  };
}

/** Agrega un comentario a una compra (queda con el nombre de quien lo escribe y la hora). Devuelve el error como valor. */
export async function comentarCompra(id: string, texto: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("compras");
  if (!ES_ID(id)) return { error: "Compra no válida." };
  const limpio = String(texto ?? "").trim().slice(0, 5000);
  if (!limpio) return { error: "Escribe el comentario." };
  const { error } = await createServiceClient()
    .from("wms_compra_comentarios")
    .insert({ compra_id: id, autor: usuario.nombre || usuario.email, texto: limpio });
  if (error) return { error: "No se pudo guardar el comentario." };
  return {};
}
