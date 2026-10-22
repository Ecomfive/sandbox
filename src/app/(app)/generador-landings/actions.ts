"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import {
  contenidoInicial,
  ES_ESPACIO,
  ESPACIOS_IMAGEN,
  faltantesLanding,
  leerReferencia,
  MAX_FOTOS_PROVEEDOR,
  nombreArchivo,
  normalizarContenido,
  normalizarFotosProveedor,
  normalizarImagenes,
  rutaDeLanding,
  sumarProductoShopify,
  urlProductoShopify,
  ANGULOS,
  etiquetaEstadoLanding,
  type EspacioImagen,
  type LecturaReferencia,
} from "@/lib/landings/landing";
import { armarPromptImagen, MAX_REFERENCIAS, PROPORCION } from "@/lib/landings/gemini";
import { generarImagen, modeloImagen } from "@/lib/landings/gemini-api";
import { ofertasEnMoneda } from "@/lib/landings/ofertas";
import { archivosShopify, htmlDescripcion, variantesShopify, type DatosShopify } from "@/lib/landings/shopify";
import { esperarFotos, guardarProducto, publicarProducto, shopifyConectado, shopifyGraphql, tiendaShopify, urlAdmin } from "@/lib/landings/shopify-api";
import { monedaDePais, tasasUsd } from "@/lib/moneda/tipo-cambio";
import { getPaisActual } from "@/lib/pais";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { descargarPublico } from "@/lib/seguridad/url-externa";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "generador-landings";
const RUTA = "/generador-landings";
const BUCKET = "landings";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANGULOS_VALIDOS = new Set<string>(ANGULOS.map((a) => a.valor));
const NAVEGADOR = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", accept: "text/html,*/*" };
/** Lo que dura un enlace firmado para ver una imagen en la página. */
const SEGUNDOS_ENLACE = 60 * 60;

/** Precio con su moneda, como en la vista previa. */
function formatoPrecioMoneda(moneda: string) {
  let f: Intl.NumberFormat;
  try {
    f = new Intl.NumberFormat("es", { style: "currency", currency: moneda, maximumFractionDigits: moneda === "USD" ? 2 : 0 });
  } catch {
    f = new Intl.NumberFormat("es", { maximumFractionDigits: 2 });
  }
  return (n: number) => f.format(n);
}

type Usuario = Awaited<ReturnType<typeof requireModuloEscritura>>;

/** La landing, si existe y es de un país que la persona ve. */
async function landingPermitida(id: string, usuario: Usuario) {
  if (!UUID.test(id)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("landings").select("id, numero, nombre, pais_id, precio, contenido, imagenes, fotos_proveedor, estado, angulo, notas_ia").eq("id", id).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, data.pais_id))) return null;
  return data;
}

/** Copia una imagen pública (la foto de Selección) a la carpeta de la landing. Nunca lanza: si falla, devuelve `null`. */
async function copiarImagen(url: string, id: string): Promise<string | null> {
  const descarga = await descargarPublico(url, 8 * 1024 * 1024);
  if ("error" in descarga) return null;
  const imagen = detectarImagen(descarga.bytes.slice(0, 64));
  if (!imagen) return null;
  const ruta = `${id}/${Date.now()}-proveedor.${imagen.extension}`;
  const { error } = await createServiceClient().storage.from(BUCKET).upload(ruta, descarga.bytes, { contentType: imagen.tipo });
  return error ? null : ruta;
}

/**
 * Crea una landing, sola o para un producto de Selección (toma su nombre, su país, el precio de su primera oferta en la moneda
 * de la tienda y su foto como foto del proveedor). Devuelve su id para abrirla. El error va como valor.
 */
