"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria, registrarAuditoriaLote } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura, getUsuarioActual } from "@/lib/auth";
import { EMOJIS_REACCION } from "@/lib/compras/reacciones";
import { detectarAdjunto, MAX_ADJUNTOS_COMENTARIO, MAX_BYTES_ADJUNTO, nombreSeguro } from "@/lib/compras/adjuntos";
import { cierreAlCambiarEtapa, combinarLista, MAX_COMPRAS_LOTE, type ModoLote } from "@/lib/compras/lote";
import { mencionadosValidos, notificarMenciones } from "@/lib/menciones";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { estimarPlanificacion, nuevaPlanificacion, tiemposDeTransito, type Estimacion, type TiemposTransito } from "@/lib/compras/planificacion";
import { descargarPublico } from "@/lib/seguridad/url-externa";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { ESTADOS_COMPRA, ETAPAS_COMPRA, VIAS_ENVIO } from "./def-compras";
import { CAMPOS_EDITABLES, campoEditable, normalizarValor, textoDeValor, type ValorCampo } from "./def-edicion-compras";

const ETAPAS_VALIDAS: Set<string> = new Set(ETAPAS_COMPRA.map((e) => e.valor));
const ESTADOS_VALIDOS: Set<string> = new Set(ESTADOS_COMPRA.map((e) => e.valor));
const VIAS_VALIDAS: Set<string> = new Set(VIAS_ENVIO.map((v) => v.valor));
const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

// --- Países permitidos (migración 0087) -----------------------------------------------------------------------------
// Quien tiene países limitados solo ve y cambia las compras de esos países (y las de Importadora si la tiene). La lista
// ya llega filtrada (`cargarCompras`), pero cada acción lo vuelve a comprobar: el servidor no se fía de lo que pide la página.
const SIN_ACCESO_PAIS = "No tienes acceso a las compras de ese país.";
type CompraPais = { id: string; tipo: string; paises: { codigo: string } | { codigo: string }[] | null };
const codigoDe = (c: CompraPais) => (c.tipo === "importacion" ? null : ((Array.isArray(c.paises) ? c.paises[0] : c.paises)?.codigo ?? null));

/** El error si la persona no puede ver alguna de esas compras por su país; null si puede (o no tiene países limitados). */
async function sinAccesoACompras(ids: string[]): Promise<string | null> {
  const permitidos = (await getUsuarioActual())?.paisesPermitidos ?? null;
  if (permitidos === null || ids.length === 0) return null;
  const { data } = await createServiceClient().from("wms_compras").select("id, tipo, paises(codigo)").in("id", ids);
  const filas = (data ?? []) as unknown as CompraPais[];
  if (filas.length !== new Set(ids).size) return "Compra no válida.";
  return filas.every((c) => puedeVerPais(permitidos, codigoDe(c))) ? null : SIN_ACCESO_PAIS;
}
/** Lo mismo, para una línea de producto de una compra. */
async function sinAccesoALinea(itemId: string): Promise<string | null> {
  if ((await getUsuarioActual())?.paisesPermitidos == null) return null;
  const { data } = await createServiceClient().from("wms_compra_items").select("compra_id").eq("id", itemId).maybeSingle();
  return data ? sinAccesoACompras([data.compra_id as string]) : "Producto no válido.";
}

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

/**
 * La foto real de una compra desde una imagen de internet (arrastrada a la ficha): el servidor la descarga —solo de sitios
 * públicos, hasta 5 MB y revisando que sea de verdad una imagen— y la sube como `prepararSubidaFotoCompra`. Devuelve su ruta.
 */
export async function subirFotoCompraDesdeUrl(direccion: string): Promise<{ ruta: string } | { error: string }> {
  await requireModuloEscritura("compras");
  const descarga = await descargarPublico(String(direccion ?? "").trim(), 5 * 1024 * 1024);
  if ("error" in descarga) return descarga;
  const imagen = detectarImagen(descarga.bytes.slice(0, 64));
  if (!imagen) return { error: "Eso no es una imagen JPG, PNG, WebP o GIF." };
  const ruta = `compras/${crypto.randomUUID()}/${Date.now()}-web.${imagen.extension}`;
  const { error } = await createServiceClient().storage.from(BUCKET_FOTOS).upload(ruta, descarga.bytes, { contentType: imagen.tipo });
  if (error) return { error: "No se pudo guardar la imagen." };
  return { ruta };
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
    agente_envio: textoOptativo(formData, "agente_envio"),
    venta_importacion: formData.get("venta_importacion") === "si",
    tiendas: listaDeTexto(textoOptativo(formData, "tiendas")),
    qty_total: numeroOptativo(formData, "qty_total"),
    monto_total: numeroOptativo(formData, "monto_total"),
    primer_pago: numeroOptativo(formData, "primer_pago"),
    segundo_pago: numeroOptativo(formData, "segundo_pago"),
    pagado_a_proveedor: numeroOptativo(formData, "pagado_a_proveedor"),
    factura: formData.get("factura") === "on",
    financiamiento: formData.get("financiamiento") === "on",
    fecha_limite: fechaOptativa(formData, "fecha_limite"),
    fecha_llegada: fechaOptativa(formData, "fecha_llegada"),
    fecha_pago_1: fechaOptativa(formData, "fecha_pago_1"),
    fecha_pago_2: fechaOptativa(formData, "fecha_pago_2"),
    fecha_envio: fechaOptativa(formData, "fecha_envio"),
    // Una sola vía de envío (se guarda como lista por las compras de antes que llevaban dos).
    via_envio: formData.getAll("via_envio").map(String).filter((v) => VIAS_VALIDAS.has(v)).slice(0, 1),
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
  const permitidos = (await getUsuarioActual())?.paisesPermitidos ?? null;
  if (tipo === "importacion") {
    if (!puedeVerPais(permitidos, null)) return { error: SIN_ACCESO_PAIS };
    return { tipo, pais_id: null, paises_destino: listaDeTexto(textoOptativo(formData, "paises_destino")) };
  }
  const codigo = String(formData.get("pais") ?? "");
  if (!codigo) return { error: "Elige el país de la compra." };
  if (!puedeVerPais(permitidos, codigo)) return { error: SIN_ACCESO_PAIS };
  const { data } = await createServiceClient().from("paises").select("id").eq("codigo", codigo).maybeSingle();
  if (!data) return { error: "País no válido." };
  return { tipo, pais_id: data.id as string, paises_destino: [] };
}

// --- Planificación automática (`src/lib/compras/planificacion.ts`) ---------------------------------------------------
// No se escribe: es el mes de la llegada estimada (fecha de envío + lo que tardaron los envíos anteriores de su país por su
// vía). Se calcula al crear la compra y cada vez que cambia su fecha de envío, su vía, su país o su tipo.

/** De qué país es una compra para medir sus envíos: su país, o Importadora. */
const claveTransito = (tipo: string, paisId: string | null) => (tipo === "importacion" ? "importacion" : (paisId ?? ""));

/** Lo que tardaron los envíos que ya llegaron (fecha de envío → fecha de llegada), por país y vía. */
async function cargarTiempos(): Promise<TiemposTransito> {
  const filas = await traerTodasLasFilas<{ tipo: string; pais_id: string | null; via_envio: string[] | null; fecha_envio: string; fecha_llegada: string }>((desde, hasta) =>
    createServiceClient()
      .from("wms_compras")
      .select("tipo, pais_id, via_envio, fecha_envio, fecha_llegada")
      .not("fecha_envio", "is", null)
      .not("fecha_llegada", "is", null)
      .order("id")
      .range(desde, hasta),
  );
  // Una compra que viajó por dos vías no dice cuánto tarda cada una: no se mide.
  return tiemposDeTransito(
    filas
      .filter((f) => (f.via_envio ?? []).length === 1)
      .map((f) => ({ clave: claveTransito(f.tipo, f.pais_id), via: f.via_envio![0], dias: Math.round((Date.parse(f.fecha_llegada) - Date.parse(f.fecha_envio)) / 864e5) })),
  );
}

/** La planificación que tendría una compra con estos datos (para verla en la ficha antes de guardar). */
export async function estimarPlanificacionCompra(tipo: string, pais: string, vias: string[], fechaEnvio: string): Promise<Estimacion | null> {
  await requireModulo("compras");
  let paisId: string | null = null;
  if (tipo !== "importacion") {
    const { data } = await createServiceClient().from("paises").select("id").eq("codigo", String(pais ?? "")).maybeSingle();
    if (!data) return null;
    paisId = data.id as string;
  }
  const validas = (Array.isArray(vias) ? vias : []).map(String).filter((v) => VIAS_VALIDAS.has(v));
  return estimarPlanificacion(await cargarTiempos(), claveTransito(tipo, paisId), validas, /^\d{4}-\d{2}-\d{2}$/.test(String(fechaEnvio)) ? String(fechaEnvio) : null);
}

