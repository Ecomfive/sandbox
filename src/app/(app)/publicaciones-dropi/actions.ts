"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { ESTADOS_PUBLICACION, fulfillmentFijo, TIPOS, UBICACIONES, etiqueta, numeroPublicacion, type OpcionPublicacion } from "@/lib/publicaciones/publicacion";
import { idsDeDropi } from "@/lib/publicaciones/sincronizar-dropi";
import { grupoDe, nombreDelPublico } from "@/lib/publicaciones/apagar-dropi";
import { encolarApagar, encolarArchivar, encolarCrear, encolarPrivatizar, encolarRepublicar, enviarNombreADropi, enviarPrecioADropi } from "@/lib/publicaciones/cambios-dropi";
import { BODEGA_DROPI } from "@/lib/publicaciones/automatico";
import { faltantesPrivatizar, nombrePrivado, normalizarDatosPrivatizar } from "@/lib/publicaciones/privatizar-dropi";
import { faltantesCrearDropi, normalizarDatosCrear, MAX_FOTOS_CREAR, type DatosCrearDropi, type FotoCrear } from "@/lib/publicaciones/crear-dropi";
import { descripcionAHtml } from "@/lib/publicaciones/descripcion-dropi";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { MAX_NOMBRE_DROPI } from "@/lib/publicaciones/dropi-guardado";
import { MOTIVO_CON_STOCK, MOTIVO_SIN_STOCK, sinStockParaArchivar } from "@/lib/publicaciones/archivar";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const RUTA = "/publicaciones-dropi";
const BUCKET = "wms-productos";
/** Una foto que se subió desde el formulario de publicar: `publicaciones/borrador/<uuid>/<fecha>-<nombre>`. */
const RUTA_FOTO_BORRADOR = /^publicaciones\/borrador\/[0-9a-f-]{36}\/\d+-[A-Za-z0-9._-]+$/;
const MAX_BYTES_FOTO_DROPI = 10 * 1024 * 1024;
const urlPublica = (ruta: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
const texto = (f: FormData, k: string, max: number) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};
const deLista = (f: FormData, k: string, lista: OpcionPublicacion[]) => {
  const v = texto(f, k, 40);
  return lista.some((o) => o.valor === v) ? v : null;
};
const numero = (f: FormData, k: string): number | null | undefined => {
  const t = texto(f, k, 20);
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : undefined;
};

type Datos = Record<string, string | number | boolean | null>;

/**
 * Si una publicación no se puede archivar por no tener stock en Dropi (27 oct 2026): la última lectura de «Mis productos» de sus IDs
 * o, sin ella, la carga de Ventas Dropi; es la misma cuenta que hace la pantalla (`noSeArchivaSinStock`). Sin ID o sin datos, se deja.
 */
async function sinStockEnDropi(paisId: string, dropiId: string | null): Promise<boolean> {
  const ids = idsDeDropi(dropiId);
  if (!ids.length) return false;
  const supabase = createServiceClient();
  const suma = (filas: Record<string, unknown>[], k: string) => filas.reduce((t, x) => t + (Number(x[k]) || 0), 0);
  const { data: leido } = await supabase.from("dropi_productos_proveedor").select("stock, stock_privado").eq("pais_id", paisId).in("dropi_producto_id", ids);
  if (leido?.length) return sinStockParaArchivar(suma(leido, "stock"), suma(leido, "stock_privado"));
  const { data: ventas } = await supabase.from("dropi_ventas_productos").select("stock").eq("pais_id", paisId).in("dropi_producto_id", ids);
  return ventas?.length ? sinStockParaArchivar(suma(ventas, "stock")) : false;
}

/** El fulfillment fijo del país de la publicación (Panamá), o null si se escribe en la ficha. */
async function fulfillmentDelPais(supabase: ReturnType<typeof createServiceClient>, paisId: string): Promise<number | null> {
  const { data } = await supabase.from("paises").select("codigo").eq("id", paisId).maybeSingle();
  return fulfillmentFijo(data?.codigo as string | undefined);
}

/** Lee y valida los datos de la ficha (crear o guardar). `fijo`: el fulfillment del país, si no se escribe. Devuelve el error como valor. */
function leerDatos(f: FormData, fijo: number | null): Datos | { error: string } {
  const nombre = texto(f, "nombre", 300);
  if (!nombre) return { error: "Escribe el nombre del producto." };
  const precio = numero(f, "precio_venta");
  const costo = numero(f, "costo_mercancia");
  // En Panamá el fulfillment es fijo (27 oct 2026) y no viene del formulario.
  const fulfillment = fijo ?? numero(f, "fulfillment");
  if ([precio, costo, fulfillment].includes(undefined)) return { error: "Un precio o costo no es válido." };
  const email = texto(f, "privatizado_email", 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "El correo del dropshipper no es válido." };
  const resp = texto(f, "responsable_id", 64);
  return {
    nombre,
    dropi_id: texto(f, "dropi_id", 60) || null,
    // Estado y Tipo se eligen en la ficha (24 oct 2026, el sistema manda; antes salían de Dropi). Solo si vienen en el formulario:
    // crear una publicación no los trae y no los borra. En la ficha no se ofrece «Eliminado» (ninguna publicación se elimina).
    ...(f.has("estado_publicacion") ? { estado_publicacion: deLista(f, "estado_publicacion", ESTADOS_PUBLICACION) } : {}),
    ...(f.has("tipo_publicacion") ? { tipo_publicacion: deLista(f, "tipo_publicacion", TIPOS) } : {}),
    privatizado_a: texto(f, "privatizado_a", 120) || null,
    privatizado_email: email || null,
    precio_venta: precio ?? null,
    costo_mercancia: costo ?? null,
    fulfillment: fulfillment ?? null,
    // «Coste real» ya no se usa (21 oct 2026): no va aquí, así guardar la ficha no borra el dato que quedó en la base.
    // «Estado de venta» ya no se edita (lo reemplazan las ventas de Dropi de 30 días): no va aquí, así guardar la ficha no
    // borra el dato que quedó en la base.
    ubicacion: deLista(f, "ubicacion", UBICACIONES),
    // «Reposición» y «Competencia» ya no se editan aquí (la reposición se hace desde Compras y la competencia se ve en la del
    // producto): no van, así guardar la ficha no borra lo que quedó en la base.
    // «Fecha de publicación» ya no se anota (21 oct 2026): sale de Dropi (la primera venta). Al crear una se pone la de hoy.
    // «Último cambio de precio» ya no se anota (21 oct 2026): lo detecta la lectura del catálogo de Dropi.
    // Las «Notas» salieron de la ficha (23 oct 2026): lo que había pasó a la Actividad (migración 0146). La columna se conserva sin tocarla.
    responsable_id: UUID.test(resp) ? resp : null,
  };
}

/**
 * Otra publicación del país que ya usa alguno de esos IDs de Dropi (pedido de Hernán, 23 oct 2026: al importar ClickUp entraron
 * pares con el mismo ID). No cuentan las marcadas como duplicadas (migración 0147). El mensaje de error, o null si está libre.
 */
async function idDropiRepetido(paisId: string, dropiId: string | null, menos: string | null): Promise<string | null> {
  const ids = idsDeDropi(dropiId);
  if (!ids.length) return null;
  const supabase = createServiceClient();
  const leer = (columnas: string) => supabase.from("dropi_publicaciones").select(columnas).eq("pais_id", paisId).not("dropi_id", "is", null).limit(5000);
  let r = await leer("id, numero, nombre, dropi_id, duplicada_de");
  if (r.error) r = await leer("id, numero, nombre, dropi_id");
  const otra = ((r.data ?? []) as unknown as Record<string, unknown>[]).find(
    (p) => p.id !== menos && !p.duplicada_de && idsDeDropi(p.dropi_id as string | null).some((x) => ids.includes(x)),
  );
  if (!otra) return null;
  const repetido = idsDeDropi(otra.dropi_id as string | null).find((x) => ids.includes(x));
  return `El ID ${repetido} de Dropi ya es de ${numeroPublicacion(otra.numero as number | null)} (${otra.nombre}). Ábrela en vez de crear otra.`;
}