export async function crearLanding(datos: { seleccionId?: string | null; modo: "cero" | "clonar" }): Promise<{ id?: string; error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const modo = datos.modo === "clonar" ? "clonar" : "cero";
  let paisId: string;
  let nombre = "Landing nueva";
  let seleccionId: string | null = null;
  let precioUsd: number | null = null;
  let foto: string | null = null;

  if (datos.seleccionId) {
    if (!UUID.test(datos.seleccionId)) return { error: "Producto no válido." };
    const { data: sel } = await supabase.from("wms_seleccion_productos").select("id, nombre, pais_id, foto_url").eq("id", datos.seleccionId).maybeSingle();
    if (!sel || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, sel.pais_id))) return { error: "El producto ya no existe o no es de tus países." };
    const { data: ya } = await supabase.from("landings").select("id").eq("seleccion_id", sel.id).limit(1).maybeSingle();
    if (ya) return { id: ya.id };
    const { data: oferta } = await supabase.from("wms_seleccion_ofertas").select("precio").eq("seleccion_id", sel.id).not("precio", "is", null).order("orden").limit(1).maybeSingle();
    paisId = sel.pais_id;
    nombre = sel.nombre;
    seleccionId = sel.id;
    precioUsd = oferta?.precio === null || oferta?.precio === undefined ? null : Number(oferta.precio);
    foto = sel.foto_url;
  } else {
    const pais = await getPaisActual(supabase);
    if (!pais.codigo) return { error: "Elige un país en la barra de arriba." };
    paisId = pais.id;
  }

  const { data: pais } = await supabase.from("paises").select("codigo").eq("id", paisId).maybeSingle();
  const moneda = monedaDePais(String(pais?.codigo ?? ""));
  let precio: number | null = null;
  if (precioUsd !== null) {
    const tasa = (await tasasUsd(supabase)).porUsd[moneda];
    if (tasa) precio = moneda === "USD" ? precioUsd : Math.round(precioUsd * tasa);
  }

  const { data, error } = await supabase
    .from("landings")
    .insert({ pais_id: paisId, seleccion_id: seleccionId, nombre, modo, moneda, precio, contenido: contenidoInicial(), creado_por: usuario.id })
    .select("id, numero")
    .single();
  if (error || !data) return { error: error?.code === "42P01" ? "Falta correr en Supabase la migración 0113." : "No se pudo crear la landing." };

  if (foto) {
    const ruta = await copiarImagen(foto, data.id);
    if (ruta) await supabase.from("landings").update({ fotos_proveedor: [ruta] }).eq("id", data.id);
  }
  await registrarAuditoria({ accion: "crear_landing", entidad: "landings", entidadId: data.id, detalle: `${nombre} (${modo === "clonar" ? "clonar una landing" : "desde cero"})` });
  revalidatePath(RUTA);
  return { id: data.id };
}

export interface DatosLanding {
  nombre: string;
  modo: "cero" | "clonar";
  referenciaUrl: string;
  angulo: string;
  notasIa: string;
  precio: number | null;
  precioTachado: number | null;
  contenido: unknown;
  instrucciones: Record<string, string>;
}

const precioValido = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? Math.round(n * 100) / 100 : undefined;
};