/** Si el cambio de una celda o de un lote mueve la planificación (la fecha de envío o la vía). */
const MUEVE_PLANIFICACION = new Set(["fechaEnvio", "viaEnvio"]);
type DatosEnvio = { tipo: string; pais_id: string | null; via_envio: string[] | null; fecha_envio: string | null; planificacion: string | null };
/** La planificación de una compra después de cambiarle la fecha de envío o la vía (una celda o un lote). */
function planificacionTrasCambio(tiempos: TiemposTransito, actual: DatosEnvio, columna: string, valor: unknown): string | null {
  const despues = { ...actual, [columna]: valor } as DatosEnvio;
  return nuevaPlanificacion(
    tiempos,
    { fechaEnvio: actual.fecha_envio, planificacion: actual.planificacion },
    { clave: claveTransito(despues.tipo, despues.pais_id), vias: despues.via_envio ?? [], fechaEnvio: despues.fecha_envio },
  );
}

/**
 * El código de una compra nueva: el siguiente del correlativo de su país, o de Importadora («ECOM01-0450»). Sin prefijo
 * configurado para ese país (Configuración › Países) la compra se crea sin código.
 */
async function siguienteCodigo(tipo: string, paisId: string | null): Promise<string | null> {
  const supabase = createServiceClient();
  let clave = "importacion";
  if (tipo === "pais") {
    const { data } = await supabase.from("paises").select("codigo").eq("id", paisId).maybeSingle();
    if (!data) return null;
    clave = data.codigo as string;
  }
  const { data } = await supabase.rpc("wms_siguiente_codigo_compra", { p_clave: clave });
  return (data as string | null) ?? null;
}

/** Un cambio de un dato de una compra para su Actividad: el campo y los valores ya en palabras («—» si no había). */
interface CambioActividad {
  campo: string;
  antes: string | null;
  despues: string | null;
}

/**
 * Anota en la Actividad de una compra cualquier cambio (que no sea etapa ni estado, que van con `anotarEventos`), con quién
 * lo hizo y la hora, como la actividad de ClickUp. Lo usan la ficha, las celdas de la lista y el bloque «Productos».
 */
async function anotarCambios(compraId: string, cambios: CambioActividad[]) {
  const reales = cambios.filter((c) => c.antes !== c.despues);
  if (reales.length === 0) return;
  const usuario = await getUsuarioActual();
  const autor = usuario?.nombre || usuario?.email || null;
  const ahora = Date.now();
  // Varios cambios del mismo guardado llevan milisegundos distintos (la base no repite campo + valor + hora).
  await createServiceClient()
    .from("wms_compra_eventos")
    .insert(reales.map((c, i) => ({ compra_id: compraId, campo: c.campo, valor_antes: c.antes, valor_despues: c.despues, ocurrido_en: new Date(ahora + i).toISOString(), autor, origen: "sistema" })));
}

const dinero = (n: number) => n.toLocaleString("es-PA", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «1.040 u. · $1.270,00» (sin costo, solo las unidades). */
const textoLinea = (cantidad: number, costo: number | null) =>
  `${cantidad.toLocaleString("es-PA")} u.${costo !== null ? ` · ${dinero(Math.round(cantidad * costo * 100) / 100)}` : ""}`;

/** Otros datos de la ficha (fuera de las celdas de la lista) que también quedan en la Actividad. */
const OTROS_CAMPOS: { campo: string; columna: string }[] = [
  { campo: "nombre", columna: "nombre" },
  { campo: "descripcion", columna: "descripcion" },
  { campo: "urlProducto", columna: "url_producto" },
  { campo: "planificacion", columna: "planificacion" },
  { campo: "foto", columna: "foto_url" },
  { campo: "paisesDestino", columna: "paises_destino" },
];
/** Una lista en orden fijo, para que el mismo contenido en otro orden (vías de envío, etiquetas) no cuente como cambio. */
const ordenada = (v: unknown) => (Array.isArray(v) ? [...v].map(String).sort() : v);
const textoSimple = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v));

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
export async function crearCompra(formData: FormData): Promise<{ error?: string; codigo?: string | null; id?: string }> {
  await requireModuloEscritura("compras");
  // El nombre es opcional (venía de ClickUp; una compra con productos se titula por su N.º OC). Sin nombre, toma su código.
  const nombreEscrito = String(formData.get("nombre") ?? "").trim();
  const etapa = (formData.get("etapa") as string) || "solicitud_internacional";
  const estado = (formData.get("estado") as string) || "backlog";

  if (!ETAPAS_VALIDAS.has(etapa)) return { error: "Elige una etapa válida." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };

  const tipoYPais = await leerTipoYPais(formData);
  if ("error" in tipoYPais) return tipoYPais;

  // Los productos que se eligieron al crearla (mismo bloque «Productos» que la ficha). Se revisan todos antes de crear nada.
  let lineas: { sku: string; cantidad: number; costo: number | null }[] = [];
  try {
    const crudo = JSON.parse(String(formData.get("productos") || "[]")) as unknown;
    lineas = Array.isArray(crudo) ? crudo.map((l) => ({ sku: String(l?.sku ?? ""), cantidad: Number(l?.cantidad), costo: l?.costo === null || l?.costo === undefined ? null : Number(l.costo) })) : [];
  } catch {
    return { error: "Los productos de la compra no son válidos." };
  }
  if (lineas.length > 0 && tipoYPais.tipo !== "pais") return { error: "Solo las compras de un país llevan productos del inventario." };
  if (new Set(lineas.map((l) => l.sku)).size !== lineas.length) return { error: "Hay un producto repetido en la compra." };
  for (const l of lineas) {
    if (!ES_ID(l.sku)) return { error: "Hay un producto que no es válido." };
    if (!ES_CANTIDAD(l.cantidad)) return { error: "Las cantidades deben ser números enteros mayores que cero." };
    if (!ES_COSTO(l.costo)) return { error: "Hay un costo unitario que no es válido." };
    const sku = await productoComprable(l.sku);
    if ("error" in sku) return sku;
  }

  const supabase = createServiceClient();
  const codigo = await siguienteCodigo(tipoYPais.tipo, tipoYPais.pais_id);
  const nombre = nombreEscrito || codigo || "Orden de compra";
  const datos = leerCambios(formData);
  const planificacion = datos.fecha_envio
    ? nuevaPlanificacion(await cargarTiempos(), null, { clave: claveTransito(tipoYPais.tipo, tipoYPais.pais_id), vias: datos.via_envio, fechaEnvio: datos.fecha_envio })
    : null;
  const { data, error } = await supabase
    .from("wms_compras")
    .insert({ ...tipoYPais, nombre, etapa, estado, ...datos, planificacion, codigo })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await anotarEventos(data.id, null, { etapa, estado });

  if (lineas.length > 0) {
    const usuario = await getUsuarioActual();
    const agregadas: CambioActividad[] = [];
    for (const l of lineas) {
      const { error: errorLinea } = await supabase.rpc("wms_agregar_item_compra", { p_compra: data.id, p_sku: l.sku, p_cantidad: l.cantidad, p_costo: l.costo, p_lote: null, p_origen: "sistema", p_usuario: usuario?.id ?? null });
      if (errorLinea) return { error: `La compra se creó, pero un producto no se pudo agregar: ${errorLinea.message}` };
      const { data: sku } = await supabase.from("skus_maestros").select("codigo, nombre").eq("id", l.sku).maybeSingle();
      agregadas.push({ campo: "productoAgregado", antes: null, despues: `${sku?.codigo ?? ""} · ${sku?.nombre ?? ""} · ${textoLinea(l.cantidad, l.costo)}` });
    }
    await sincronizarCantidad(data.id);
    await anotarCambios(data.id, agregadas);
  }

  await registrarAuditoria({ accion: "crear_compra", entidad: "wms_compras", entidadId: data.id, detalle: codigo ? `${codigo} · ${nombre}` : nombre });
  revalidatePath("/compras");
  return { codigo, id: data.id as string };
}

/**
 * Lo que tendrá una compra nueva si se crea ahora (para verlo antes de crearla): el código del país (el siguiente de su
 * correlativo, sin gastarlo) y el N.º OC. Si otra persona crea una antes, al crear se usa el siguiente libre.
 */