/** La publicación, si existe y es de un país que la persona ve. */
async function publicacionPermitida(id: string, permitidos: string[] | null) {
  if (!UUID.test(id)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("dropi_publicaciones").select("*").eq("id", id).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, permitidos, data.pais_id))) return null;
  return data as Record<string, unknown> & { id: string; pais_id: string; nombre: string };
}

/** Da permiso para subir directo a Storage una foto de la publicación que se está por publicar en Dropi (sin pasar por el límite de las acciones). */
export async function prepararSubidaFotoBorrador(nombreArchivo: string): Promise<{ ruta: string; token: string; url: string } | { error: string }> {
  await requireModuloEscritura(MODULO);
  const nombre = String(nombreArchivo ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "foto";
  const ruta = `publicaciones/borrador/${crypto.randomUUID()}/${Date.now()}-${nombre}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No se pudo preparar la subida." };
  return { ruta, token: data.token, url: urlPublica(ruta) };
}

/** Un número de medida (peso o tamaño) del formulario: positivo, hasta 3 decimales. */
function medida(f: FormData, k: string): number | null {
  const t = texto(f, k, 20).replace(",", ".");
  const n = Number(t);
  return t && Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 1000) / 1000 : null;
}

/**
 * Las fotos que se mandan para Dropi: solo archivos de esta publicación (subidos desde el formulario, o generados por la IA para ella), que de
 * verdad sean una imagen JPG, PNG o WebP de hasta 10 MB (Dropi no admite más). El navegador no decide qué archivo se sube: se revisa por su contenido.
 */
async function fotosValidas(supabase: ReturnType<typeof createServiceClient>, rutas: unknown, publicacionId: string | null): Promise<{ fotos: FotoCrear[] } | { error: string }> {
  if (!Array.isArray(rutas) || rutas.length > MAX_FOTOS_CREAR) return { error: `Sube hasta ${MAX_FOTOS_CREAR} fotos.` };
  const fotos: FotoCrear[] = [];
  for (const ruta of [...new Set(rutas)]) {
    const propia = typeof ruta === "string" && publicacionId !== null && new RegExp(`^publicaciones/${publicacionId}/ia/[A-Za-z0-9._-]+$`).test(ruta);
    if (typeof ruta !== "string" || !(RUTA_FOTO_BORRADOR.test(ruta) || propia)) return { error: "Una de las fotos no es válida: vuelve a subirla." };
    const { data, error } = await supabase.storage.from(BUCKET).download(ruta);
    if (error || !data) return { error: "No se encontró una de las fotos: vuelve a subirla." };
    if (data.size > MAX_BYTES_FOTO_DROPI) return { error: "Una foto pesa más de 10 MB, que es lo que admite Dropi." };
    const tipo = detectarImagen(new Uint8Array(await data.slice(0, 64).arrayBuffer()));
    if (!tipo || tipo.tipo === "image/gif") return { error: "Una de las fotos no es una imagen JPG, PNG o WebP." };
    fotos.push({ url: urlPublica(ruta), nombre: ruta.split("/").pop() ?? "foto.jpg" });
  }
  return { fotos };
}

/** El producto de Producto elegido en «Publicar en Dropi» (`sku_maestro_id`): su código es el SKU de Dropi. null si no viene o no existe. */
async function productoElegido(f: FormData, supabase: ReturnType<typeof createServiceClient>): Promise<{ id: string; codigo: string; codigoBarras: string | null } | null> {
  const id = texto(f, "sku_maestro_id", 64);
  if (!UUID.test(id)) return null;
  const { data } = await supabase.from("skus_maestros").select("id, codigo, codigo_barras").eq("id", id).maybeSingle();
  return data ? { id: data.id as string, codigo: String(data.codigo ?? ""), codigoBarras: (data.codigo_barras as string | null) ?? null } : null;
}

/**
 * Lo que Dropi pide, leído del formulario (los campos `dd_*`); las fotos y las categorías llegan como listas en JSON. El SKU, el nombre de la
 * guía de envío y el código de barras salen del producto vinculado si no se escribieron (27 oct 2026): el SKU de Dropi es el código del producto.
 */
async function leerDatosDropi(
  f: FormData,
  supabase: ReturnType<typeof createServiceClient>,
  base: { nombre: string; precio: number | null; publicacionId: string | null; producto?: { codigo: string; codigoBarras: string | null } | null },
): Promise<DatosCrearDropi | { error: string }> {
  const lista = (k: string): unknown => {
    try {
      return JSON.parse(texto(f, k, 20000) || "[]");
    } catch {
      return null;
    }
  };
  const fotos = await fotosValidas(supabase, lista("dd_fotos"), base.publicacionId);
  if ("error" in fotos) return fotos;
  const bodega = Math.trunc(Number(texto(f, "dd_bodega", 12)));
  const unidades = Math.trunc(Number(texto(f, "dd_unidades", 12)));
  const sku = texto(f, "dd_sku", 120) || base.producto?.codigo || "";
  // En la guía de envío va el SKU, para que despacho vea siempre el mismo nombre (22 oct 2026), si cabe en los 40 caracteres de Dropi.
  const nombreGuia = texto(f, "dd_nombre_guia", 300) || (sku && sku.length <= MAX_NOMBRE_DROPI ? sku : "");
  return normalizarDatosCrear({
    nombre: base.nombre,
    nombreGuia: nombreGuia || null,
    precio: base.precio,
    // El sugerido va igual al precio (decisión de Alcides, 23 oct 2026).
    precioSugerido: base.precio,
    peso: medida(f, "dd_peso"),
    largo: medida(f, "dd_largo"),
    ancho: medida(f, "dd_ancho"),
    alto: medida(f, "dd_alto"),
    categorias: lista("dd_categorias"),
    descripcion: descripcionAHtml(texto(f, "dd_descripcion", 20000)),
    descripcionApp: texto(f, "dd_descripcion_app", 5000),
    sku: sku || null,
    codigoBarras: texto(f, "dd_codigo_barras", 60) || base.producto?.codigoBarras || null,
    bodegas: Number.isInteger(bodega) && bodega > 0 && Number.isInteger(unidades) ? [{ id: bodega, unidades }] : [],
    fotos: fotos.fotos,
  });
}

/** «Agregar» › «Publicar en Dropi»: la publicación nace «Sin publicar» con todo lo que Dropi pide y queda pendiente para «Aplicar en Dropi». */
/** Lo que devuelve crear una publicación nueva: con su id y lo que se necesita para ofrecer crear su producto (pack o combo) si no se eligió uno. */
export interface PublicacionCreada {
  error?: string;
  id?: string;
  nombre?: string;
  sku?: string | null;
  fotos?: string[];
  /** true si no se eligió un producto de Producto: se puede ofrecer crearlo. */
  sinProducto?: boolean;
}

async function crearParaPublicar(f: FormData, usuario: Awaited<ReturnType<typeof requireModuloEscritura>>, paisId: string, supabase: ReturnType<typeof createServiceClient>): Promise<PublicacionCreada> {
  const basicos = leerDatos(f, await fulfillmentDelPais(supabase, paisId));
  if ("error" in basicos) return basicos;
  // Sin las columnas de la migración 0151 no se puede dejar pendiente: se avisa antes de crear nada (ninguna publicación se borra).
  const lista = await supabase.from("dropi_cambios_pendientes").select("datos").limit(1);
  if (lista.error) return { error: "Falta correr en Supabase la migración 0151." };
  const precio = typeof basicos.precio_venta === "number" ? basicos.precio_venta : null;
  const producto = await productoElegido(f, supabase);
  const datos = await leerDatosDropi(f, supabase, { nombre: String(basicos.nombre), precio, publicacionId: null, producto });
  if ("error" in datos) return datos;
  const falta = faltantesCrearDropi(datos);
  if (falta.length) return { error: falta[0] };
  const { data, error } = await supabase
    .from("dropi_publicaciones")
    .insert({
      ...basicos,
      sku_maestro_id: producto?.id ?? null,
      dropi_id: null,
      tipo_publicacion: "publico",
      estado_publicacion: "borrador",
      datos_dropi: datos,
      descripcion: datos.descripcion,
      pais_id: paisId,
      fecha_publicacion: null,
      responsable_id: basicos.responsable_id ?? usuario.id,
      creado_por: usuario.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear la publicación." };
  await registrarAuditoria({ accion: "crear_borrador_dropi", entidad: "dropi_publicaciones", entidadId: data.id, detalle: `${datos.nombre} · ${datos.fotos.length} fotos · ${datos.bodegas[0]?.unidades ?? 0} unidades` });
  const r = await encolarCrear(supabase, { id: data.id as string, pais_id: paisId }, datos, { id: usuario.id, nombre: usuario.nombre || usuario.email });
  revalidatePath(RUTA);
  if ("error" in r) return { error: `Se guardó como «Sin publicar», pero no quedó pendiente para Dropi: ${r.error} Ábrela y pulsa «Publicar en Dropi».` };
  await registrarAuditoria({ accion: "dropi_crear_pendiente", entidad: "dropi_publicaciones", entidadId: data.id, detalle: `${datos.nombre}: pendiente para «Aplicar en Dropi»` });
  return resumenCreada(data.id as string, datos, producto);
}

/**
 * «Guardar como borrador» (pedido de Jhokser, 24 oct 2026): la publicación se guarda «Sin publicar» con lo que se haya llenado, aunque falten datos
 * de los que Dropi exige. No queda pendiente para Dropi: se completa desde su ficha y se publica con «Publicar en Dropi», o se elimina.
 */
async function crearComoBorrador(f: FormData, usuario: Awaited<ReturnType<typeof requireModuloEscritura>>, paisId: string, supabase: ReturnType<typeof createServiceClient>): Promise<PublicacionCreada> {
  const basicos = leerDatos(f, await fulfillmentDelPais(supabase, paisId));
  if ("error" in basicos) return basicos;
  const precio = typeof basicos.precio_venta === "number" ? basicos.precio_venta : null;
  const producto = await productoElegido(f, supabase);
  const datos = await leerDatosDropi(f, supabase, { nombre: String(basicos.nombre), precio, publicacionId: null, producto });
  if ("error" in datos) return datos;
  const { data, error } = await supabase
    .from("dropi_publicaciones")
    .insert({
      ...basicos,
      sku_maestro_id: producto?.id ?? null,
      dropi_id: null,
      tipo_publicacion: "publico",
      estado_publicacion: "borrador",
      datos_dropi: datos,
      descripcion: datos.descripcion || null,
      pais_id: paisId,
      fecha_publicacion: null,
      responsable_id: basicos.responsable_id ?? usuario.id,
      creado_por: usuario.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.code === "23514" ? "Falta correr en Supabase la migración 0151." : "No se pudo guardar el borrador." };
  const falta = faltantesCrearDropi(datos);
  await registrarAuditoria({ accion: "crear_borrador_dropi", entidad: "dropi_publicaciones", entidadId: data.id, detalle: `${datos.nombre} · borrador${falta.length ? ` (faltan ${falta.length} datos para Dropi)` : " (completo)"}` });
  revalidatePath(RUTA);
  return resumenCreada(data.id as string, datos, producto);
}

/** Lo que la ficha necesita para ofrecer crear el producto (pack o combo) de la publicación recién creada. */
function resumenCreada(id: string, datos: { nombre: string; sku: string | null; fotos: { url: string }[] }, producto: unknown): PublicacionCreada {
  return { id, nombre: datos.nombre, sku: datos.sku, fotos: datos.fotos.map((x) => x.url), sinProducto: !producto };
}

/** «Agregar»: una publicación nueva en el país de la barra. */
export async function crearPublicacion(f: FormData): Promise<PublicacionCreada> {
  const usuario = await requireModuloEscritura(MODULO);
  const paisId = texto(f, "pais_id", 64);
  const supabase = createServiceClient();
  if (!UUID.test(paisId) || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, paisId))) return { error: "País no válido." };
  // Un producto nuevo se publica en Dropi desde aquí (pedido de Jhokser, 24 oct 2026); «Ya está en Dropi» solo la anota.
  if (texto(f, "modo", 12) === "publicar") return crearParaPublicar(f, usuario, paisId, supabase);
  if (texto(f, "modo", 12) === "borrador") return crearComoBorrador(f, usuario, paisId, supabase);
  const datos = leerDatos(f, await fulfillmentDelPais(supabase, paisId));
  if ("error" in datos) return datos;
  const repetido = await idDropiRepetido(paisId, (datos.dropi_id as string | null) ?? null, null);
  if (repetido) return { error: repetido };
  const { data, error } = await supabase
    .from("dropi_publicaciones")
    .insert({ ...datos, pais_id: paisId, fecha_publicacion: datos.fecha_publicacion ?? hoy(), responsable_id: datos.responsable_id ?? usuario.id, creado_por: usuario.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.code === "42P01" ? "Falta correr en Supabase la migración 0116." : "No se pudo crear la publicación." };
  await registrarAuditoria({ accion: "crear_publicacion_dropi", entidad: "dropi_publicaciones", entidadId: data.id, detalle: `${datos.nombre}${datos.dropi_id ? ` (ID ${datos.dropi_id})` : ""}` });
  revalidatePath(RUTA);
  return {};
}

/** Lo que se muestra de cada dato en la actividad (antes → después). */
const VISTA: [string, string, (v: unknown) => string][] = [
  ["nombre", "Producto", (v) => String(v ?? "—")],
  ["dropi_id", "ID Dropi", (v) => String(v ?? "—")],
  ["privatizado_a", "Privatizado a", (v) => String(v ?? "—")],
  ["precio_venta", "Precio de venta", (v) => (v === null ? "—" : `$${Number(v).toFixed(2)}`)],
  ["costo_mercancia", "Costo de producto", (v) => (v === null ? "—" : `$${Number(v).toFixed(2)}`)],
  ["fulfillment", "Fulfillment", (v) => (v === null ? "—" : `$${Number(v).toFixed(2)}`)],
  ["ubicacion", "Dónde está", (v) => etiqueta(UBICACIONES, v as string)],
  ["estado_publicacion", "Estado", (v) => (v ? etiqueta(ESTADOS_PUBLICACION, v as string) : "—")],
  ["tipo_publicacion", "Tipo", (v) => (v ? etiqueta(TIPOS, v as string) : "—")],
];

/**
 * Guarda la ficha. Si cambia el precio, «Último cambio de precio» pasa a hoy (salvo que se haya escrito otra fecha). Si cambia el
 * nombre (hasta 40 caracteres, lo que admite Dropi), se guarda y queda pendiente para Dropi, como «Usar este título» del Asistente
 * de IA: lo aplica «Aplicar en Dropi». `dropi` dice cómo quedó ese envío.
 */
export async function actualizarPublicacion(f: FormData): Promise<{ error?: string; dropi?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const id = texto(f, "id", 64);
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  const datos = leerDatos(f, await fulfillmentDelPais(createServiceClient(), antes.pais_id));
  if ("error" in datos) return datos;
  // Una «Sin publicar» (migración 0151) no existe en Dropi: no tiene ID, y deja de ser borrador solo al publicarla (y viceversa).
  const sinPublicar = antes.estado_publicacion === "borrador";
  if (sinPublicar) {
    if ("estado_publicacion" in datos && datos.estado_publicacion !== "borrador") return { error: "Está sin publicar: se publica con «Publicar en Dropi»." };
    datos.dropi_id = null;
  } else if ("estado_publicacion" in datos && datos.estado_publicacion === "borrador") {
    return { error: "«Sin publicar» es solo para publicaciones que todavía no existen en Dropi." };
  }
  // Un ID de Dropi nuevo no puede ser el de otra publicación del país (las duplicadas no cuentan).
  if ((datos.dropi_id ?? null) !== ((antes.dropi_id as string | null) ?? null) && !antes.duplicada_de) {
    const repetido = await idDropiRepetido(antes.pais_id, (datos.dropi_id as string | null) ?? null, id);
    if (repetido) return { error: repetido };
  }
  // El Estado elegido en la ficha manda también sobre el estado interno con que «Archivar» la guarda: elegir «Activo» la saca de
  // Archivados y elegir «Archivado» la archiva. Una duplicada se queda archivada (la que vale es la otra).
  if ("estado_publicacion" in datos && datos.estado_publicacion !== ((antes.estado_publicacion as string | null) ?? null)) {
    const archivar = datos.estado_publicacion === "archivado";
    if (!archivar && antes.duplicada_de) return { error: "Es un duplicado de otra publicación con el mismo ID de Dropi: usa esa." };
    if (archivar && !sinPublicar && (await sinStockEnDropi(antes.pais_id, (antes.dropi_id as string | null) ?? null))) return { error: MOTIVO_SIN_STOCK };
    if (archivar) datos.estado = "archivado";
    else if (antes.estado === "archivado") datos.estado = "al_dia";
  }
  // El nombre se edita aquí y viaja a Dropi (22 oct 2026); la sincronización con Dropi no lo pisa.
  const nombreNuevo = String(datos.nombre ?? "").trim();
  const cambiaNombre = !!nombreNuevo && nombreNuevo !== String(antes.nombre ?? "").trim();
  if (cambiaNombre && nombreNuevo.length > MAX_NOMBRE_DROPI) return { error: `Dropi admite ${MAX_NOMBRE_DROPI} caracteres en el nombre: este tiene ${nombreNuevo.length}.` };
  if (cambiaNombre) datos.nombre = nombreNuevo;
  else delete datos.nombre;

  const { error } = await createServiceClient()
    .from("dropi_publicaciones")
    .update({ ...datos, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar la publicación." };

  const cambios = VISTA.filter(([k]) => {
    if (k === "nombre") return cambiaNombre;
    if (!(k in datos)) return false;
    const a = antes[k] === null || antes[k] === undefined ? null : typeof datos[k] === "number" ? Number(antes[k]) : antes[k];
    return a !== datos[k];
  });
  if (cambios.length)
    await registrarAuditoria({
      accion: "editar_publicacion_dropi",
      entidad: "dropi_publicaciones",
      entidadId: id,
      antes: Object.fromEntries(cambios.map(([k, n, ver]) => [n, ver(antes[k] ?? null)])),
      despues: Object.fromEntries(cambios.map(([k, n, ver]) => [n, ver(datos[k])])),
    });
  let dropi: string | undefined;
  // Archivar o sacar de Archivados eligiendo el Estado en la ficha también queda pendiente para Dropi, igual que el botón «Archivar» (24 oct 2026).
  const eraArchivada = antes.estado === "archivado" || antes.estado_publicacion === "archivado";
  const ahoraArchivada = (datos.estado ?? antes.estado) === "archivado" || (datos.estado_publicacion ?? antes.estado_publicacion) === "archivado";
  const dropiAntes = (antes.dropi_id as string | null) ?? null;
  if (!sinPublicar && eraArchivada !== ahoraArchivada && dropiAntes && idsDeDropi(dropiAntes).length > 0) {
    const r = await encolarArchivar(createServiceClient(), { id, pais_id: antes.pais_id, dropi_id: dropiAntes }, { restaurar: !ahoraArchivada }, { estado: (antes.estado as string | null) ?? null, estado_publicacion: (antes.estado_publicacion as string | null) ?? null }, { id: usuario.id, nombre: usuario.nombre || usuario.email });
    if ("error" in r) dropi = `El estado se guardó, pero no quedó para Dropi: ${r.error}`;
    else if ("cancelo" in r) {
      // Era el contrario de uno pendiente: se cancelan entre sí y la publicación vuelve a como estaba antes de ese pedido.
      await createServiceClient().from("dropi_publicaciones").update({ estado: r.cancelo.estado ?? undefined, estado_publicacion: r.cancelo.estado_publicacion }).eq("id", id);
      dropi = "Se canceló el archivar que esperaba para Dropi: Dropi no se tocó.";
    } else {
      dropi = `${ahoraArchivada ? "Archivar" : "Salir de Archivados"} pendiente en Dropi: pulsa «Aplicar en Dropi» con Dropi abierto.`;
      if (!r.yaEstaba) await registrarAuditoria({ accion: ahoraArchivada ? "dropi_archivar_pendiente" : "dropi_restaurar_pendiente", entidad: "dropi_publicaciones", entidadId: id, detalle: `${antes.nombre} · ID Dropi ${dropiAntes}: pendiente para «Aplicar en Dropi»` });
    }
  }
  // Sin publicar: el nombre y el precio se toman de la publicación al publicarla; no hay nada que mandar a Dropi todavía.
  if (sinPublicar) {
    revalidatePath(RUTA);
    return { dropi };
  }
  // El precio cambiado en la ficha también va a Dropi por la cola (22 oct 2026), junto con el nombre si los dos cambiaron.
  const precioAntes = antes.precio_venta === null || antes.precio_venta === undefined ? null : Number(antes.precio_venta);
  const precioNuevo = typeof datos.precio_venta === "number" ? datos.precio_venta : null;
  if (precioNuevo !== null && precioNuevo > 0 && (precioAntes === null || Math.abs(precioAntes - precioNuevo) > 0.004)) {
    const r = await enviarPrecioADropi(createServiceClient(), { id, pais_id: antes.pais_id, dropi_id: (antes.dropi_id as string | null) ?? null }, precioNuevo, precioAntes, { id: usuario.id, nombre: usuario.nombre || usuario.email });
    dropi = [dropi, r.estado === "pendiente" ? r.detalle : `El precio se guardó, pero no quedó para Dropi: ${r.detalle}`].filter(Boolean).join(" ");
  }
  if (cambiaNombre) {
    const r = await enviarNombreADropi(createServiceClient(), { id, pais_id: antes.pais_id, dropi_id: (antes.dropi_id as string | null) ?? null, sku_maestro_id: (antes.sku_maestro_id as string | null) ?? null }, nombreNuevo, { id: usuario.id, nombre: usuario.nombre || usuario.email }, antes.nombre);
    dropi = [dropi, r.estado === "pendiente" ? "Nombre para Dropi: pulsa «Aplicar en Dropi» con Dropi abierto." : `El nombre se guardó, pero no quedó para Dropi: ${r.detalle}`].filter(Boolean).join(" ");
  }
  revalidatePath(RUTA);
  return { dropi };
}

/**
 * Guarda los datos que Dropi pide de una publicación «Sin publicar» (peso, medidas, categoría, descripción, stock inicial y fotos). Si la
 * publicación ya estaba pendiente para Dropi, el cambio pendiente toma los datos nuevos (mientras Dropi no haya creado el producto).
 */
export async function guardarDatosDropi(f: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const id = texto(f, "id", 64);
  const pub = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!pub) return { error: "La publicación ya no existe o no es de tus países." };
  if (pub.estado_publicacion !== "borrador") return { error: "Solo se editan los datos de una publicación que todavía no está en Dropi." };
  const supabase = createServiceClient();
  const precio = pub.precio_venta === null || pub.precio_venta === undefined ? null : Number(pub.precio_venta);
  // Sin SKU escrito, el del producto que ya tiene vinculado.
  const vinculado = pub.sku_maestro_id ? await supabase.from("skus_maestros").select("codigo, codigo_barras").eq("id", pub.sku_maestro_id as string).maybeSingle() : null;
  const producto = vinculado?.data ? { codigo: String(vinculado.data.codigo ?? ""), codigoBarras: (vinculado.data.codigo_barras as string | null) ?? null } : null;
  const datos = await leerDatosDropi(f, supabase, { nombre: String(pub.nombre ?? ""), precio, publicacionId: id, producto });
  if ("error" in datos) return datos;
  // Un borrador se guarda aunque falten datos; si ya está pendiente para Dropi tiene que seguir completo (lo pendiente toma estos datos).
  const pendiente = await supabase.from("dropi_cambios_pendientes").select("id").eq("publicacion_id", id).eq("tipo", "crear").in("estado", ["pendiente", "error"]).limit(1).maybeSingle();
  if (pendiente.data) {
    const falta = faltantesCrearDropi(normalizarDatosCrear({ ...datos, nombre: pub.nombre, precio, precioSugerido: precio }));
    if (falta.length) return { error: `Está pendiente para Dropi y le faltaría: ${falta.join(" ")} Complétalo, o deshaz la publicación pendiente para dejarla como borrador.` };
  }
  const { error } = await supabase.from("dropi_publicaciones").update({ datos_dropi: datos, descripcion: datos.descripcion || null, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudieron guardar los datos." };
  if (pendiente.data) await encolarCrear(supabase, { id, pais_id: pub.pais_id }, normalizarDatosCrear({ ...datos, nombre: pub.nombre, precio, precioSugerido: precio }), { id: usuario.id, nombre: usuario.nombre || usuario.email });
  await registrarAuditoria({ accion: "editar_publicacion_dropi", entidad: "dropi_publicaciones", entidadId: id, detalle: `${pub.nombre}: cambió los datos para Dropi (${datos.fotos.length} fotos, ${datos.bodegas[0]?.unidades ?? 0} unidades)` });
  revalidatePath(RUTA);
  return {};
}

/**
 * «Publicar en Dropi» en la ficha de una publicación «Sin publicar» (después de deshacer una publicación pendiente): vuelve a dejarla pendiente
 * para «Aplicar en Dropi» con el nombre y el precio de la ficha y los datos para Dropi que tiene guardados. Si falta algo de lo que Dropi exige, lo dice.
 */
export async function publicarEnDropi(id: string): Promise<{ error?: string; detalle?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pub = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!pub) return { error: "La publicación ya no existe o no es de tus países." };
  if (pub.estado_publicacion !== "borrador") return { error: "Esta publicación ya está en Dropi." };
  if (pub.estado === "archivado") return { error: "Está archivada: sácala de Archivados antes de publicarla." };
  const precio = pub.precio_venta === null || pub.precio_venta === undefined ? null : Number(pub.precio_venta);
  const supabase = createServiceClient();
  const guardados = normalizarDatosCrear((pub as Record<string, unknown>).datos_dropi);
  // Un borrador de antes del 27 oct 2026 no guardaba el SKU: se toma el del producto vinculado (y va también en la guía de envío).
  if (!guardados.sku && pub.sku_maestro_id) {
    const { data: s } = await supabase.from("skus_maestros").select("codigo, codigo_barras").eq("id", pub.sku_maestro_id as string).maybeSingle();
    if (s?.codigo) {
      guardados.sku = String(s.codigo);
      guardados.nombreGuia ??= guardados.sku.length <= MAX_NOMBRE_DROPI ? guardados.sku : null;
      guardados.codigoBarras ??= (s.codigo_barras as string | null) ?? null;
    }
  }
  const datos = normalizarDatosCrear({ ...guardados, nombre: pub.nombre, precio, precioSugerido: precio });
  const falta = faltantesCrearDropi(datos);
  if (falta.length) return { error: `Faltan datos para Dropi: ${falta.join(" ")}` };
  const r = await encolarCrear(supabase, { id, pais_id: pub.pais_id }, datos, { id: usuario.id, nombre: usuario.nombre || usuario.email });
  if ("error" in r) return { error: r.error };
  if (!r.yaEstaba) await registrarAuditoria({ accion: "dropi_crear_pendiente", entidad: "dropi_publicaciones", entidadId: id, detalle: `${pub.nombre}: pendiente para «Aplicar en Dropi»` });
  revalidatePath(RUTA);
  return { detalle: r.yaEstaba ? "Ya estaba pendiente: pulsa «Aplicar en Dropi» con Dropi abierto." : "Publicación pendiente: pulsa «Aplicar en Dropi» con Dropi abierto." };
}

/**
 * Elimina **para siempre** un borrador (pedido de Jhokser, 24 oct 2026; migración 0152): solo una publicación «Sin publicar» que nunca existió en
 * Dropi y no está pendiente de publicarse (si lo está, primero se deshace). Se va con sus comentarios, su actividad de IA y sus fotos de Storage.
 * Todas las demás siguen sin poder eliminarse (se archivan). Queda una línea en la auditoría.
 */
/**
 * Elimina una publicación para siempre. Un borrador sin publicar lo elimina quien puede modificar el módulo (24 oct 2026); cualquier
 * otra publicación sin ID de Dropi, solo un administrador (27 oct 2026). Con ID de Dropi nunca: se archiva (regla de Hernán).
 */
export async function eliminarPublicacion(id: string): Promise<{ error?: string; detalle?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pub = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!pub) return { error: "La publicación ya no existe o no es de tus países." };
  if (String(pub.dropi_id ?? "").trim()) return { error: "Una publicación con ID de Dropi no se elimina: archívala." };
  const borrador = pub.estado_publicacion === "borrador";
  if (!borrador && !esAdministrador(usuario)) return { error: "Solo un administrador puede eliminar una publicación." };
  const supabase = createServiceClient();
  const pendiente = await supabase.from("dropi_cambios_pendientes").select("id").eq("publicacion_id", id).in("estado", ["pendiente", "error"]).limit(1).maybeSingle();
  if (pendiente.data) return { error: "Tiene un cambio pendiente para Dropi: deshazlo en la lista de cambios pendientes antes de eliminarla." };
  // Las fotos que subió el borrador y las de la carpeta de la publicación (nada más: nunca se borra un archivo de otra parte).
  const datos = normalizarDatosCrear(pub.datos_dropi);
  const archivos = datos.fotos.map((x) => x.url.split(`/object/public/${BUCKET}/`)[1]).filter((r): r is string => !!r && RUTA_FOTO_BORRADOR.test(r));
  for (const carpeta of [`publicaciones/${id}`, `publicaciones/${id}/ia`, `publicaciones/${id}/dropi`]) {
    const { data: lista } = await supabase.storage.from(BUCKET).list(carpeta, { limit: 500 });
    for (const x of lista ?? []) if (x.name && x.id) archivos.push(`${carpeta}/${x.name}`);
  }
  await registrarAuditoria({
    accion: borrador ? "eliminar_borrador_dropi" : "eliminar_publicacion_dropi",
    entidad: "dropi_publicaciones",
    entidadId: id,
    detalle: `${numeroPublicacion(pub.numero as number | null)} ${pub.nombre}: eliminada para siempre`,
  });
  const { error } = await supabase.from("dropi_publicaciones").delete().eq("id", id);
  if (error) return { error: /no se eliminan/i.test(error.message) ? "Falta correr en Supabase la migración 0159." : "No se pudo eliminar la publicación." };
  // Las demás publicaciones dejan de enlazarla.
  const { data: enlazadas } = await supabase.from("dropi_publicaciones").select("id, relacionados").contains("relacionados", [id]);
  for (const o of enlazadas ?? []) {
    await supabase.from("dropi_publicaciones").update({ relacionados: ((o.relacionados as string[]) ?? []).filter((x) => x !== id) }).eq("id", o.id);
  }
  // Una foto que otra publicación copió (`foto_url`) se queda.
  const { data: usadas } = await supabase.from("dropi_publicaciones").select("foto_url").like("foto_url", `%/publicaciones/${id}/%`);
  const enUso = new Set((usadas ?? []).map((u) => String(u.foto_url).split(`/object/public/${BUCKET}/`)[1]));
  const borrar = archivos.filter((r) => !enUso.has(r));
  if (borrar.length) await supabase.storage.from(BUCKET).remove(borrar);
  revalidatePath(RUTA);
  return { detalle: borrador ? "Borrador eliminado" : "Publicación eliminada" };
}

/** La actividad de una publicación para su ficha. Es una lectura: basta poder abrir el módulo. */
export async function obtenerHistorialPublicacion(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  const usuario = await requireModulo(MODULO);
  if (!(await publicacionPermitida(id, usuario.paisesPermitidos))) return { error: "Publicación no válida." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "dropi_publicaciones")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}

/**
 * Vincula la publicación con un producto de Producto (o quita el vínculo, con `null`). Queda en la actividad. Devuelve el error
 * como valor.
 */
export async function vincularSkuPublicacion(id: string, skuId: string | null): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  const supabase = createServiceClient();
  let nuevo: { codigo: string; nombre: string } | null = null;
  if (skuId !== null) {
    if (!UUID.test(skuId)) return { error: "Producto no válido." };
    const { data } = await supabase.from("skus_maestros").select("codigo, nombre").eq("id", skuId).maybeSingle();
    if (!data) return { error: "Ese producto ya no existe en Producto." };
    nuevo = data;
  }
  if ((antes.sku_maestro_id ?? null) === skuId) return {};
  let previo = "Sin vincular";
  if (antes.sku_maestro_id) {
    const { data } = await supabase.from("skus_maestros").select("codigo, nombre").eq("id", antes.sku_maestro_id as string).maybeSingle();
    if (data) previo = `${data.codigo} · ${data.nombre}`;
  }
  const { error } = await supabase.from("dropi_publicaciones").update({ sku_maestro_id: skuId, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo guardar el vínculo." };
  await registrarAuditoria({
    accion: skuId ? "vincular_sku_publicacion" : "desvincular_sku_publicacion",
    entidad: "dropi_publicaciones",
    entidadId: id,
    antes: { Producto: previo },
    despues: { Producto: nuevo ? `${nuevo.codigo} · ${nuevo.nombre}` : "Sin vincular" },
  });
  revalidatePath(RUTA);
  return {};
}

/**
 * Archiva una publicación o la saca de Archivados. **Ninguna publicación se elimina** (regla de Hernán, 23 oct 2026: ni en Dropi ni
 * en el sistema, todo se archiva; la base lo impide con la migración 0140). Archivar marca el estado y el estado de publicación como
 * «archivado»; sacarla los devuelve a «Al día» (si Dropi la reporta, «En Dropi» y Archivados siguen lo que diga Dropi). Queda en la
 * actividad con antes y después.
 *
 * Desde el 24 oct 2026 (migración 0151) lo mismo queda **pendiente para Dropi**: el sistema cambia al instante y la cola de «Aplicar en
 * Dropi» archiva (o saca de Archivados) el producto allá, solo eso (apagar, que además saca el stock, es otro botón). Se puede deshacer
 * desde la lista de cambios pendientes. Una publicación sin ID de Dropi, o que aún no se publica, solo cambia en el sistema.
 */
export async function archivarPublicacion(id: string, archivar: boolean): Promise<{ error?: string; detalle?: string }> {
  return archivarOPausar(id, archivar === true, false);
}

/**
 * «Pausar por falta de stock» (pedido de Alcides, 27 oct 2026; migración 0165): una publicación sin stock no se archiva, pero se pausa. En
 * Dropi es lo mismo que «Archivar» (pendiente para «Aplicar en Dropi», para que la competencia no vea que se agotó); en el sistema queda en
 * Archivados con `pausada_en`, y la tarjeta «Pausadas sin stock» la sigue mostrando, con aviso cuando Dropi le vuelve a ver unidades. Se
 * reactiva con «Sacar de Archivados».
 */
export async function pausarPublicacion(id: string): Promise<{ error?: string; detalle?: string }> {
  return archivarOPausar(id, true, true);
}

async function archivarOPausar(id: string, archivar: boolean, pausar: boolean): Promise<{ error?: string; detalle?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  // Una duplicada (migración 0147) se queda en Archivados: la que vale es la otra.
  if (!archivar && antes.duplicada_de) return { error: "Es un duplicado de otra publicación con el mismo ID de Dropi: usa esa." };
  const supabase = createServiceClient();
  // Una publicación que está por publicarse en Dropi no se archiva hasta deshacer esa publicación (o aplicarla).
  const { data: porPublicar } = await supabase.from("dropi_cambios_pendientes").select("id").eq("publicacion_id", id).eq("tipo", "crear").in("estado", ["pendiente", "error"]).limit(1).maybeSingle();
  if (porPublicar) return { error: "Está pendiente de publicar en Dropi: deshaz esa publicación (o aplícala) antes de archivarla." };
  const por = { id: usuario.id, nombre: usuario.nombre || usuario.email };
  const estadoAntes = { estado: (antes.estado as string | null) ?? null, estado_publicacion: (antes.estado_publicacion as string | null) ?? null };
  // Una «Sin publicar» se archiva sin dejar de ser un borrador (al sacarla de Archivados vuelve a estar sin publicar, no «Activa»).
  const esBorrador = antes.estado_publicacion === "borrador";
  if (pausar) {
    // Se pausa solo lo que ya está en Dropi y se quedó sin stock; con stock, es «Archivar».
    if (esBorrador || !String(antes.dropi_id ?? "").trim()) return { error: "Solo se pausa una publicación que ya está en Dropi." };
    if (antes.estado === "archivado" || antes.estado_publicacion === "archivado") return { error: "Ya está en Archivados." };
    if (!(await sinStockEnDropi(antes.pais_id, (antes.dropi_id as string | null) ?? null))) return { error: MOTIVO_CON_STOCK };
    const marca = await supabase.from("dropi_publicaciones").update({ pausada_en: new Date().toISOString() }).eq("id", id);
    if (marca.error) return { error: "Falta correr en Supabase la migración 0165." };
  } else if (archivar && !esBorrador && (await sinStockEnDropi(antes.pais_id, (antes.dropi_id as string | null) ?? null))) {
    // Sin stock en Dropi no se archiva (pedido de Hernán, 27 oct 2026): se pausa. Sacar de Archivados siempre se puede.
    return { error: MOTIVO_SIN_STOCK };
  }
  const estabaPausada = !!antes.pausada_en;
  let cambios: Record<string, string | null> = archivar
    ? esBorrador
      ? { estado: "archivado" }
      : { estado: "archivado", estado_publicacion: "archivado" }
    : { estado: "al_dia", estado_publicacion: !antes.estado_publicacion || antes.estado_publicacion === "archivado" ? "activo" : (antes.estado_publicacion as string) };
  // En Dropi: solo si ya existe allá. Si había el cambio contrario esperando, se cancelan entre sí (Dropi nunca se tocó) y la publicación
  // queda exactamente como estaba antes de pedir el primero.
  let detalle: string | undefined;
  const dropi = (antes.dropi_id as string | null) ?? null;
  if (dropi && idsDeDropi(dropi).length > 0 && antes.estado_publicacion !== "borrador") {
    const r = await encolarArchivar(supabase, { id, pais_id: antes.pais_id, dropi_id: dropi }, { restaurar: !archivar }, estadoAntes, por);
    if ("error" in r) return { error: r.error };
    if ("cancelo" in r) {
      cambios = { estado: r.cancelo.estado ?? (archivar ? "archivado" : "al_dia"), estado_publicacion: r.cancelo.estado_publicacion ?? (archivar ? "archivado" : "activo") };
      detalle = "Se canceló el cambio que esperaba para Dropi: Dropi no se tocó.";
    } else {
      detalle = `${pausar ? "Pausar (archivar en Dropi)" : archivar ? "Archivar" : estabaPausada ? "Reactivar (sacar de Archivados)" : "Sacar de Archivados"} queda pendiente en Dropi: pulsa «Aplicar en Dropi» con Dropi abierto.`;
      if (!r.yaEstaba)
        await registrarAuditoria({ accion: archivar ? "dropi_archivar_pendiente" : "dropi_restaurar_pendiente", entidad: "dropi_publicaciones", entidadId: id, detalle: `${antes.nombre} · ID Dropi ${dropi}: pendiente para «Aplicar en Dropi»` });
    }
  }
  const { error } = await supabase.from("dropi_publicaciones").update({ ...cambios, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: pausar ? "No se pudo pausar la publicación." : archivar ? "No se pudo archivar la publicación." : "No se pudo sacar de Archivados." };
  // Pausada es «con `pausada_en` y en Archivados»: al sacarla deja de contar sola (y si se deshace, vuelve a contar). Archivarla del todo
  // le quita la marca.
  if (archivar && !pausar && estabaPausada) await supabase.from("dropi_publicaciones").update({ pausada_en: null }).eq("id", id);
  await registrarAuditoria({
    accion: pausar ? "pausar_publicacion_dropi" : archivar ? "archivar_publicacion_dropi" : estabaPausada ? "reactivar_publicacion_dropi" : "desarchivar_publicacion_dropi",
    entidad: "dropi_publicaciones",
    entidadId: id,
    detalle: `${antes.nombre}${antes.dropi_id ? ` · ID Dropi ${antes.dropi_id}` : ""}`,
  });
  revalidatePath(RUTA);
  return { detalle };
}

/**
 * «Apagar en Dropi» en la ficha (pedido de Hernán, 23 oct 2026; migración 0148): deja pendiente que «Aplicar en Dropi» saque todo el
 * stock del producto en Dropi y lo archive; si es un producto privado, también le quita la privatización. De una publicación pública,
 * la persona elige cuáles del mismo producto (sus privadas «P-MA …», o el público si parte de una privada) se apagan con ella (`otrasIds`). Nada se apaga solo, y el sistema archiva la
 * publicación cuando Dropi confirma que quedó archivada (si Dropi no deja por órdenes pendientes, sigue pendiente y se reintenta).
 */
export async function apagarPublicacion(id: string, otrasIds: string[]): Promise<{ error?: string; detalle?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  if (!Array.isArray(otrasIds) || otrasIds.length > 50 || !otrasIds.every((x) => typeof x === "string" && UUID.test(x))) return { error: "Las publicaciones elegidas no son válidas." };
  const supabase = createServiceClient();
  const { data: delPais } = await supabase.from("dropi_publicaciones").select("id, nombre, tipo_publicacion, dropi_id, estado, estado_publicacion, pais_id").eq("pais_id", antes.pais_id);
  const todas = (delPais ?? []).map((x) => ({ id: x.id as string, nombre: x.nombre as string, tipo: (x.tipo_publicacion as "publico" | "privado" | null) ?? null, dropiId: String(x.dropi_id ?? ""), archivada: x.estado === "archivado" || x.estado_publicacion === "archivado" }));
  const yo = todas.find((x) => x.id === id);
  if (!yo) return { error: "La publicación ya no existe." };
  // Solo las del mismo producto (el navegador no decide a qué IDs de Dropi se toca).
  const validas = new Set(grupoDe(yo, todas).map((x) => x.id));
  const elegidas = [...new Set(otrasIds)].filter((x) => validas.has(x));
  const por = { id: usuario.id, nombre: usuario.nombre || usuario.email };
  const objetivos = [{ id, nombre: antes.nombre, dropi_id: (antes.dropi_id as string | null) ?? null, pais_id: antes.pais_id, quitar: yo.tipo === "privado" }, ...elegidas.map((x) => {
    const f = (delPais ?? []).find((y) => y.id === x)!;
    // Una privada pierde también su privatización; un público solo el stock.
    return { id: x, nombre: f.nombre as string, dropi_id: (f.dropi_id as string | null) ?? null, pais_id: f.pais_id as string, quitar: f.tipo_publicacion === "privado" };
  })];
  let pendientes = 0;
  const sinId: string[] = [];
  for (const o of objetivos) {
    const r = await encolarApagar(supabase, { id: o.id, pais_id: o.pais_id, dropi_id: o.dropi_id }, { quitarPrivados: o.quitar }, por);
    if ("error" in r) {
      if (o.id === id) return { error: r.error };
      sinId.push(o.nombre);
      continue;
    }
    pendientes++;
    if (!r.yaEstaba) await registrarAuditoria({ accion: "dropi_apagar_pendiente", entidad: "dropi_publicaciones", entidadId: o.id, detalle: `${o.nombre} · ID Dropi ${o.dropi_id}: pendiente para «Aplicar en Dropi» (sacar el stock${o.quitar ? ", quitar la privatización" : ""} y archivar)` });
  }
  revalidatePath(RUTA);
  return { detalle: `${pendientes === 1 ? "Apagado pendiente" : `${pendientes} apagados pendientes`}: pulsa «Aplicar en Dropi» con Dropi abierto.${sinId.length ? ` Sin ID de Dropi: ${sinId.join(", ")}.` : ""}` };
}

/**
 * «Deshacer apagado» (pedido de Hernán, 23 oct 2026): quita de la cola de «Aplicar en Dropi» los apagados que todavía **no** se aplicaron en
 * Dropi, por si hubo un error o se cambió de opinión. En el sistema vuelven a verse como antes (el apagado pendiente es lo que las mostraba
 * apagadas; nada más se había movido). Solo los que Dropi no ha tocado (ningún intento): uno que ya sacó el stock en Dropi a medias no se
 * deshace desde aquí, porque Dropi ya cambió. Se puede pedir de una publicación y de las demás de su producto (`otrasIds`).
 */
export async function deshacerApagado(id: string, otrasIds: string[]): Promise<{ error?: string; detalle?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  if (!Array.isArray(otrasIds) || otrasIds.length > 50 || !otrasIds.every((x) => typeof x === "string" && UUID.test(x))) return { error: "Las publicaciones elegidas no son válidas." };
  const supabase = createServiceClient();
  const { data: delPais } = await supabase.from("dropi_publicaciones").select("id, nombre, tipo_publicacion, dropi_id").eq("pais_id", antes.pais_id);
  const todas = (delPais ?? []).map((x) => ({ id: x.id as string, nombre: x.nombre as string, tipo: (x.tipo_publicacion as "publico" | "privado" | null) ?? null, dropiId: String(x.dropi_id ?? ""), archivada: false }));
  const yo = todas.find((x) => x.id === id);
  if (!yo) return { error: "La publicación ya no existe." };
  // Solo ella y las del mismo producto (el navegador no decide a qué publicaciones se toca).
  const validas = new Set([id, ...grupoDe(yo, todas).map((x) => x.id)]);
  const objetivos = [...new Set([id, ...otrasIds])].filter((x) => validas.has(x));
  const { data: filas, error } = await supabase
    .from("dropi_cambios_pendientes")
    .select("id, publicacion_id, intentos, dropi_producto_id")
    .eq("tipo", "apagar")
    .in("estado", ["pendiente", "error"])
    .in("publicacion_id", objetivos);
  if (error) return { error: "No se pudo leer lo que está pendiente." };
  const deshacibles = (filas ?? []).filter((f) => Number(f.intentos) === 0);
  const tocadas = (filas ?? []).length - deshacibles.length;
  if (deshacibles.length === 0) {
    return { error: tocadas > 0 ? "Ese apagado ya se intentó en Dropi (el stock puede estar en cero): no se puede deshacer desde aquí." : "No hay un apagado pendiente que deshacer." };
  }
  const { error: errorCancelar } = await supabase
    .from("dropi_cambios_pendientes")
    .update({ estado: "reemplazado" })
    .in("id", deshacibles.map((f) => f.id as string))
    .eq("estado", "pendiente")
    .eq("intentos", 0);
  if (errorCancelar) return { error: "No se pudo deshacer el apagado." };
  for (const f of deshacibles) {
    const nombre = todas.find((x) => x.id === f.publicacion_id)?.nombre ?? "";
    await registrarAuditoria({ accion: "dropi_apagar_cancelado", entidad: "dropi_publicaciones", entidadId: f.publicacion_id as string, detalle: `${nombre} · ID Dropi ${f.dropi_producto_id}: apagado deshecho antes de aplicarse en Dropi` });
  }
  revalidatePath(RUTA);
  return { detalle: `${deshacibles.length === 1 ? "Apagado deshecho" : `${deshacibles.length} apagados deshechos`}: Dropi no se tocó.${tocadas > 0 ? ` ${tocadas === 1 ? "Uno ya se había intentado en Dropi y no se pudo deshacer." : `${tocadas} ya se habían intentado en Dropi y no se pudieron deshacer.`}` : ""}` };
}

/** Privada si así está anotada o si Dropi la reporta privada en la última lectura de «Mis productos» (sin anotar). */
async function esPrivada(p: { pais_id: string; dropi_id?: unknown; tipo_publicacion?: unknown }): Promise<boolean> {
  if (p.tipo_publicacion === "privado") return true;
  if (p.tipo_publicacion === "publico") return false;
  const ids = String(p.dropi_id ?? "").split(/[^0-9]+/).filter(Boolean).map(Number);
  if (!ids.length) return false;
  const { data } = await createServiceClient().from("dropi_productos_proveedor").select("privado").eq("pais_id", p.pais_id).in("dropi_producto_id", ids);
  return !!data?.length && data.every((d) => d.privado === true);
}

/**
 * «Republicar» en la ficha (pedido de Hernán, 23 oct 2026; migración 0145): nada se republica solo. Deja la republicación en la cola
 * de «Aplicar en Dropi», que crea el producto de nuevo en Dropi (datos, fotos y stock), le saca el stock al viejo y lo archiva; al
 * terminar, el sistema crea la publicación nueva y archiva esta (`guardarResultadosDropi`).
 */
export async function republicarPublicacion(id: string, precio: number): Promise<{ error?: string; detalle?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  // El precio del producto nuevo se elige al republicar (27 oct 2026: el 11446 salió con el precio viejo porque nadie lo cambió).
  if (typeof precio !== "number" || !Number.isFinite(precio) || precio <= 0 || precio >= 100_000) return { error: "Pon el precio de venta del producto nuevo." };
  const precioNuevo = Math.round(precio * 100) / 100;
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  if (antes.estado === "archivado" || antes.estado_publicacion === "archivado") return { error: "Está archivada: sácala de Archivados antes de republicarla." };
  if (await esPrivada(antes)) return { error: "Es una publicación privada: las privadas no se republican." };
  const precioAntes = antes.precio_venta === null || antes.precio_venta === undefined ? null : Number(antes.precio_venta);
  const r = await encolarRepublicar(
    createServiceClient(),
    { id, pais_id: antes.pais_id, dropi_id: (antes.dropi_id as string | null) ?? null },
    { id: usuario.id, nombre: usuario.nombre || usuario.email },
    { precio: precioNuevo, precioAntes },
  );
  if ("error" in r) return { error: r.error };
  const cambioPrecio = precioAntes === null || Math.abs(precioAntes - precioNuevo) > 0.004 ? `, con precio $${precioNuevo.toFixed(2)}${precioAntes !== null ? ` (antes $${precioAntes.toFixed(2)})` : ""}` : `, con el mismo precio $${precioNuevo.toFixed(2)}`;
  await registrarAuditoria({ accion: "dropi_republicar_pendiente", entidad: "dropi_publicaciones", entidadId: id, detalle: `${antes.nombre} · ID Dropi ${antes.dropi_id}: pendiente para «Aplicar en Dropi»${cambioPrecio}` });
  revalidatePath(RUTA);
  return { detalle: r.yaEstaba ? "Ya estaba pendiente: pulsa «Aplicar en Dropi» con Dropi abierto." : "Republicación pendiente: pulsa «Aplicar en Dropi» con Dropi abierto." };
}

/**
 * «Privatizar en Dropi» en la ficha (pedido de Jhokser, 26 oct 2026; migración 0155): deja pendiente que «Aplicar en Dropi» le deje un producto
 * a un solo dropshipper. En Dropi crea un producto privado nuevo («P-XX …», copia del público), le asigna el correo en «Productos privados» con
 * las unidades que se le reservan y se las saca al público. Cuando Dropi lo confirma, el sistema crea la publicación privada (`guardarResultadosDropi`).
 * El nombre del privado, el público de origen y la bodega se vuelven a calcular y comprobar aquí: el navegador no decide a qué producto se toca.
 */
export async function privatizarPublicacion(id: string, crudo: unknown): Promise<{ error?: string; detalle?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const antes = await publicacionPermitida(id, usuario.paisesPermitidos);
  if (!antes) return { error: "La publicación ya no existe o no es de tus países." };
  if (antes.estado === "archivado" || antes.estado_publicacion === "archivado") return { error: "Está archivada: sácala de Archivados antes de privatizarla." };
  if (antes.estado_publicacion === "borrador") return { error: "Todavía no está publicada en Dropi: publícala antes de privatizarla." };
  if (antes.duplicada_de) return { error: "Es una duplicada: se privatiza la publicación que vale." };
  if (await esPrivada(antes)) return { error: "Es una publicación privada: se privatiza la pública." };
  const ids = idsDeDropi((antes.dropi_id as string | null) ?? null);
  if (!ids.length) return { error: "La publicación no tiene ID de Dropi." };
  const supabase = createServiceClient();
  const pedido = normalizarDatosPrivatizar({ ...(typeof crudo === "object" && crudo !== null ? crudo : {}), origen: id, salida: false });
  const d = { ...pedido, nombre: pedido.iniciales ? nombrePrivado(pedido.iniciales, antes.nombre) : "" };
  // El stock que Dropi mostró en la última lectura de «Mis productos», en la bodega elegida (la comprobación de verdad la hace el favorito en Dropi).
  const { data: lectura } = await supabase.from("dropi_productos_proveedor").select("bodegas").eq("pais_id", antes.pais_id).eq("dropi_producto_id", ids[0]).maybeSingle();
  const bodegas = Array.isArray(lectura?.bodegas) ? (lectura!.bodegas as { id: number; stock: number }[]) : null;
  if (bodegas && !bodegas.some((b) => Number(b.id) === d.bodega)) return { error: "Esa bodega no tiene stock de este producto en Dropi." };
  if (d.bodega === BODEGA_DROPI) return { error: "El stock de la bodega de Dropi (B280) no se mueve desde aquí." };
  const disponible = bodegas ? Number(bodegas.find((b) => Number(b.id) === d.bodega)?.stock ?? 0) : null;
  const faltan = faltantesPrivatizar(d, disponible);
  if (faltan.length) return { error: faltan[0] };
  // Un dropshipper no recibe dos veces el mismo producto: si ya tiene su privada (sin archivar), se avisa.
  const { data: privadas } = await supabase.from("dropi_publicaciones").select("id, numero, nombre, privatizado_email, estado, estado_publicacion").eq("pais_id", antes.pais_id).not("privatizado_email", "is", null).limit(5000);
  const base = nombreDelPublico(antes.nombre);
  const ya = (privadas ?? []).find(
    (x) => String(x.privatizado_email ?? "").toLowerCase() === d.correo && nombreDelPublico(String(x.nombre ?? "")) === base && x.estado !== "archivado" && x.estado_publicacion !== "archivado",
  );
  if (ya) return { error: `${d.correo} ya tiene este producto privado: ${numeroPublicacion(ya.numero as number | null)} (${ya.nombre}).` };
  const r = await encolarPrivatizar(supabase, { id, pais_id: antes.pais_id, dropi_id: (antes.dropi_id as string | null) ?? null }, d, { id: usuario.id, nombre: usuario.nombre || usuario.email });
  if ("error" in r) return { error: r.error };
  if (!r.yaEstaba)
    await registrarAuditoria({
      accion: "dropi_privatizar_pendiente",
      entidad: "dropi_publicaciones",
      entidadId: id,
      detalle: `${antes.nombre} · ID Dropi ${antes.dropi_id}: privatizar ${d.unidades} u. a ${d.dropshipper} (${d.correo}) como «${d.nombre}» · pendiente para «Aplicar en Dropi»`,
    });
  revalidatePath(RUTA);
  return { detalle: r.yaEstaba ? "Ya estaba pendiente para ese correo: pulsa «Aplicar en Dropi» con Dropi abierto." : "Privatización pendiente: pulsa «Aplicar en Dropi» con Dropi abierto." };
}

/**
 * Dropshippers del CRM para llenar la privatización (nombre y correo) al escribir parte de su nombre, tienda o correo. Solo los que venden en el país
 * de la publicación y solo para quien puede abrir el CRM (los correos de los dropshippers son de ese módulo).
 */
export async function buscarDropshippersParaPrivatizar(publicacionId: string, consulta: string): Promise<{ resultados: { id: string; nombre: string; correo: string; tienda: string }[] }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!usuario.modulos.includes("crm-dropshippers")) return { resultados: [] };
  const pub = await publicacionPermitida(publicacionId, usuario.paisesPermitidos);
  if (!pub) return { resultados: [] };
  // Nada de comodines ni signos del filtro: solo letras, números, espacios, @, punto y guion.
  const t = String(consulta ?? "").normalize("NFC").replace(/[^\p{L}\p{N}@. -]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (t.length < 2) return { resultados: [] };
  const supabase = createServiceClient();
  const leer = (columna: string) =>
    supabase.from("dropshippers").select("id, nombre, contacto_email, tienda, dropshipper_paises!inner(pais_id)").eq("dropshipper_paises.pais_id", pub.pais_id).ilike(columna, `%${t}%`).limit(8);
  const [porNombre, porCorreo, porTienda] = await Promise.all([leer("nombre"), leer("contacto_email"), leer("tienda")]);
  const vistos = new Map<string, { id: string; nombre: string; correo: string; tienda: string }>();
  for (const f of [...(porNombre.data ?? []), ...(porCorreo.data ?? []), ...(porTienda.data ?? [])] as Record<string, unknown>[])
    if (!vistos.has(f.id as string)) vistos.set(f.id as string, { id: f.id as string, nombre: String(f.nombre ?? ""), correo: String(f.contacto_email ?? ""), tienda: String(f.tienda ?? "") });
  return { resultados: [...vistos.values()].slice(0, 8) };
}