/** Guarda todo lo que se escribe en la landing. Pasa sola a «Lista» cuando no le falta nada (y vuelve a «Borrador» si sí). */
export async function guardarLanding(id: string, datos: DatosLanding): Promise<{ error?: string; estado?: string; faltantes?: string[] }> {
  const usuario = await requireModuloEscritura(MODULO);
  const actual = await landingPermitida(id, usuario);
  if (!actual) return { error: "La landing ya no existe o no es de tus países." };
  const nombre = String(datos.nombre ?? "").trim().slice(0, 160);
  if (!nombre) return { error: "Escribe el nombre del producto." };
  const precio = precioValido(datos.precio);
  const precioTachado = precioValido(datos.precioTachado);
  if (precio === undefined || precioTachado === undefined) return { error: "Un precio no es válido." };
  const referenciaUrl: string | null = String(datos.referenciaUrl ?? "").trim().slice(0, 1000) || null;
  if (referenciaUrl) {
    try {
      const u = new URL(referenciaUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "El enlace de la landing de referencia no es válido." };
    } catch {
      return { error: "El enlace de la landing de referencia no es válido." };
    }
  }
  const contenido = normalizarContenido(datos.contenido);
  // Las instrucciones de cada imagen se guardan junto a su imagen (la ruta no viaja desde el navegador: se conserva la guardada).
  const imagenes = normalizarImagenes(actual.imagenes, id);
  for (const e of ESPACIOS_IMAGEN) {
    const t = typeof datos.instrucciones?.[e.clave] === "string" ? datos.instrucciones[e.clave].trim().slice(0, 1000) : "";
    if (t) imagenes[e.clave].instruccion = t;
  }
  const faltantes = faltantesLanding({ nombre, precio, contenido, imagenes });
  const estado = actual.estado === "publicada" ? "publicada" : faltantes.length ? "borrador" : "lista";

  const { error } = await createServiceClient()
    .from("landings")
    .update({
      nombre,
      modo: datos.modo === "clonar" ? "clonar" : "cero",
      referencia_url: referenciaUrl,
      angulo: ANGULOS_VALIDOS.has(datos.angulo) ? datos.angulo : "regalo",
      notas_ia: String(datos.notasIa ?? "").trim().slice(0, 2000) || null,
      precio,
      precio_tachado: precioTachado,
      contenido,
      imagenes,
      estado,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar la landing." };
  if (estado !== actual.estado)
    await registrarAuditoria({ accion: "estado_landing", entidad: "landings", entidadId: id, detalle: nombre, antes: { Estado: etiquetaEstadoLanding(actual.estado) }, despues: { Estado: etiquetaEstadoLanding(estado) } });
  revalidatePath(RUTA);
  return { estado, faltantes };
}

/** Da permiso (dirección firmada) para subir una imagen directo desde el navegador a la carpeta de la landing. */
export async function prepararSubidaImagenLanding(id: string, archivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await landingPermitida(id, usuario))) return { error: "La landing ya no existe o no es de tus países." };
  const ruta = `${id}/${Date.now()}-${nombreArchivo(archivo)}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

/** Borra archivos de la carpeta de la landing que ya nadie usa en ella. Nunca lanza. */
async function borrarSinUso(id: string, rutas: string[], usadas: string[]) {
  const borrar = rutas.filter((r) => r && rutaDeLanding(r, id) && !usadas.includes(r));
  if (borrar.length) await createServiceClient().storage.from(BUCKET).remove(borrar);
}

/**
 * Guarda una imagen ya subida: en un espacio de la landing (reemplaza la que tenía) o como foto del proveedor. Se revisa que
 * sea de verdad una imagen por su contenido; si no, se borra. Devuelve su enlace firmado para mostrarla.
 */
export async function guardarImagenLanding(id: string, destino: string, ruta: string): Promise<{ error?: string; url?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const actual = await landingPermitida(id, usuario);
  if (!actual) return { error: "La landing ya no existe o no es de tus países." };
  if (!rutaDeLanding(String(ruta ?? ""), id)) return { error: "La imagen no es de esta landing." };
  if (destino !== "proveedor" && !ES_ESPACIO(destino)) return { error: "Espacio de imagen no válido." };
  const supabase = createServiceClient();
  const almacen = supabase.storage.from(BUCKET);
  const { data: archivo } = await almacen.download(ruta);
  if (!archivo || !detectarImagen(new Uint8Array(await archivo.slice(0, 64).arrayBuffer()))) {
    await almacen.remove([ruta]);
    return { error: "Eso no es una imagen JPG, PNG, WebP o GIF." };
  }

  const imagenes = normalizarImagenes(actual.imagenes, id);
  let fotos = normalizarFotosProveedor(actual.fotos_proveedor, id);
  let anterior: string | null = null;
  if (destino === "proveedor") {
    if (fotos.length >= MAX_FOTOS_PROVEEDOR) {
      await almacen.remove([ruta]);
      return { error: `Hasta ${MAX_FOTOS_PROVEEDOR} fotos del proveedor.` };
    }
    fotos = [...fotos, ruta];
  } else {
    anterior = imagenes[destino].ruta;
    imagenes[destino].ruta = ruta;
  }
  const { error } = await supabase.from("landings").update({ imagenes, fotos_proveedor: fotos, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) {
    await almacen.remove([ruta]);
    return { error: "No se pudo guardar la imagen." };
  }
  if (anterior) await borrarSinUso(id, [anterior], [...Object.values(imagenes).map((i) => i.ruta ?? ""), ...fotos]);
  const { data: firmada } = await almacen.createSignedUrl(ruta, SEGUNDOS_ENLACE);
  revalidatePath(RUTA);
  return { url: firmada?.signedUrl };
}

/** Quita una imagen de un espacio o una foto del proveedor, y borra el archivo si ya no se usa. */
export async function quitarImagenLanding(id: string, destino: string, ruta: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const actual = await landingPermitida(id, usuario);
  if (!actual) return { error: "La landing ya no existe o no es de tus países." };
  const imagenes = normalizarImagenes(actual.imagenes, id);
  let fotos = normalizarFotosProveedor(actual.fotos_proveedor, id);
  if (destino === "proveedor") fotos = fotos.filter((f) => f !== ruta);
  else if (ES_ESPACIO(destino)) {
    if (imagenes[destino].ruta !== ruta) return {};
    imagenes[destino].ruta = null;
  } else return { error: "Espacio de imagen no válido." };
  const { error } = await createServiceClient().from("landings").update({ imagenes, fotos_proveedor: fotos, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo quitar la imagen." };
  await borrarSinUso(id, [ruta], [...Object.values(imagenes).map((i) => i.ruta ?? ""), ...fotos]);
  revalidatePath(RUTA);
  return {};
}

/**
 * Lee la landing de referencia (modo «clonar»): baja su página (solo direcciones públicas, hasta 3 MB) y guarda cómo está
 * armada (título, encabezados en orden, imágenes y botones de compra). No copia textos ni imágenes a la landing.
 */
export async function analizarReferencia(id: string, url: string): Promise<{ error?: string; lectura?: LecturaReferencia }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await landingPermitida(id, usuario))) return { error: "La landing ya no existe o no es de tus países." };
  const direccion = String(url ?? "").trim().slice(0, 1000);
  if (!/^https?:\/\//i.test(direccion)) return { error: "Pega el enlace completo de la landing (empieza por https://)." };
  const descarga = await descargarPublico(direccion, 3 * 1024 * 1024, NAVEGADOR);
  if ("error" in descarga) return { error: "No se pudo abrir esa página. Revisa el enlace o prueba con otra." };
  let lectura = leerReferencia(new TextDecoder("utf-8").decode(descarga.bytes), direccion);
  // En una tienda Shopify el contenido suele estar en la descripción del producto: se suma (si no responde, queda lo leído).
  const urlJs = urlProductoShopify(direccion);
  if (urlJs) {
    const js = await descargarPublico(urlJs, 1024 * 1024, { ...NAVEGADOR, accept: "application/json,*/*" });
    if (!("error" in js)) {
      try {
        lectura = sumarProductoShopify(lectura, JSON.parse(new TextDecoder("utf-8").decode(js.bytes)), direccion);
      } catch {
        // No era JSON: se queda lo leído de la página.
      }
    }
  }
  if (!lectura.encabezados.length && !lectura.imagenes.length) return { error: "La página abrió, pero no se encontró contenido para leer (puede que se arme con JavaScript)." };
  const { error } = await createServiceClient()
    .from("landings")
    .update({ referencia_url: direccion, referencia: { ...lectura, leido_en: new Date().toISOString() }, modo: "clonar", actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar la lectura." };
  revalidatePath(RUTA);
  return { lectura };
}

/** Elimina la landing y sus imágenes. */
export async function eliminarLanding(id: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const actual = await landingPermitida(id, usuario);
  if (!actual) return { error: "La landing ya no existe o no es de tus países." };
  const supabase = createServiceClient();
  const { error } = await supabase.from("landings").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar la landing." };
  const { data: archivos } = await supabase.storage.from(BUCKET).list(id, { limit: 1000 });
  const rutas = (archivos ?? []).map((a) => `${id}/${a.name}`).filter((r) => rutaDeLanding(r, id));
  if (rutas.length) await supabase.storage.from(BUCKET).remove(rutas);
  await registrarAuditoria({ accion: "eliminar_landing", entidad: "landings", entidadId: id, detalle: actual.nombre });
  revalidatePath(RUTA);
  return {};
}

/**
 * Genera con Gemini la imagen de un espacio (la reemplaza si tenía). Manda como referencia las fotos del proveedor (o, si no
 * hay, la portada) para que el producto salga igual. Guarda también la instrucción usada. Tarda de 10 a 40 segundos.
 */
export async function generarImagenLanding(id: string, espacio: string, instruccion: string): Promise<{ error?: string; url?: string; ruta?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const actual = await landingPermitida(id, usuario);
  if (!actual) return { error: "La landing ya no existe o no es de tus países." };
  if (!ES_ESPACIO(espacio)) return { error: "Espacio de imagen no válido." };
  const supabase = createServiceClient();
  const almacen = supabase.storage.from(BUCKET);
  const imagenes = normalizarImagenes(actual.imagenes, id);
  const fotos = normalizarFotosProveedor(actual.fotos_proveedor, id);
  const texto = String(instruccion ?? "").trim().slice(0, 1000) || imagenes[espacio].instruccion;

  // Referencias: las fotos del proveedor; sin ellas, la portada (para que las demás imágenes muestren el mismo producto).
  const rutasRef = (fotos.length ? fotos : espacio !== "portada" && imagenes.portada.ruta ? [imagenes.portada.ruta] : []).slice(0, MAX_REFERENCIAS);
  const referencias: { mime: string; base64: string }[] = [];
  for (const ruta of rutasRef) {
    const { data: archivo } = await almacen.download(ruta);
    if (!archivo) continue;
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const tipo = detectarImagen(bytes.slice(0, 64));
    if (tipo && tipo.tipo !== "image/gif") referencias.push({ mime: tipo.tipo, base64: Buffer.from(bytes).toString("base64") });
  }

  const prompt = armarPromptImagen({ espacio, instruccion: texto, nombre: actual.nombre, angulo: actual.angulo, notas: actual.notas_ia, referencias: referencias.length });
  const r = await generarImagen(prompt, referencias, PROPORCION[espacio], { operacion: "landing_imagen", modulo: MODULO, usuario, referencia: id });
  if ("error" in r) return { error: r.error };
  const bytes = new Uint8Array(Buffer.from(r.base64, "base64"));
  const tipo = detectarImagen(bytes.slice(0, 64));
  if (!tipo) return { error: "Gemini devolvió algo que no es una imagen." };

  const ruta = `${id}/${Date.now()}-gemini-${espacio}.${tipo.extension}`;
  const { error: errorSubida } = await almacen.upload(ruta, bytes, { contentType: tipo.tipo });
  if (errorSubida) return { error: "No se pudo guardar la imagen generada." };
  // Se vuelve a leer la fila: mientras Gemini trabajaba pudo cambiar otra imagen de la landing.
  const fresca = await landingPermitida(id, usuario);
  const nuevas = normalizarImagenes(fresca?.imagenes ?? actual.imagenes, id);
  const anterior = nuevas[espacio].ruta;
  nuevas[espacio] = { ruta, instruccion: texto };
  const fotosFrescas = normalizarFotosProveedor(fresca?.fotos_proveedor ?? actual.fotos_proveedor, id);
  const { error } = await supabase.from("landings").update({ imagenes: nuevas, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) {
    await almacen.remove([ruta]);
    return { error: "No se pudo guardar la imagen generada." };
  }
  if (anterior) await borrarSinUso(id, [anterior], [...Object.values(nuevas).map((i) => i.ruta ?? ""), ...fotosFrescas]);
  await registrarAuditoria({ accion: "generar_imagen_landing", entidad: "landings", entidadId: id, detalle: `${actual.nombre}: ${espacio} (${modeloImagen()}, ${referencias.length} referencias)` });
  const { data: firmada } = await almacen.createSignedUrl(ruta, SEGUNDOS_ENLACE);
  revalidatePath(RUTA);
  return { url: firmada?.signedUrl, ruta };
}

// --- Shopify ---------------------------------------------------------------------------------------------------------

type FilaShopify = {
  id: string;
  nombre: string;
  pais_id: string;
  seleccion_id: string | null;
  moneda: string;
  precio: number | null;
  precio_tachado: number | null;
  contenido: unknown;
  imagenes: unknown;
  estado: string;
  shopify: DatosShopify | null;
};

async function filaParaShopify(id: string, usuario: Usuario): Promise<FilaShopify | null> {
  if (!UUID.test(id)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("landings").select("id, nombre, pais_id, seleccion_id, moneda, precio, precio_tachado, contenido, imagenes, estado, shopify").eq("id", id).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, data.pais_id))) return null;
  return { ...data, precio: data.precio === null ? null : Number(data.precio), precio_tachado: data.precio_tachado === null ? null : Number(data.precio_tachado) } as FilaShopify;
}

/**
 * Crea el producto de la landing en Shopify como **borrador** (o, si ya existe, lo actualiza): título, precio y precio tachado,
 * las ofertas como variantes, las imágenes (la portada primero) y la landing como descripción. Las imágenes se mandan con un
 * enlace firmado; Shopify las copia y la descripción usa las direcciones de Shopify. Tarda de 10 a 60 segundos.
 */
export async function enviarAShopify(id: string): Promise<{ error?: string; shopify?: DatosShopify }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!shopifyConectado()) return { error: "Falta conectar Shopify." };
  const l = await filaParaShopify(id, usuario);
  if (!l) return { error: "La landing ya no existe o no es de tus países." };
  const contenido = normalizarContenido(l.contenido);
  const imagenes = normalizarImagenes(l.imagenes, id);
  const faltan = faltantesLanding({ nombre: l.nombre, precio: l.precio, contenido, imagenes });
  if (faltan.length || l.precio === null) return { error: `Antes de enviarla falta: ${faltan.join(", ").toLowerCase()}.` };

  const supabase = createServiceClient();
  const rutas = ESPACIOS_IMAGEN.map((e) => imagenes[e.clave].ruta).filter((r): r is string => !!r);
  const { data: firmadas } = await supabase.storage.from(BUCKET).createSignedUrls(rutas, SEGUNDOS_ENLACE);
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const conUrl = Object.fromEntries(
    ESPACIOS_IMAGEN.map((e) => {
      const ruta = imagenes[e.clave].ruta;
      return [e.clave, ruta && url.get(ruta) ? { ruta, url: url.get(ruta)! } : null];
    }),
  ) as Partial<Record<EspacioImagen, { ruta: string; url: string }>>;
  const previo = l.shopify?.productoId ? l.shopify : null;
  const archivos = archivosShopify(conUrl, previo?.medios, l.nombre);
  const ofertas = await ofertasEnMoneda(supabase, l.seleccion_id, l.moneda);
  const formato = formatoPrecioMoneda(l.moneda);
  // Primera pasada: la descripción con las fotos que ya estaban en Shopify (las nuevas se completan al terminar de procesarse).
  const urlsPrevias = Object.fromEntries(archivos.map((a) => [a.espacio, "id" in a.entrada ? (previo?.medios[a.espacio]?.url ?? null) : null]));
  const descripcion = (urls: Partial<Record<EspacioImagen, string | null>>) => htmlDescripcion({ nombre: l.nombre, contenido, imagenes: urls, ofertas, formato });

  const guardado = await guardarProducto(
    {
      title: l.nombre,
      descriptionHtml: descripcion(urlsPrevias),
      status: previo && l.estado === "publicada" ? "ACTIVE" : "DRAFT",
      ...variantesShopify({ precio: l.precio, precioTachado: l.precio_tachado, ofertas }),
      files: archivos.map((a) => a.entrada),
    },
    previo?.productoId ?? null,
  );
  if ("error" in guardado) return { error: guardado.error };
  const productoId = guardado.producto.id;

  // Se espera a que Shopify procese las fotos: sus direcciones van en la descripción. Van en el mismo orden en que se mandaron.
  const procesado = await esperarFotos(productoId);
  const producto = "error" in procesado ? guardado.producto : procesado;
  const medios: DatosShopify["medios"] = {};
  archivos.forEach((a, i) => {
    const m = producto.media.nodes[i];
    if (m) medios[a.espacio] = { mediaId: m.id, ruta: conUrl[a.espacio]!.ruta, url: m.image?.url ?? null };
  });
  const urlsFinales = Object.fromEntries(Object.entries(medios).map(([k, v]) => [k, v?.url ?? null]));
  if (!("error" in procesado)) {
    const act = await shopifyGraphql<{ productUpdate: { userErrors: { message: string }[] } }>(
      `mutation Descripcion($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { field message } } }`,
      { p: { id: productoId, descriptionHtml: descripcion(urlsFinales) } },
    );
    if ("error" in act) return { error: `El producto se guardó, pero no su descripción con imágenes: ${act.error}` };
  }

  const datos: DatosShopify = {
    tienda: tiendaShopify()!,
    productoId,
    handle: producto.handle,
    medios,
    url: producto.onlineStoreUrl ?? producto.onlineStorePreviewUrl ?? "",
    adminUrl: urlAdmin(productoId),
    sincronizadoEn: new Date().toISOString(),
    publicadoEn: previo?.publicadoEn ?? null,
  };
  const { error } = await supabase.from("landings").update({ shopify: datos, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "El producto se creó en Shopify, pero no se pudo guardar su enlace aquí." };
  await registrarAuditoria({ accion: previo ? "actualizar_landing_shopify" : "crear_landing_shopify", entidad: "landings", entidadId: id, detalle: `${l.nombre} · ${datos.adminUrl}` });
  revalidatePath(RUTA);
  if ("error" in procesado) return { error: `El producto quedó en Shopify, pero sin terminar sus imágenes (${procesado.error}). Pulsa «Actualizar en Shopify» en un momento.`, shopify: datos };
  return { shopify: datos };
}

/**
 * Publica el producto en la tienda online (lo activa) y la landing pasa a «Publicada». Si viene de un producto de Selección,
 * su enlace queda como página del producto en sus tests de Test productos que no tengan una.
 */
export async function publicarEnShopify(id: string): Promise<{ error?: string; shopify?: DatosShopify }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!shopifyConectado()) return { error: "Falta conectar Shopify." };
  const l = await filaParaShopify(id, usuario);
  if (!l) return { error: "La landing ya no existe o no es de tus países." };
  if (!l.shopify?.productoId) return { error: "Primero crea el borrador en Shopify." };
  const r = await publicarProducto(l.shopify.productoId);
  if ("error" in r) return { error: r.error };
  const datos: DatosShopify = { ...l.shopify, url: r.producto.onlineStoreUrl ?? l.shopify.url, publicadoEn: new Date().toISOString() };
  const supabase = createServiceClient();
  const { error } = await supabase.from("landings").update({ shopify: datos, estado: "publicada", actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Se publicó en Shopify, pero no se pudo guardar aquí." };
  if (l.seleccion_id && datos.url)
    await supabase.from("wms_productos_test").update({ pagina_producto_url: datos.url }).eq("seleccion_id", l.seleccion_id).is("pagina_producto_url", null);
  await registrarAuditoria({ accion: "publicar_landing_shopify", entidad: "landings", entidadId: id, detalle: `${l.nombre} · ${datos.url}`, antes: { Estado: etiquetaEstadoLanding(l.estado) }, despues: { Estado: "Publicada" } });
  revalidatePath(RUTA);
  revalidatePath("/productos-test/productos");
  return { shopify: datos };
}