export async function vistaPreviaCompra(clave: string): Promise<{ codigo: string | null; numero: number }> {
  await requireModulo("compras");
  const supabase = createServiceClient();
  const [correlativo, ultima] = await Promise.all([
    clave ? supabase.from("wms_compras_correlativo").select("prefijo, ultimo").eq("clave", String(clave)).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("wms_compras").select("numero").order("numero", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const c = correlativo.data as { prefijo: string | null; ultimo: number } | null;
  return {
    codigo: c?.prefijo ? `${c.prefijo}-${String(Number(c.ultimo) + 1).padStart(4, "0")}` : null,
    numero: Number((ultima.data as { numero: number } | null)?.numero ?? 0) + 1,
  };
}

/** Edita cualquier dato de una compra ya creada — todo junto, desde su ficha. */
export async function actualizarCompra(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const id = formData.get("id") as string;
  const nombreEscrito = String(formData.get("nombre") ?? "").trim();
  const etapa = formData.get("etapa") as string;
  const estado = formData.get("estado") as string;
  if (typeof id !== "string" || !ES_ID(id)) return { error: "Compra no válida." };
  const sinAcceso = await sinAccesoACompras([id]);
  if (sinAcceso) return { error: sinAcceso };

  if (!ETAPAS_VALIDAS.has(etapa)) return { error: "Elige una etapa válida." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };

  const tipoYPais = await leerTipoYPais(formData);
  if ("error" in tipoYPais) return tipoYPais;

  const supabase = createServiceClient();
  const { data: actualCompleta } = await supabase.from("wms_compras").select("*").eq("id", id).single();
  const actual = actualCompleta as Record<string, unknown> & { foto_url: string | null; etapa: string; estado: string } | null;
  // Sin nombre se conserva el que tenía (el nombre es opcional: el título sale del N.º OC o del código).
  const nombre = nombreEscrito || String(actual?.nombre ?? "") || String(actual?.codigo ?? "") || "Orden de compra";
  const { qty_total, monto_total, ...resto } = leerCambios(formData);
  // Con productos vinculados, la cantidad y el monto los calcula el bloque «Productos»: el formulario no los pisa.
  const { count: lineas } = await supabase.from("wms_compra_items").select("id", { count: "exact", head: true }).eq("compra_id", id);
  const sinPlanificar = (lineas ?? 0) > 0 ? resto : { ...resto, qty_total, monto_total };
  // La planificación se vuelve a calcular solo si cambió lo que la mueve (si no, guardar otro dato la movería sola cada vez
  // que llega un envío nuevo al historial).
  const mueve =
    !actual ||
    (actual.fecha_envio ?? null) !== resto.fecha_envio ||
    JSON.stringify(ordenada(actual.via_envio ?? [])) !== JSON.stringify(ordenada(resto.via_envio)) ||
    actual.tipo !== tipoYPais.tipo ||
    (actual.pais_id ?? null) !== tipoYPais.pais_id;
  const planificacion = mueve
    ? nuevaPlanificacion(
        await cargarTiempos(),
        actual ? { fechaEnvio: (actual.fecha_envio as string | null) ?? null, planificacion: (actual.planificacion as string | null) ?? null } : null,
        { clave: claveTransito(tipoYPais.tipo, tipoYPais.pais_id), vias: resto.via_envio, fechaEnvio: resto.fecha_envio },
      )
    : ((actual?.planificacion as string | null) ?? null);
  const cambios = { ...sinPlanificar, planificacion };
  // Al cerrar (completado o descartado) se sella la fecha de cierre; al reabrir se quita.
  const cierra = etapa === "completado" || etapa === "descartado";
  const cerrado_en = cierra ? (actual && (actual.etapa === "completado" || actual.etapa === "descartado") ? undefined : new Date().toISOString()) : null;
  const { error } = await supabase
    .from("wms_compras")
    .update({ ...tipoYPais, nombre, etapa, estado, ...cambios, ...(cerrado_en !== undefined ? { cerrado_en } : {}), actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  if (actual) {
    await anotarEventos(id, { etapa: actual.etapa, estado: actual.estado }, { etapa, estado });
    // Lo demás que cambió en la ficha, en palabras, para la Actividad.
    const nuevo: Record<string, unknown> = { ...actual, ...tipoYPais, nombre, ...cambios };
    await anotarCambios(id, [
      ...Object.entries(CAMPOS_EDITABLES)
        .filter(([clave]) => clave !== "etapa" && clave !== "estado")
        .map(([clave, def]) => ({ campo: clave, antes: textoDeValor(def, ordenada(actual[def.columna])), despues: textoDeValor(def, ordenada(nuevo[def.columna])) })),
      ...OTROS_CAMPOS.map((c) => ({ campo: c.campo, antes: textoSimple(actual[c.columna]), despues: textoSimple(nuevo[c.columna]) })),
    ]);
  }

  if (actual && actual.foto_url !== cambios.foto_url) await borrarFotoSiEsNuestra(actual.foto_url);

  revalidatePath("/compras");
  return {};
}

/**
 * Cambia **un solo dato** de una compra, desde su celda en la lista (la ficha, en cambio, guarda todo junto). Lo que llega se
 * vuelve a validar aquí con las mismas reglas de la celda (`normalizarValor`). Cambiar la etapa hace lo mismo que en la
 * ficha: sella o quita la fecha de cierre y deja el evento con su hora. No llama a `revalidatePath`: la lista ya muestra el
 * cambio y rearmar toda la página de Compras por cada celda la haría lenta. Devuelve el error como valor.
 */
export async function actualizarCampoCompra(
  id: string,
  campo: string,
  bruto: unknown,
): Promise<{ error?: string; cerradoEn?: string | null; planificacion?: string | null }> {
  await requireModuloEscritura("compras");
  if (typeof id !== "string" || !ES_ID(id)) return { error: "Compra no válida." };
  const def = campoEditable(String(campo));
  if (!def) return { error: "Ese dato no se edita aquí." };
  const normalizado = normalizarValor(def, bruto);
  if ("error" in normalizado) return normalizado;
  const sinAcceso = await sinAccesoACompras([id]);
  if (sinAcceso) return { error: sinAcceso };

  const supabase = createServiceClient();
  const { data } = await supabase.from("wms_compras").select(`${def.columna}, etapa, estado, tipo, pais_id, via_envio, fecha_envio, planificacion`).eq("id", id).maybeSingle();
  const actual = data as unknown as Record<string, unknown> | null;
  if (!actual) return { error: "La compra ya no existe." };

  if (def.soloSinProductos) {
    const { count } = await supabase.from("wms_compra_items").select("id", { count: "exact", head: true }).eq("compra_id", id);
    if ((count ?? 0) > 0) return { error: "Con productos vinculados, esto se calcula de ellos." };
  }

  const cambios: Record<string, unknown> = { [def.columna]: normalizado.valor, actualizado_en: new Date().toISOString() };
  let cerradoEn: string | null | undefined;
  if (campo === "etapa") {
    const cierra = normalizado.valor === "completado" || normalizado.valor === "descartado";
    const yaCerrada = actual.etapa === "completado" || actual.etapa === "descartado";
    cerradoEn = cierra ? (yaCerrada ? undefined : new Date().toISOString()) : null;
    if (cerradoEn !== undefined) cambios.cerrado_en = cerradoEn;
  }
  const planificacion = MUEVE_PLANIFICACION.has(campo) ? planificacionTrasCambio(await cargarTiempos(), actual as unknown as DatosEnvio, def.columna, normalizado.valor) : undefined;
  if (planificacion !== undefined) cambios.planificacion = planificacion;

  const { error } = await supabase.from("wms_compras").update(cambios).eq("id", id);
  if (error) return { error: error.message.length < 200 ? error.message : "No se pudo guardar el cambio." };

  if (campo === "etapa" || campo === "estado") {
    await anotarEventos(
      id,
      { etapa: String(actual.etapa), estado: String(actual.estado) },
      { etapa: campo === "etapa" ? String(normalizado.valor) : String(actual.etapa), estado: campo === "estado" ? String(normalizado.valor) : String(actual.estado) },
    );
  }
  if (campo !== "etapa" && campo !== "estado") {
    await anotarCambios(id, [
      { campo, antes: textoDeValor(def, actual[def.columna]), despues: textoDeValor(def, normalizado.valor) },
      ...(planificacion !== undefined ? [{ campo: "planificacion", antes: textoSimple(actual.planificacion), despues: textoSimple(planificacion) }] : []),
    ]);
  }
  await registrarAuditoria({
    accion: "editar_campo_compra",
    entidad: "wms_compras",
    entidadId: id,
    antes: { [def.etiqueta]: textoDeValor(def, actual[def.columna]) },
    despues: { [def.etiqueta]: textoDeValor(def, normalizado.valor) },
  });
  return { ...(cerradoEn === undefined ? {} : { cerradoEn }), ...(planificacion === undefined ? {} : { planificacion }) };
}

/**
 * Cambia **un mismo dato de varias compras a la vez**, desde la barra que sale al marcarlas en la lista (como las acciones en
 * lote de ClickUp: por ejemplo, ponerle a todas las compras de un envío su etiqueta, su fecha límite o su planificación).
 * Valida con las mismas reglas que una celda (`normalizarValor`) y cada compra deja lo mismo que dejaría el cambio hecho
 * una por una: la fecha de cierre al cambiar la etapa, el evento de etapa o estado, su línea en la Actividad y la
 * auditoría. Con las etiquetas, `agregar` y `quitar` respetan las que cada compra ya tenía. La cantidad y el monto de una
 * compra con productos no se tocan (se calculan de ellos): esas se cuentan en `omitidas`. Devuelve el error como valor.
 */
export async function actualizarCampoComprasLote(
  ids: string[],
  campo: string,
  bruto: unknown,
  modo: ModoLote = "poner",
): Promise<{ error?: string; aplicadas?: { id: string; valor: ValorCampo; cerradoEn?: string | null; planificacion?: string | null }[]; omitidas?: number }> {
  await requireModuloEscritura("compras");
  if (!Array.isArray(ids) || ids.length === 0) return { error: "Marca al menos una compra." };
  const unicos = [...new Set(ids.map(String))];
  if (unicos.length > MAX_COMPRAS_LOTE) return { error: `Se pueden cambiar hasta ${MAX_COMPRAS_LOTE} compras a la vez.` };
  if (unicos.some((id) => !ES_ID(id))) return { error: "Hay una compra que no es válida." };
  const sinAcceso = await sinAccesoACompras(unicos);
  if (sinAcceso) return { error: sinAcceso };
  const def = campoEditable(String(campo));
  if (!def) return { error: "Ese dato no se edita aquí." };
  if (modo !== "poner" && (def.tipo !== "lista" || (modo !== "agregar" && modo !== "quitar"))) return { error: "Ese cambio solo sirve para las etiquetas." };
  const normalizado = normalizarValor(def, bruto);
  if ("error" in normalizado) return normalizado;

  const supabase = createServiceClient();
  const { data } = await supabase.from("wms_compras").select(`id, ${def.columna}, etapa, estado, tipo, pais_id, via_envio, fecha_envio, planificacion`).in("id", unicos);
  const actuales = new Map(((data ?? []) as unknown as (Record<string, unknown> & { id: string })[]).map((c) => [c.id, c]));

  // Con productos vinculados, la cantidad y el monto se calculan de ellos: esas compras no se tocan.
  const conProductos = new Set<string>();
  if (def.soloSinProductos) {
    const { data: lineas } = await supabase.from("wms_compra_items").select("compra_id").in("compra_id", unicos);
    for (const l of lineas ?? []) conProductos.add(String(l.compra_id));
  }
  const objetivo = unicos.filter((id) => actuales.has(id) && !conProductos.has(id));
  const omitidas = unicos.length - objetivo.length;
  if (objetivo.length === 0) return { error: def.soloSinProductos && conProductos.size ? "Con productos vinculados, esto se calcula de ellos." : "Las compras ya no existen.", omitidas };

  const ahora = new Date().toISOString();
  const nuevoValor = (id: string): ValorCampo => {
    const antes = actuales.get(id)![def.columna];
    return def.tipo === "lista" ? combinarLista(Array.isArray(antes) ? antes.map(String) : [], modo, normalizado.valor as string[]) : normalizado.valor;
  };

  // La fecha de envío o la vía mueven la planificación de cada compra (según su país).
  const tiempos = MUEVE_PLANIFICACION.has(campo) ? await cargarTiempos() : null;
  const planificacionDe = new Map<string, string | null>();
  if (tiempos) for (const id of objetivo) planificacionDe.set(id, planificacionTrasCambio(tiempos, actuales.get(id) as unknown as DatosEnvio, def.columna, nuevoValor(id)));

  // Las que quedan con el mismo valor (y la misma regla de cierre) se guardan juntas, en una sola escritura.
  const grupos = new Map<string, { ids: string[]; cambios: Record<string, unknown> }>();
  const cerradoEnDe = new Map<string, string | null>();
  for (const id of objetivo) {
    const valor = nuevoValor(id);
    const cambios: Record<string, unknown> = { [def.columna]: valor, actualizado_en: ahora };
    let cierre = "";
    if (campo === "etapa") {
      const accion = cierreAlCambiarEtapa(String(actuales.get(id)!.etapa), String(normalizado.valor));
      if (accion === "sellar") cambios.cerrado_en = ahora;
      if (accion === "quitar") cambios.cerrado_en = null;
      cierre = accion;
      if (accion !== "mantener") cerradoEnDe.set(id, accion === "sellar" ? ahora : null);
    }
    if (planificacionDe.has(id)) cambios.planificacion = planificacionDe.get(id) ?? null;
    const clave = `${JSON.stringify(valor)}|${cierre}|${planificacionDe.get(id) ?? ""}`;
    const grupo = grupos.get(clave) ?? { ids: [], cambios };
    grupo.ids.push(id);
    grupos.set(clave, grupo);
  }
  const resultados = await Promise.all([...grupos.values()].map((g) => supabase.from("wms_compras").update(g.cambios).in("id", g.ids)));
  const fallo = resultados.find((r) => r.error);
  if (fallo?.error) {
    // Pudo quedar guardada una parte: se vuelve a leer la lista para que se vea lo que de verdad quedó.
    revalidatePath("/compras/lista");
    return { error: fallo.error.message.length < 200 ? fallo.error.message : "No se pudo guardar el cambio." };
  }

  // Actividad, eventos y auditoría: una línea por compra que de verdad cambió, con una sola escritura cada una.
  const usuario = await getUsuarioActual();
  const autor = usuario?.nombre || usuario?.email || null;
  const base = Date.now();
  const cambiaron = objetivo.filter((id) => JSON.stringify(ordenada(actuales.get(id)![def.columna])) !== JSON.stringify(ordenada(nuevoValor(id))));
  if (cambiaron.length > 0) {
    const filas = cambiaron.map((id, i) => {
      const antes = actuales.get(id)!;
      return {
        compra_id: id,
        campo,
        valor_antes: campo === "etapa" || campo === "estado" ? String(antes[campo]) : textoDeValor(def, antes[def.columna]),
        valor_despues: campo === "etapa" || campo === "estado" ? String(normalizado.valor) : textoDeValor(def, nuevoValor(id)),
        // La base no repite compra + campo + valor + hora: cada compra lleva unos milisegundos distintos.
        ocurrido_en: new Date(base + i).toISOString(),
        autor,
        origen: "sistema",
      };
    });
    // La planificación que se movió con ese cambio, en su propia línea de la Actividad.
    const movidas = cambiaron.filter((id) => planificacionDe.has(id) && (planificacionDe.get(id) ?? null) !== ((actuales.get(id)!.planificacion as string | null) ?? null));
    const filasPlan = movidas.map((id, i) => ({
      compra_id: id,
      campo: "planificacion",
      valor_antes: textoSimple(actuales.get(id)!.planificacion),
      valor_despues: textoSimple(planificacionDe.get(id)),
      ocurrido_en: new Date(base + cambiaron.length + i).toISOString(),
      autor,
      origen: "sistema",
    }));
    await supabase.from("wms_compra_eventos").insert([...filas, ...filasPlan]);
    await registrarAuditoriaLote(
      cambiaron.map((id) => ({
        accion: "editar_campo_compra",
        entidad: "wms_compras",
        entidadId: id,
        detalle: `En lote (${cambiaron.length} compras)`,
        antes: { [def.etiqueta]: textoDeValor(def, actuales.get(id)![def.columna]) },
        despues: { [def.etiqueta]: textoDeValor(def, nuevoValor(id)) },
      })),
    );
  }

  return {
    aplicadas: objetivo.map((id) => ({
      id,
      valor: nuevoValor(id),
      ...(cerradoEnDe.has(id) ? { cerradoEn: cerradoEnDe.get(id) ?? null } : {}),
      ...(planificacionDe.has(id) ? { planificacion: planificacionDe.get(id) ?? null } : {}),
    })),
    omitidas,
  };
}

export async function eliminarCompra(formData: FormData) {
  await requireModuloEscritura("compras");
  const id = formData.get("id") as string;
  const nombre = formData.get("nombre") as string;
  if (typeof id !== "string" || !ES_ID(id) || (await sinAccesoACompras([id]))) throw new Error(SIN_ACCESO_PAIS);

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("wms_compras").select("foto_url").eq("id", id).single();
  const { error } = await supabase.from("wms_compras").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (actual?.foto_url) await borrarFotoSiEsNuestra(actual.foto_url);

  await registrarAuditoria({ accion: "eliminar_compra", entidad: "wms_compras", entidadId: id, detalle: nombre });
  revalidatePath("/compras");
}

/** Un archivo de la compra: con su enlace firmado de una hora (o el de ClickUp, en los videos). */
export interface AdjuntoCompra {
  id: string;
  nombre: string;
  clase: string;
  url: string | null;
  creadoEn: string;
}

/** Las reacciones de un comentario, por emoji: cuántas, si una es mía y de quiénes. */
export interface ReaccionComentario {
  emoji: string;
  n: number;
  mia: boolean;
  nombres: string[];
}

export interface ActividadCompra {
  /**
   * Cada comentario con los archivos que se adjuntaron en él (la captura de un pago, un comprobante…), a qué comentario responde
   * (si es una respuesta) y sus reacciones.
   */
  comentarios: { id: string; autor: string | null; texto: string; creadoEn: string; adjuntos: AdjuntoCompra[]; respuestaA: string | null; reacciones: ReaccionComentario[] }[];
  subtareas: { id: string; nombre: string; estado: string | null; responsable: string | null; creadoEn: string; cerradoEn: string | null }[];
  /** Los archivos sueltos de la compra (los de ClickUp y la foto/documentos): los de un comentario van dentro de él. */
  adjuntos: AdjuntoCompra[];
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
  const sinAcceso = await sinAccesoACompras([id]);
  if (sinAcceso) return { error: sinAcceso };
  const supabase = createServiceClient();
  const consultaAdjuntos = (columnas: string) => supabase.from("wms_compra_adjuntos").select(columnas).eq("compra_id", id).order("creado_en");
  const consultaComentarios = (columnas: string) => supabase.from("wms_compra_comentarios").select(columnas).eq("compra_id", id).order("creado_en", { ascending: false }).limit(500);
  const [comentariosCompletos, subtareas, adjuntosConComentario, eventos] = await Promise.all([
    consultaComentarios("id, autor, texto, creado_en, respuesta_a"),
    supabase.from("wms_compra_subtareas").select("id, nombre, estado, responsable_nombre, creado_en, cerrado_en").eq("compra_id", id).order("creado_en"),
    consultaAdjuntos("id, nombre, clase, ruta, url_clickup, creado_en, comentario_id"),
    supabase.from("wms_compra_eventos").select("id, campo, valor_antes, valor_despues, ocurrido_en, autor, origen").eq("compra_id", id).order("ocurrido_en", { ascending: false }),
  ]);
  // Sin la migración 0085 (la columna `comentario_id`) la actividad sigue cargando, solo que sin archivos dentro de los comentarios.
  const adjuntos = adjuntosConComentario.error ? await consultaAdjuntos("id, nombre, clase, ruta, url_clickup, creado_en") : adjuntosConComentario;
  // Sin la migración 0095 (respuestas y reacciones) los comentarios se cargan igual, todos sueltos.
  const comentarios = comentariosCompletos.error ? await consultaComentarios("id, autor, texto, creado_en") : comentariosCompletos;
  type FilaComentario = { id: string; autor: string | null; texto: string; creado_en: string; respuesta_a?: string | null };
  const filasComentarios = (comentarios.data ?? []) as unknown as FilaComentario[];
  const yo = (await getUsuarioActual())?.id ?? null;
  const reacciones = new Map<string, ReaccionComentario[]>();
  if (filasComentarios.length) {
    const { data: filasReacciones } = await supabase
      .from("wms_compra_comentario_reacciones")
      .select("comentario_id, usuario_id, usuario_nombre, emoji, creado_en")
      .in("comentario_id", filasComentarios.map((c) => c.id))
      .order("creado_en");
    for (const r of filasReacciones ?? []) {
      const lista = reacciones.get(r.comentario_id) ?? [];
      let grupo = lista.find((g) => g.emoji === r.emoji);
      if (!grupo) lista.push((grupo = { emoji: r.emoji, n: 0, mia: false, nombres: [] }));
      grupo.n++;
      grupo.mia ||= r.usuario_id === yo;
      grupo.nombres.push(r.usuario_nombre ?? "—");
      reacciones.set(r.comentario_id, lista);
    }
  }
  if (comentarios.error || subtareas.error || adjuntos.error || eventos.error) return { error: "No se pudo cargar la actividad." };

  type FilaAdjunto = { id: string; nombre: string; clase: string; ruta: string | null; url_clickup: string | null; creado_en: string; comentario_id?: string | null };
  const filasAdjuntos = (adjuntos.data ?? []) as unknown as FilaAdjunto[];
  const rutas = filasAdjuntos.map((a) => a.ruta).filter((r): r is string => !!r);
  const firmadas = new Map<string, string>();
  if (rutas.length) {
    const { data } = await supabase.storage.from(BUCKET_COMPRAS).createSignedUrls(rutas, 3600);
    for (const f of data ?? []) if (f.path && f.signedUrl) firmadas.set(f.path, f.signedUrl);
  }
  const aAdjunto = (a: FilaAdjunto): AdjuntoCompra => ({ id: a.id, nombre: a.nombre, clase: a.clase, url: (a.ruta && firmadas.get(a.ruta)) || a.url_clickup || null, creadoEn: a.creado_en });
  const deComentario = new Map<string, AdjuntoCompra[]>();
  for (const a of filasAdjuntos) if (a.comentario_id) deComentario.set(a.comentario_id, [...(deComentario.get(a.comentario_id) ?? []), aAdjunto(a)]);
  return {
    comentarios: filasComentarios.map((c) => ({
      id: c.id,
      autor: c.autor,
      texto: c.texto,
      creadoEn: c.creado_en,
      adjuntos: deComentario.get(c.id) ?? [],
      respuestaA: c.respuesta_a ?? null,
      reacciones: reacciones.get(c.id) ?? [],
    })),
    subtareas: (subtareas.data ?? []).map((t) => ({ id: t.id, nombre: t.nombre, estado: t.estado, responsable: t.responsable_nombre, creadoEn: t.creado_en, cerradoEn: t.cerrado_en })),
    adjuntos: filasAdjuntos.filter((a) => !a.comentario_id).map(aAdjunto),
    eventos: (eventos.data ?? []).map((e) => ({ id: e.id, campo: e.campo, antes: e.valor_antes, despues: e.valor_despues, ocurridoEn: e.ocurrido_en, autor: e.autor, origen: e.origen })),
  };
}

/** Un archivo que ya se subió al almacenamiento para un comentario (ver `prepararSubidaAdjuntoComentario`). */
export interface AdjuntoSubido {
  ruta: string;
  nombre: string;
}

/**
 * Da permiso (URL firmada) para subir un archivo de un comentario directo desde el navegador, sin pasarlo por la acción del
 * servidor (que no admite archivos grandes). Va a una carpeta de esa compra del bucket privado; el archivo se revisa de verdad
 * al comentar (`comentarCompra`). Devuelve el error como valor.
 */
export async function prepararSubidaAdjuntoComentario(compraId: string, nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  await requireModuloEscritura("compras");
  if (typeof compraId !== "string" || !ES_ID(compraId)) return { error: "Compra no válida." };
  if (typeof nombreArchivo !== "string" || !nombreArchivo.trim()) return { error: "El archivo no tiene nombre." };
  const sinAcceso = await sinAccesoACompras([compraId]);
  if (sinAcceso) return { error: sinAcceso };
  const ruta = `comentarios/${compraId}/${crypto.randomUUID()}-${nombreSeguro(nombreArchivo)}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET_COMPRAS).createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

/** Borra archivos subidos que ya no se van a usar (se descartaron o no pasaron la revisión). Nunca lanza. */
async function borrarSubidos(rutas: string[]) {
  const propias = rutas.filter((r) => typeof r === "string" && r.startsWith("comentarios/"));
  if (propias.length) await createServiceClient().storage.from(BUCKET_COMPRAS).remove(propias);
}

/** Descarta un archivo que se subió pero se quitó antes de comentar. Solo borra de la carpeta de esa compra. */
export async function descartarAdjuntoSubido(compraId: string, ruta: string): Promise<void> {
  await requireModuloEscritura("compras");
  if (typeof compraId !== "string" || !ES_ID(compraId) || typeof ruta !== "string" || !ruta.startsWith(`comentarios/${compraId}/`) || ruta.includes("..")) return;
  if (await sinAccesoACompras([compraId])) return;
  await borrarSubidos([ruta]);
}

/**
 * Revisa los archivos de un comentario: que estén en la carpeta de esa compra, que existan, que no pasen del peso y que su
 * contenido sea de verdad una imagen (JPG, PNG, WebP, GIF), un PDF, un Excel, Word o PowerPoint, un CSV o un texto — se mira
 * el contenido, no lo que dice el nombre ni el navegador. Si alguno falla se borran todos y se devuelve el error.
 */
async function revisarAdjuntosSubidos(
  compraId: string,
  archivos: AdjuntoSubido[],
): Promise<{ error: string } | { ruta: string; nombre: string; extension: string; tamano: number; clase: string }[]> {
  const rutas = archivos.map((a) => (a && typeof a.ruta === "string" ? a.ruta : ""));
  const falla = async (error: string) => {
    await borrarSubidos(rutas);
    return { error };
  };
  if (archivos.length > MAX_ADJUNTOS_COMENTARIO) return falla(`Un comentario lleva hasta ${MAX_ADJUNTOS_COMENTARIO} archivos.`);
  const carpeta = `comentarios/${compraId}/`;
  if (rutas.some((r) => !r.startsWith(carpeta) || r.includes("..") || r.length > 300)) return falla("Hay un archivo que no es de esta compra.");

  const storage = createServiceClient().storage.from(BUCKET_COMPRAS);
  const resultado: { ruta: string; nombre: string; extension: string; tamano: number; clase: string }[] = [];
  for (const [i, archivo] of archivos.entries()) {
    const ruta = rutas[i];
    const { data, error } = await storage.download(ruta);
    if (error || !data) return falla("No se encontró uno de los archivos. Vuelve a adjuntarlo.");
    if (data.size > MAX_BYTES_ADJUNTO) return falla("Un archivo pesa más de lo permitido.");
    const contenido = new Uint8Array(await data.arrayBuffer());
    const nombreOriginal0 = String(archivo.nombre ?? "").trim().slice(0, 120);
    const tipo = detectarAdjunto(contenido, nombreOriginal0 || ruta);
    if (!tipo) return falla("Se pueden adjuntar imágenes, PDF, Excel, Word, PowerPoint, CSV y texto (se revisa el contenido, no el nombre).");
    // Se vuelve a guardar con el tipo que corresponde a su contenido (no el que mandó el navegador), así un texto se abre
    // siempre como texto y nunca como página web.
    if ((data.type || "").split(";")[0] !== tipo.tipo.split(";")[0]) {
      const { error: errorTipo } = await storage.update(ruta, contenido, { contentType: tipo.tipo, upsert: true });
      if (errorTipo) return falla("No se pudo guardar uno de los archivos.");
    }
    const nombreOriginal = nombreOriginal0 || `archivo.${tipo.extension}`;
    resultado.push({ ruta, nombre: nombreOriginal, extension: tipo.extension, tamano: data.size, clase: tipo.clase });
  }
  return resultado;
}

/**
 * Agrega un comentario a una compra (queda con el nombre de quien lo escribe y la hora), con o sin archivos adjuntos (la captura
 * de un pago, un comprobante…) que se ven debajo de su texto. Las personas etiquetadas con «@»
 * (`menciones`) reciben un aviso «Para ti» que abre esta compra en ese comentario. Devuelve el error como valor.
 */
export async function comentarCompra(
  id: string,
  texto: string,
  menciones: string[] = [],
  adjuntos: AdjuntoSubido[] = [],
  /** El comentario al que responde (de esta misma compra); se le avisa a quien lo escribió. */
  respuestaA: string | null = null,
): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("compras");
  if (!ES_ID(id)) return { error: "Compra no válida." };
  const sinAcceso = await sinAccesoACompras([id]);
  if (sinAcceso) return { error: sinAcceso };
  const limpio = String(texto ?? "").trim().slice(0, 5000);
  const archivos = Array.isArray(adjuntos) ? adjuntos : [];
  if (!limpio && archivos.length === 0) return { error: "Escribe el comentario o adjunta un archivo." };
  const autor = usuario.nombre || usuario.email;
  const supabase = createServiceClient();

  // Los archivos ya están en el almacenamiento (se subieron directo desde el navegador): antes de comentar se revisa que
  // sean lo que dicen ser (por su firma, no por el nombre) y que sean de esta compra. Si algo no cuadra, se borran todos.
  // Una respuesta va a un comentario de esta compra (a uno que no sea, a su vez, una respuesta: un solo nivel, como ClickUp).
  let padre: { id: string; autor_id: string | null; respuesta_a: string | null } | null = null;
  if (respuestaA !== null) {
    if (!ES_ID(String(respuestaA))) return { error: "El comentario al que respondes no es válido." };
    const { data: p } = await supabase.from("wms_compra_comentarios").select("id, autor_id, respuesta_a").eq("id", respuestaA).eq("compra_id", id).maybeSingle();
    if (!p) return { error: "El comentario al que respondes ya no existe." };
    padre = { id: p.respuesta_a ?? p.id, autor_id: p.autor_id, respuesta_a: p.respuesta_a };
  }

  const revisados = archivos.length ? await revisarAdjuntosSubidos(id, archivos) : [];
  if (revisados && "error" in revisados) return revisados;

  const fila = { compra_id: id, autor, texto: limpio, autor_id: usuario.id, ...(padre ? { respuesta_a: padre.id } : {}) };
  let insercion = await supabase.from("wms_compra_comentarios").insert(fila).select("id").single();
  // Sin la migración 0095 (columnas `autor_id` y `respuesta_a`): se guarda como antes, sin responder.
  if (insercion.error && (insercion.error.code === "PGRST204" || insercion.error.code === "42703")) {
    if (padre) {
      await borrarSubidos(archivos.map((a) => a.ruta));
      return { error: "Falta correr la migración 0095 para responder comentarios." };
    }
    insercion = await supabase.from("wms_compra_comentarios").insert({ compra_id: id, autor, texto: limpio }).select("id").single();
  }
  const { data, error } = insercion;
  if (error || !data) {
    await borrarSubidos(archivos.map((a) => a.ruta));
    return { error: "No se pudo guardar el comentario." };
  }
  if (revisados && revisados.length) {
    const { error: errorAdjuntos } = await supabase.from("wms_compra_adjuntos").insert(
      revisados.map((a) => ({
        compra_id: id,
        comentario_id: data.id,
        nombre: a.nombre,
        extension: a.extension,
        tamano: a.tamano,
        clase: a.clase,
        origen: "sistema",
        ruta: a.ruta,
        subido_por: autor,
      })),
    );
    if (errorAdjuntos) {
      // Sin la columna `comentario_id` (migración 0085) o por otro error: no queda un comentario a medias.
      await supabase.from("wms_compra_comentarios").delete().eq("id", data.id);
      await borrarSubidos(archivos.map((a) => a.ruta));
      // Al insertar, una columna que no existe llega como PGRST204 («Could not find the … column … in the schema cache»);
      // 42703 es lo que devuelve Postgres directo (al leer). Las dos dicen lo mismo: falta correr la migración 0085.
      const faltaLaColumna = errorAdjuntos.code === "42703" || errorAdjuntos.code === "PGRST204" || /comentario_id/i.test(errorAdjuntos.message ?? "");
      return { error: faltaLaColumna ? "Falta correr la migración 0085 para adjuntar archivos a un comentario." : "No se pudieron guardar los archivos." };
    }
  }

  const mencionados = await mencionadosValidos(menciones, limpio, usuario.id);
  // A quien escribió el comentario que se responde también le llega el aviso (si no es uno mismo ni ya está mencionado).
  const respondido = padre?.autor_id && padre.autor_id !== usuario.id && !mencionados.some((m) => m.id === padre!.autor_id) ? padre.autor_id : null;
  if (mencionados.length || respondido) {
    const { data: compra } = await supabase.from("wms_compras").select("numero, nombre, tipo, paises(codigo)").eq("id", id).maybeSingle();
    const pais = (Array.isArray(compra?.paises) ? compra?.paises[0] : compra?.paises) as { codigo: string } | null | undefined;
    const ver = compra?.tipo === "importacion" ? "importacion" : (pais?.codigo ?? "todos");
    const oc = compra ? `OC-${String(compra.numero).padStart(4, "0")}` : "una compra";
    const href = `/compras/lista?ver=${encodeURIComponent(ver)}&abrir=${id}&comentario=${data.id}`;
    const deLaCompra = `la compra ${oc}${compra?.nombre ? ` · ${compra.nombre}` : ""}`;
    await notificarMenciones({ mencionados, autorId: usuario.id, autorNombre: autor, titulo: `${autor} te mencionó en ${deLaCompra}`, texto: limpio, href });
    if (respondido) await notificarMenciones({ mencionados: [{ id: respondido }], autorId: usuario.id, autorNombre: autor, titulo: `${autor} respondió tu comentario en ${deLaCompra}`, texto: limpio, href });
  }
  return {};
}

/** Un producto de una orden de compra, para su ficha. */
export interface ItemCompra {
  id: string;
  skuId: string;
  codigo: string;
  nombre: string;
  cantidadPedida: number;
  costoUnitario: number | null;
  loteNumero: number;
  cantidadRecibida: number | null;
  fechaRecepcion: string | null;
  origen: string;
}

/** Un producto de la ficha que se puede agregar a una compra (los compuestos no: no se compran, salen de sus componentes). */
export interface ProductoComprable {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  clase: string;
  /** Si es una variante, su producto padre; un producto con variantes se compra por variante. */
  padreId: string | null;
  opciones: Record<string, string> | null;
  /** El N.º correlativo y la foto, para reconocerlo al buscarlo. */
  numero: number | null;
  foto: string | null;
}

/** Los productos de una compra y los que se le pueden agregar. Basta poder abrir Compras. */
export async function obtenerProductosCompra(compraId: string): Promise<{ items: ItemCompra[]; productos: ProductoComprable[] } | { error: string }> {
  await requireModulo("compras");
  if (!ES_ID(compraId)) return { error: "Compra no válida." };
  const sinAcceso = await sinAccesoACompras([compraId]);
  if (sinAcceso) return { error: sinAcceso };
  const supabase = createServiceClient();
  const [items, productos] = await Promise.all([
    supabase
      .from("wms_compra_items")
      .select("id, sku_maestro_id, cantidad_pedida, costo_unitario, lote_numero, cantidad_recibida, fecha_recepcion, origen, skus_maestros(codigo, nombre)")
      .eq("compra_id", compraId)
      .order("creado_en"),
    supabase.from("skus_maestros").select("id, codigo, nombre, estado, clase, padre_id, opciones, numero, foto_url").neq("tipo", "combo").order("nombre"),
  ]);
  if (items.error || productos.error) return { error: "No se pudieron cargar los productos." };
  return {
    items: (items.data ?? []).map((i) => {
      const sku = (Array.isArray(i.skus_maestros) ? i.skus_maestros[0] : i.skus_maestros) as { codigo: string; nombre: string } | null;
      return {
        id: i.id,
        skuId: i.sku_maestro_id,
        codigo: sku?.codigo ?? "",
        nombre: sku?.nombre ?? "",
        cantidadPedida: i.cantidad_pedida,
        costoUnitario: i.costo_unitario === null ? null : Number(i.costo_unitario),
        loteNumero: i.lote_numero,
        cantidadRecibida: i.cantidad_recibida,
        fechaRecepcion: i.fecha_recepcion,
        origen: i.origen,
      };
    }),
    productos: (productos.data ?? []).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.estado, clase: p.clase, padreId: p.padre_id, opciones: p.opciones, numero: p.numero ?? null, foto: p.foto_url ?? null })),
  };
}

const ES_CANTIDAD = (n: number) => Number.isInteger(n) && n > 0 && n <= 10_000_000;
const ES_COSTO = (n: number | null) => n === null || (Number.isFinite(n) && n >= 0 && n <= 100_000_000);

/**
 * El total de una compra con productos: la QTY Total es la suma de lo pedido y el Monto Total la de cada línea (cantidad ×
 * costo unitario, en centavos) de las que tienen costo. Sin ninguna línea con costo, el Monto Total no se toca.
 */
async function sincronizarCantidad(compraId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase.from("wms_compra_items").select("cantidad_pedida, costo_unitario").eq("compra_id", compraId);
  const lineas = data ?? [];
  const unidades = lineas.reduce((suma, i) => suma + Number(i.cantidad_pedida), 0);
  const conCosto = lineas.filter((i) => i.costo_unitario !== null);
  const monto = conCosto.reduce((suma, i) => suma + Math.round(Number(i.cantidad_pedida) * Number(i.costo_unitario) * 100) / 100, 0);
  await supabase
    .from("wms_compras")
    .update({
      qty_total: lineas.length ? unidades : null,
      ...(conCosto.length ? { monto_total: Math.round(monto * 100) / 100 } : {}),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", compraId);
}

// Las acciones de las líneas de una compra no llaman a `revalidatePath`: rearmar toda la página de Compras (más de mil
// compras con sus productos) antes de responder hacía lenta cada edición. El bloque «Productos» recarga sus líneas y pide al
// navegador refrescar la tabla en segundo plano (`router.refresh()` dentro de una transición).

/**
 * Agrega un producto de la ficha a una compra de país, con lo pedido y su costo unitario. Toma el número de lote siguiente
 * de ese producto en el país de la compra (Lote #1, #2…). Un producto en Test no se compra: primero pasa a Activo
 * (`useConfirmarProductoActivo`).
 */
export async function agregarProductoCompra(compraId: string, skuId: string, cantidad: number, costo: number | null): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("compras");
  if (!ES_ID(compraId) || !ES_ID(skuId)) return { error: "Datos no válidos." };
  const sinAcceso = await sinAccesoACompras([compraId]);
  if (sinAcceso) return { error: sinAcceso };
  if (!ES_CANTIDAD(cantidad)) return { error: "La cantidad debe ser un número entero mayor que cero." };
  if (!ES_COSTO(costo)) return { error: "El costo unitario no es válido." };
  const sku = await productoComprable(skuId);
  if ("error" in sku) return sku;
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("wms_agregar_item_compra", {
    p_compra: compraId,
    p_sku: skuId,
    p_cantidad: cantidad,
    p_costo: costo,
    p_lote: null,
    p_origen: "sistema",
    p_usuario: usuario.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ese producto ya está en la compra: cambia su cantidad." };
    return { error: error.message.length < 200 ? error.message : "No se pudo agregar el producto." };
  }
  await sincronizarCantidad(compraId);
  await anotarCambios(compraId, [{ campo: "productoAgregado", antes: null, despues: `${sku.codigo} · ${sku.nombre} · ${textoLinea(cantidad, costo)}` }]);
  await registrarAuditoria({ accion: "agregar_producto_compra", entidad: "wms_compras", entidadId: compraId, detalle: `${sku.codigo} · ${cantidad} u.` });
  return {};
}

/** Un producto que se puede comprar (existe, no es compuesto, no está en Test y no tiene variantes), o por qué no. */
async function productoComprable(skuId: string): Promise<{ codigo: string; nombre: string } | { error: string }> {
  const supabase = createServiceClient();
  const { data: sku } = await supabase.from("skus_maestros").select("codigo, nombre, tipo, clase").eq("id", skuId).maybeSingle();
  if (!sku) return { error: "El producto no existe." };
  if (sku.tipo === "combo") return { error: "Un producto compuesto no se compra: se compran sus componentes." };
  if (sku.clase === "test") return { error: `${sku.codigo} está en Test: pásalo a Activo para comprarlo.` };
  const { count: variantes } = await supabase.from("skus_maestros").select("id", { count: "exact", head: true }).eq("padre_id", skuId);
  if ((variantes ?? 0) > 0) return { error: `${sku.codigo} tiene variantes: se compra por variante.` };
  return { codigo: sku.codigo as string, nombre: sku.nombre as string };
}

/** Los productos que se pueden agregar a una compra nueva (la que todavía no se crea). Basta poder abrir Compras. */
export async function productosComprables(): Promise<{ productos: ProductoComprable[] } | { error: string }> {
  await requireModulo("compras");
  const { data, error } = await createServiceClient().from("skus_maestros").select("id, codigo, nombre, estado, clase, padre_id, opciones, numero, foto_url").neq("tipo", "combo").order("nombre");
  if (error) return { error: "No se pudieron cargar los productos." };
  return { productos: (data ?? []).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.estado, clase: p.clase, padreId: p.padre_id, opciones: p.opciones, numero: p.numero ?? null, foto: p.foto_url ?? null })) };
}

/** Cambia lo pedido o el costo unitario de un producto de una compra. */
export async function actualizarProductoCompra(itemId: string, cantidad: number, costo: number | null): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  if (!ES_ID(itemId)) return { error: "Producto no válido." };
  const sinAcceso = await sinAccesoALinea(itemId);
  if (sinAcceso) return { error: sinAcceso };
  if (!ES_CANTIDAD(cantidad)) return { error: "La cantidad debe ser un número entero mayor que cero." };
  if (!ES_COSTO(costo)) return { error: "El costo unitario no es válido." };
  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("wms_compra_items").select("cantidad_pedida, costo_unitario, skus_maestros(codigo, nombre)").eq("id", itemId).maybeSingle();
  const { data, error } = await supabase
    .from("wms_compra_items")
    .update({ cantidad_pedida: cantidad, costo_unitario: costo, actualizado_en: new Date().toISOString() })
    .eq("id", itemId)
    .select("compra_id")
    .single();
  if (error || !data) return { error: "No se pudo guardar el cambio." };
  await sincronizarCantidad(data.compra_id);
  if (antes) {
    const sku = (Array.isArray(antes.skus_maestros) ? antes.skus_maestros[0] : antes.skus_maestros) as { codigo: string; nombre: string } | null;
    const previo = textoLinea(Number(antes.cantidad_pedida), antes.costo_unitario === null ? null : Number(antes.costo_unitario));
    const ahora = textoLinea(cantidad, costo);
    if (previo !== ahora) await anotarCambios(data.compra_id, [{ campo: "productoCambiado", antes: `${sku?.codigo ?? ""} · ${sku?.nombre ?? ""} · ${previo}`, despues: ahora }]);
  }
  return {};
}

/** Quita un producto de una compra, si todavía no se recibió nada de él. */
export async function quitarProductoCompra(itemId: string): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  if (!ES_ID(itemId)) return { error: "Producto no válido." };
  const sinAcceso = await sinAccesoALinea(itemId);
  if (sinAcceso) return { error: sinAcceso };
  const supabase = createServiceClient();
  const { data: item } = await supabase
    .from("wms_compra_items")
    .select("compra_id, cantidad_recibida, cantidad_pedida, costo_unitario, skus_maestros(codigo, nombre)")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { error: "El producto ya no está en la compra." };
  if (item.cantidad_recibida !== null) return { error: "Ya se recibió mercancía de este producto: no se puede quitar." };
  const { error } = await supabase.from("wms_compra_items").delete().eq("id", itemId);
  if (error) return { error: "No se pudo quitar el producto." };
  await sincronizarCantidad(item.compra_id);
  const sku = (Array.isArray(item.skus_maestros) ? item.skus_maestros[0] : item.skus_maestros) as { codigo: string; nombre: string } | null;
  await anotarCambios(item.compra_id, [
    {
      campo: "productoQuitado",
      antes: `${sku?.codigo ?? ""} · ${sku?.nombre ?? ""} · ${textoLinea(Number(item.cantidad_pedida), item.costo_unitario === null ? null : Number(item.costo_unitario))}`,
      despues: null,
    },
  ]);
  await registrarAuditoria({ accion: "quitar_producto_compra", entidad: "wms_compras", entidadId: item.compra_id, detalle: sku?.codigo ?? itemId });
  return {};
}

/** Elige el color de una tienda de Compras (como el de las etiquetas): vale para todas las compras que la tengan. */
export async function guardarColorTienda(nombre: string, color: string): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const limpio = String(nombre ?? "").trim().slice(0, 60);
  if (!limpio) return { error: "Tienda no válida." };
  if (!/^#[0-9a-fA-F]{6}$/.test(String(color))) return { error: "Color no válido." };
  const { error } = await createServiceClient()
    .from("wms_compras_tiendas")
    .upsert({ nombre: limpio, color, actualizado_en: new Date().toISOString() }, { onConflict: "nombre" });
  if (error) return { error: "No se pudo guardar el color." };
  return {};
}

/**
 * Cambia el nombre de una tienda **en todas las compras** que la tienen (de todos los países), con su color. Si el nombre
 * nuevo ya es otra tienda, se juntan. Como toca compras de todos los países, solo lo hace quien ve todos. Cada compra deja
 * la línea en su Actividad. Devuelve cuántas compras cambiaron.
 */
export async function renombrarTienda(antes: string, despues: string): Promise<{ error?: string; compras?: number; nombre?: string }> {
  await requireModuloEscritura("compras");
  if ((await getUsuarioActual())?.paisesPermitidos != null) return { error: "Renombrar una tienda cambia las compras de todos los países: pídeselo a quien los ve todos." };
  const viejo = String(antes ?? "").trim();
  const escrito = String(despues ?? "").replace(/,/g, " ").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!viejo || !escrito) return { error: "Escribe el nombre nuevo de la tienda." };
  if (viejo === escrito) return { compras: 0, nombre: viejo };
  const supabase = createServiceClient();

  const filas = await traerTodasLasFilas<{ id: string; tiendas: string[] }>((desde, hasta) =>
    supabase.from("wms_compras").select("id, tiendas").contains("tiendas", [viejo]).order("id").range(desde, hasta),
  );
  // Si ya existe una tienda con ese nombre (sin importar mayúsculas), se usa como está escrita: se juntan.
  const { data: conColor } = await supabase.from("wms_compras_tiendas").select("nombre, color");
  const colores = (conColor ?? []) as { nombre: string; color: string }[];
  const nombre = colores.find((c) => c.nombre !== viejo && c.nombre.toLowerCase() === escrito.toLowerCase())?.nombre ?? escrito;

  const nuevas = (t: string[]) => [...new Set(t.map((x) => (x === viejo ? nombre : x)))];
  for (let i = 0; i < filas.length; i += 20) {
    const tramo = filas.slice(i, i + 20);
    const r = await Promise.all(tramo.map((f) => supabase.from("wms_compras").update({ tiendas: nuevas(f.tiendas), actualizado_en: new Date().toISOString() }).eq("id", f.id)));
    if (r.some((x) => x.error)) return { error: "No se pudo cambiar el nombre en todas las compras; vuelve a intentarlo." };
  }

  const color = colores.find((c) => c.nombre === viejo)?.color;
  if (color) await supabase.from("wms_compras_tiendas").upsert({ nombre, color }, { onConflict: "nombre", ignoreDuplicates: true });
  await supabase.from("wms_compras_tiendas").delete().eq("nombre", viejo);

  if (filas.length) {
    const usuario = await getUsuarioActual();
    const base = Date.now();
    await supabase.from("wms_compra_eventos").insert(
      filas.map((f, i) => ({
        compra_id: f.id,
        campo: "tienda",
        valor_antes: textoSimple(f.tiendas),
        valor_despues: textoSimple(nuevas(f.tiendas)),
        ocurrido_en: new Date(base + i).toISOString(),
        autor: usuario?.nombre || usuario?.email || null,
        origen: "sistema",
      })),
    );
  }
  await registrarAuditoria({ accion: "renombrar_tienda", entidad: "wms_compras", detalle: `${viejo} → ${nombre} (${filas.length} compras)` });
  return { compras: filas.length, nombre };
}

/** Elige el color de una etiqueta de Compras (como en ClickUp): vale para todas las compras que la tengan. */
export async function guardarColorEtiqueta(nombre: string, color: string): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const limpio = String(nombre ?? "").trim().slice(0, 40);
  if (!limpio) return { error: "Etiqueta no válida." };
  if (!/^#[0-9a-fA-F]{6}$/.test(String(color))) return { error: "Color no válido." };
  const { error } = await createServiceClient()
    .from("wms_compras_etiquetas")
    .upsert({ nombre: limpio, color, actualizado_en: new Date().toISOString() }, { onConflict: "nombre" });
  if (error) return { error: "No se pudo guardar el color." };
  return {};
}

/**
 * Pone o quita una reacción (👍, ❤️…) de la persona en un comentario de una compra, como en ClickUp. Devuelve las reacciones de
 * ese comentario como quedaron. Devuelve el error como valor.
 */
export async function alternarReaccion(comentarioId: string, emoji: string): Promise<{ error?: string; reacciones?: ReaccionComentario[] }> {
  const usuario = await requireModuloEscritura("compras");
  if (!ES_ID(String(comentarioId))) return { error: "Comentario no válido." };
  if (!(EMOJIS_REACCION as readonly string[]).includes(emoji)) return { error: "Esa reacción no está permitida." };
  const supabase = createServiceClient();
  const { data: comentario } = await supabase.from("wms_compra_comentarios").select("compra_id").eq("id", comentarioId).maybeSingle();
  if (!comentario) return { error: "El comentario ya no existe." };
  const sinAcceso = await sinAccesoACompras([comentario.compra_id as string]);
  if (sinAcceso) return { error: sinAcceso };

  const tabla = supabase.from("wms_compra_comentario_reacciones");
  const { data: ya, error: errorLeer } = await tabla.select("emoji").eq("comentario_id", comentarioId).eq("usuario_id", usuario.id).eq("emoji", emoji).maybeSingle();
  if (errorLeer) return { error: errorLeer.code === "42P01" || errorLeer.code === "PGRST205" ? "Falta correr la migración 0095 para reaccionar." : "No se pudo guardar la reacción." };
  const { error } = ya
    ? await supabase.from("wms_compra_comentario_reacciones").delete().eq("comentario_id", comentarioId).eq("usuario_id", usuario.id).eq("emoji", emoji)
    : await supabase.from("wms_compra_comentario_reacciones").insert({ comentario_id: comentarioId, usuario_id: usuario.id, usuario_nombre: usuario.nombre || usuario.email, emoji });
  if (error) return { error: "No se pudo guardar la reacción." };

  const { data: filas } = await supabase.from("wms_compra_comentario_reacciones").select("usuario_id, usuario_nombre, emoji").eq("comentario_id", comentarioId).order("creado_en");
  const reacciones: ReaccionComentario[] = [];
  for (const r of filas ?? []) {
    let g = reacciones.find((x) => x.emoji === r.emoji);
    if (!g) reacciones.push((g = { emoji: r.emoji, n: 0, mia: false, nombres: [] }));
    g.n++;
    g.mia ||= r.usuario_id === usuario.id;
    g.nombres.push(r.usuario_nombre ?? "—");
  }
  return { reacciones };
}
