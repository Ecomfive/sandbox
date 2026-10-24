"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { creditosPorAcabarse } from "@/lib/ia/consumo";
import { ETIQUETA_PROVEEDOR } from "@/lib/ia/precios";
import { geminiConectado, generarImagen, modeloImagen } from "@/lib/landings/gemini-api";
import { cargarCompetidores, cargarNuestrosEnDropi } from "@/lib/publicaciones/competencia-publicaciones";
import {
  MAX_FOTOS,
  normalizarAnalisis,
  normalizarPlanFotos,
  normalizarPropuestaTexto,
  normalizarTitulos,
  pedidoAnalisis,
  pedidoFotos,
  pedidoTexto,
  pedidoCorregirTitulos,
  pedidoTitulos,
  promptFoto,
  type AnalisisIA,
  type ContextoIA,
  type DatosPublicacionIA,
  type PlanFotos,
  type PropuestaTexto,
  type PropuestaTitulos,
  type TipoIA,
} from "@/lib/publicaciones/ia/asistente";
import { chequearTitulo, correccionesDeAuditoria, reglasParaIA, type ChequeoTitulo, type Ejemplos, type ReglasIA } from "@/lib/publicaciones/ia/criterios";
import { avisoDeReintento, compararTexto, lineaRiesgosa, normalizarTextos, pedidoLeerTexto, textoLeido } from "@/lib/publicaciones/ia/texto-imagen";
import { cargarEstilos } from "@/lib/publicaciones/ia/estilos-datos";
import { cargarIndicaciones } from "@/lib/publicaciones/ia/indicaciones-datos";
import { modeloDeTexto, NOMBRE_PROVEEDOR, pedirIA, proveedorTexto } from "@/lib/publicaciones/ia/proveedor";
import { notaOptimizacion, revisarPublicacion, type Revision } from "@/lib/publicaciones/optimizacion";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { cargarReglas } from "@/lib/publicaciones/reglas-datos";
import { encolarCambio, enviarNombreADropi as enviarADropi } from "@/lib/publicaciones/cambios-dropi";
import { descripcionAHtml, medirDescripcion } from "@/lib/publicaciones/descripcion-dropi";
import { normalizarDatosCrear, type FotoCrear } from "@/lib/publicaciones/crear-dropi";
import { MAX_NOMBRE_DROPI, MIN_DESCRIPCION_DROPI } from "@/lib/publicaciones/dropi-guardado";
import { ventasDePublicacion } from "@/lib/publicaciones/ventas";
import { cargarResumenVentas } from "@/lib/publicaciones/ventas-datos";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { descargarPublico } from "@/lib/seguridad/url-externa";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const BUCKET = "wms-productos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const faltaMigracion = (m: string) => /does not exist|schema cache|relation/i.test(m);
const SIN_MIGRACION = "Falta correr en Supabase la migración 0134.";
const urlPublica = (ruta: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta}`;
const idsDropi = (dropiId: string | null) => (String(dropiId ?? "").match(/\d{3,6}/g) ?? []).map(Number);
/** Lo que acompaña a cada pedido para anotar el consumo: qué es, quién lo pidió y de qué publicación. */
const consumoDe = (operacion: string, usuario: UsuarioActual, pub: Pub) => ({ operacion, modulo: MODULO, usuario, publicacionId: pub.id });
const SIN_IA = "Falta conectar una IA de texto (OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel).";

export interface EstadoIA {
  /** Hay una IA de texto conectada (OpenAI o Claude). */
  texto: boolean;
  /** Cuál se usa («OpenAI», «Claude») y con qué modelo. */
  proveedor: string | null;
  modelo: string | null;
  gemini: boolean;
  /** Avisos de crédito: el proveedor cuyo crédito estimado ya bajó del monto de aviso o se agotó (Consumo de IA). */
  avisos: { proveedor: string; agotado: boolean; saldoUsd: number | null }[];
}

/** Qué está conectado: sin una IA de texto no se analiza ni se redacta; sin la clave de Gemini no se generan fotos. */
export async function estadoAsistenteIA(): Promise<EstadoIA> {
  await requireModulo(MODULO);
  const p = proveedorTexto();
  const bajos = await creditosPorAcabarse(createServiceClient()).catch(() => []);
  return {
    texto: p !== null,
    proveedor: p ? NOMBRE_PROVEEDOR[p] : null,
    modelo: p ? modeloDeTexto() : null,
    gemini: geminiConectado(),
    avisos: bajos.map((b) => ({ proveedor: ETIQUETA_PROVEEDOR[b.proveedor], agotado: b.estado === "agotado", saldoUsd: b.saldo.saldoUsd })),
  };
}

/** Un resultado guardado (lo último que se generó para esa publicación y tipo). */
export interface GuardadoIA<T> {
  id: string;
  creadoEn: string;
  por: string;
  modelo: string | null;
  resultado: T;
  /** La valoración del equipo: sirvió o no, y por qué. */
  feedback: { util: boolean; nota: string } | null;
}

/**
 * El plan de fotos con la dirección pública de cada imagen ya generada y, en `dropi`, si la foto quedó aprobada para subirla a Dropi
 * (pendiente en la cola de «Aplicar en Dropi») o ya se subió (migración 0151).
 */
export interface PlanFotosVista extends Omit<PlanFotos, "fotos"> {
  fotos: (PlanFotos["fotos"][number] & { url: string | null; dropi: "pendiente" | "subida" | null })[];
}

/** Lo que la publicación tiene hoy y las reglas con que se revisa: lo primero que se ve en el asistente. */
export interface ContextoVista {
  nombre: string;
  numero: string;
  fotoUrl: string | null;
  tituloActual: string;
  categoria: string | null;
  /** El nombre del producto vinculado: sus palabras en inglés son su nombre comercial y no cuentan como inglés en el título. */
  nombreProducto: string | null;
  /** De dónde sale el título: lo que muestra Dropi o, si no se leyó, el nombre guardado. */
  tituloDeDropi: boolean;
  reglas: ReglasIA;
  revisiones: Revision[];
  nota: { cumple: number; total: number };
  /** Los títulos con que otros venden lo mismo en Dropi. */
  competidores: string[];
  /** Cuántas indicaciones del equipo hay escritas. */
  indicaciones: number;
  /** Cuántos títulos aprobados por el equipo se usan de ejemplo. */
  ejemplos: number;
}

export interface AsistenteVista {
  /** La descripción elegida: pendiente en la cola de «Aplicar en Dropi» o ya aplicada (null = ninguna elegida). */
  descripcionDropi: "pendiente" | "aplicada" | null;
  /** Si la publicación todavía no existe en Dropi («Sin publicar»): lo elegido se guarda con ella y se publica junto. */
  sinPublicar: boolean;
  contexto: ContextoVista;
  analisis: GuardadoIA<AnalisisIA> | null;
  titulos: GuardadoIA<PropuestaTitulos> | null;
  texto: GuardadoIA<PropuestaTexto> | null;
  fotos: GuardadoIA<PlanFotosVista> | null;
}

const conUrls = (p: PlanFotos, estados?: { pendientes: Set<string>; subidas: Set<string> }): PlanFotosVista => ({
  ...p,
  fotos: p.fotos.map((f) => {
    const url = f.ruta ? urlPublica(f.ruta) : null;
    return { ...f, url, dropi: url && estados?.pendientes.has(url) ? ("pendiente" as const) : url && estados?.subidas.has(url) ? ("subida" as const) : null };
  }),
});

/**
 * Lo que de esta publicación ya está en la cola de «Aplicar en Dropi» (migración 0151): las fotos y la descripción que se eligieron en el
 * asistente. En una publicación «Sin publicar» lo elegido vive en sus datos para Dropi. Sin la migración, todo vacío.
 */
async function estadoDeLoElegido(pubId: string) {
  const supabase = createServiceClient();
  const pendientes = new Set<string>();
  const subidas = new Set<string>();
  const descripciones = new Map<string, "pendiente" | "aplicada">();
  const { data: cola, error } = await supabase.from("dropi_cambios_pendientes").select("estado, descripcion, fotos").eq("publicacion_id", pubId).eq("tipo", "cambio").neq("estado", "reemplazado").limit(300);
  if (error) return { pendientes, subidas, descripciones, sinPublicar: false };
  for (const c of cola ?? []) {
    const vivo = c.estado === "pendiente" || c.estado === "error";
    for (const f of Array.isArray(c.fotos) ? (c.fotos as FotoCrear[]) : []) (vivo ? pendientes : subidas).add(f.url);
    if (typeof c.descripcion === "string" && c.descripcion) descripciones.set(c.descripcion, vivo ? "pendiente" : (descripciones.get(c.descripcion) ?? "aplicada"));
  }
  const { data: pub } = await supabase.from("dropi_publicaciones").select("estado_publicacion, datos_dropi").eq("id", pubId).maybeSingle();
  const sinPublicar = pub?.estado_publicacion === "borrador";
  if (sinPublicar) {
    const d = normalizarDatosCrear(pub?.datos_dropi);
    for (const f of d.fotos) pendientes.add(f.url);
    if (d.descripcion) descripciones.set(d.descripcion, "pendiente");
  }
  return { pendientes, subidas, descripciones, sinPublicar };
}

/** La publicación con lo que agregó la migración 0151 (estado «Sin publicar», datos para Dropi y descripción); null si falta la migración. */
async function extrasDePublicacion(pubId: string): Promise<{ estado_publicacion: string | null; datos_dropi: Record<string, unknown> | null; descripcion: string | null } | null> {
  const { data, error } = await createServiceClient().from("dropi_publicaciones").select("estado_publicacion, datos_dropi, descripcion").eq("id", pubId).maybeSingle();
  if (error || !data) return null;
  return { estado_publicacion: (data.estado_publicacion as string | null) ?? null, datos_dropi: (data.datos_dropi as Record<string, unknown> | null) ?? null, descripcion: (data.descripcion as string | null) ?? null };
}

/** ¿Alguna foto esperando en la cola usa esa dirección? (Una foto aprobada no se borra de Storage aunque se rehaga la del plan.) */
async function fotoEnCola(pubId: string, url: string): Promise<boolean> {
  const { data } = await createServiceClient().from("dropi_cambios_pendientes").select("fotos").eq("publicacion_id", pubId).in("estado", ["pendiente", "error"]).not("fotos", "is", null).limit(100);
  return (data ?? []).some((c) => Array.isArray(c.fotos) && (c.fotos as FotoCrear[]).some((f) => f.url === url));
}

type FilaIA = { id: string; tipo: string; resultado: unknown; modelo: string | null; creado_por_nombre: string | null; creado_en: string };
type Pub = { id: string; nombre: string; dropi_id: string | null; pais_id: string; precio_venta: number | null; margen: number | null; foto_url: string | null; sku_maestro_id: string | null };

/**
 * La publicación, si existe y es de un país que la persona puede ver. Sin foto propia, `foto_url` trae la del producto vinculado
 * (23 oct 2026, como la lista): con ella la IA analiza y genera fotos.
 */
async function publicacionPermitida(id: string, usuario: UsuarioActual): Promise<Pub | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("dropi_publicaciones").select("id, nombre, dropi_id, pais_id, precio_venta, margen, foto_url, sku_maestro_id").eq("id", id).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, data.pais_id as string))) return null;
  const pub = data as Pub;
  if (!pub.foto_url && pub.sku_maestro_id) {
    const { data: sku } = await supabase.from("skus_maestros").select("foto_url").eq("id", pub.sku_maestro_id).maybeSingle();
    pub.foto_url = (sku?.foto_url as string | null | undefined) ?? null;
  }
  return pub;
}

/**
 * Lo que la IA aprende del equipo: los nombres que cambió a mano en la ficha (de la auditoría, antes → después), los títulos que eligió
 * (o corrigió y usó) en el asistente, y por qué rechazó recomendaciones de título o dijo que una sugerencia no le sirvió. Sin la tabla, nada.
 */
async function cargarEjemplos(): Promise<Ejemplos> {
  const supabase = createServiceClient();
  const out: Ejemplos = { titulos: [], rechazos: [], correcciones: [] };
  // Los cambios de nombre hechos a mano en la ficha (actualizarPublicacion) quedan en la auditoría con el dato «Producto».
  const { data: manuales } = await supabase
    .from("historial_auditoria")
    .select("antes, despues, entidad_id")
    .eq("accion", "editar_publicacion_dropi")
    .eq("entidad", "dropi_publicaciones")
    .not("despues->>Producto", "is", null)
    .order("creado_en", { ascending: false })
    .limit(150);
  out.correcciones = correccionesDeAuditoria(manuales ?? []);
  const { data } = await supabase.from("dropi_publicaciones_ia").select("resultado").eq("tipo", "titulos").order("creado_en", { ascending: false }).limit(80);
  for (const f of data ?? []) {
    const r = f.resultado as PropuestaTitulos & { feedback?: { util: boolean; nota: string } };
    if (r?.elegido?.titulo && !out.titulos.includes(r.elegido.titulo)) out.titulos.push(r.elegido.titulo);
    if (r?.feedback && r.feedback.util === false && r.feedback.nota) out.rechazos.push(r.feedback.nota);
  }
  const { data: rechazadas } = await supabase.from("dropi_publicaciones_decisiones").select("nota").eq("tipo", "optimizar_titulo").eq("decision", "rechazada").not("nota", "is", null).order("creado_en", { ascending: false }).limit(6);
  for (const d of rechazadas ?? []) if (d.nota) out.rechazos.push(String(d.nota));
  out.titulos = out.titulos.slice(0, 8);
  out.rechazos = out.rechazos.slice(0, 6);
  return out;
}

/** Todo lo que se necesita para pedirle algo a la IA y para mostrar el contexto: los datos de la publicación, la revisión y las reglas. */
async function cargarBase(pub: Pub) {
  const supabase = createServiceClient();
  const ids = idsDropi(pub.dropi_id);
  const [{ data: pais }, enDropi, { reglas }, sku, competidores, ventas, { indicaciones }, ejemplos, { data: numero }, { estilos }] = await Promise.all([
    supabase.from("paises").select("nombre").eq("id", pub.pais_id).maybeSingle(),
    cargarNuestrosEnDropi(supabase, pub.pais_id),
    cargarReglas(supabase),
    pub.sku_maestro_id ? supabase.from("skus_maestros").select("codigo, nombre").eq("id", pub.sku_maestro_id).maybeSingle() : Promise.resolve({ data: null }),
    cargarCompetidores(supabase, pub.pais_id),
    cargarResumenVentas(supabase, pub.pais_id),
    cargarIndicaciones(supabase),
    cargarEjemplos(),
    supabase.from("dropi_publicaciones").select("numero").eq("id", pub.id).maybeSingle(),
    cargarEstilos(supabase),
  ]);
  const cat = ids.map((n) => enDropi.get(n)).find((x) => !!x) ?? null;
  const precio = pub.precio_venta === null ? null : Number(pub.precio_venta);
  const reglasIA = reglasParaIA(reglas as Parameters<typeof reglasParaIA>[0]);
  const revisiones = revisarPublicacion(
    {
      titulo: cat?.nombre ?? pub.nombre,
      categoria: cat?.categoria ?? null,
      precio: cat?.precio ?? precio,
      precioSugerido: cat?.precioSugerido ?? null,
      fotos: cat?.fotos ?? null,
      videos: cat?.videos ?? null,
      descripcionLargo: cat?.descripcionLargo ?? null,
      leidoEnDropi: !!cat,
      nombreProducto: (sku.data as { nombre: string } | null)?.nombre ?? null,
    },
    reglas,
  );
  const s = sku.data as { codigo: string; nombre: string } | null;
  const delProducto = ids.flatMap((n) => competidores.get(n) ?? []);
  const v = ventas ? ventasDePublicacion(ids, ventas.resumen) : null;
  const datos: DatosPublicacionIA = {
    nombre: pub.nombre,
    tituloDropi: cat?.nombre ?? null,
    categoria: cat?.categoria ?? null,
    pais: (pais?.nombre as string | undefined) ?? "",
    precio,
    producto: s ? `${s.codigo} · ${s.nombre}` : null,
    revisiones: revisiones.map((r) => ({ etiqueta: r.etiqueta, estado: r.estado, detalle: r.detalle })),
    competidores: delProducto.slice(0, 10).map((c) => ({ nombre: c.nombre, proveedor: c.proveedor, precio: c.precio })),
    margen: pub.margen === null ? null : Number(pub.margen),
    ventas30: v ? v.netas30 : null,
  };
  const contexto: ContextoIA = { reglas: reglasIA, indicaciones, ejemplos, estilos: estilos.filter((e) => e.activo) };
  const vista: ContextoVista = {
    nombre: pub.nombre,
    numero: numeroPublicacion((numero?.numero as number | null | undefined) ?? null),
    fotoUrl: pub.foto_url,
    tituloActual: cat?.nombre ?? pub.nombre,
    categoria: cat?.categoria ?? null,
    nombreProducto: s?.nombre ?? null,
    tituloDeDropi: !!cat,
    reglas: reglasIA,
    revisiones,
    nota: notaOptimizacion(revisiones),
    competidores: [...new Set(delProducto.map((c) => c.nombre))].slice(0, 8),
    indicaciones: Object.values(indicaciones).filter((t) => (t ?? "").trim()).length,
    ejemplos: ejemplos.titulos.length + (ejemplos.correcciones?.length ?? 0),
  };
  // Cuántas fotos faltan para el mínimo de las reglas (si se leyó el catálogo); sin dato, 4.
  const fotosFaltan = cat?.fotos == null ? 4 : Math.max(1, reglas.min_fotos - cat.fotos);
  return { datos, contexto, vista, fotosFaltan, categoria: cat?.categoria ?? null, nombreProducto: s?.nombre ?? null };
}

/** Lo último que se generó para una publicación y el contexto con que se revisa. Basta poder abrir el módulo. */
export async function obtenerAsistenteIA(publicacionId: string): Promise<AsistenteVista | { error: string }> {
  const usuario = await requireModulo(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  const [{ data, error }, base] = await Promise.all([
    createServiceClient().from("dropi_publicaciones_ia").select("id, tipo, resultado, modelo, creado_por_nombre, creado_en").eq("publicacion_id", publicacionId).order("creado_en", { ascending: false }).limit(40),
    cargarBase(pub),
  ]);
  if (error) return { error: faltaMigracion(error.message) ? SIN_MIGRACION : "No se pudo cargar lo que generó la IA." };
  const filas = (data ?? []) as FilaIA[];
  const elegido = await estadoDeLoElegido(publicacionId);
  const ultimo = <T,>(tipo: TipoIA, mapa: (r: unknown) => T): GuardadoIA<T> | null => {
    const f = filas.find((x) => x.tipo === tipo);
    if (!f) return null;
    const r = f.resultado as { feedback?: { util: boolean; nota: string } };
    return { id: f.id, creadoEn: f.creado_en, por: f.creado_por_nombre ?? "", modelo: f.modelo, resultado: mapa(f.resultado), feedback: r?.feedback ?? null };
  };
  const texto = ultimo("texto", (r) => r as PropuestaTexto);
  return {
    descripcionDropi: texto?.resultado.elegida ? (elegido.descripciones.get(texto.resultado.elegida.html) ?? null) : null,
    sinPublicar: elegido.sinPublicar,
    contexto: base.vista,
    analisis: ultimo("analisis", (r) => r as AnalisisIA),
    titulos: ultimo("titulos", (r) => r as PropuestaTitulos),
    texto,
    fotos: ultimo("fotos", (r) => conUrls(r as PlanFotos, elegido)),
  };
}

/** Antes de pagarle a la IA se comprueba que se podrá guardar lo que devuelva: sin la migración 0134 se avisa sin gastar nada. */
async function migracionLista(): Promise<string | null> {
  const { error } = await createServiceClient().from("dropi_publicaciones_ia").select("id").limit(1);
  return error && faltaMigracion(error.message) ? SIN_MIGRACION : null;
}

async function guardar(publicacionId: string, tipo: TipoIA, resultado: unknown, modelo: string | null, usuario: UsuarioActual): Promise<{ id: string } | { error: string }> {
  const { data, error } = await createServiceClient()
    .from("dropi_publicaciones_ia")
    .insert({ publicacion_id: publicacionId, tipo, resultado, modelo, creado_por: usuario.id, creado_por_nombre: usuario.nombre || usuario.email })
    .select("id")
    .single();
  if (error || !data) return { error: error && faltaMigracion(error.message) ? SIN_MIGRACION : "No se pudo guardar lo que generó la IA." };
  return { id: data.id as string };
}

const ahora = (id: string, usuario: UsuarioActual, modelo: string | null) => ({ id, creadoEn: new Date().toISOString(), por: usuario.nombre || usuario.email, modelo, feedback: null });

/**
 * «Analizar con IA»: la IA revisa la publicación con las reglas del sistema, las ventas, el margen y la competencia, y dice qué mejorar,
 * en qué orden y qué cambiaría el equipo en su forma de trabajar. Tarda de 20 a 90 segundos. Devuelve el error como valor.
 */
export async function analizarPublicacionIA(publicacionId: string): Promise<{ error?: string; guardado?: GuardadoIA<AnalisisIA> }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  if (!proveedorTexto()) return { error: SIN_IA };
  const sinMigracion = await migracionLista();
  if (sinMigracion) return { error: sinMigracion };
  const { datos, contexto } = await cargarBase(pub);
  const r = await pedirIA({ ...pedidoAnalisis(datos, contexto), imagenes: pub.foto_url ? [pub.foto_url] : [] }, true, consumoDe("analisis", usuario, pub));
  if ("error" in r) return { error: r.error };
  const analisis = normalizarAnalisis(r.texto);
  if (!analisis) return { error: "La IA no devolvió algo que se pueda usar. Vuelve a intentar." };
  const modelo = modeloDeTexto();
  const g = await guardar(pub.id, "analisis", analisis, modelo, usuario);
  if ("error" in g) return g;
  await registrarAuditoria({ accion: "ia_analisis_publicacion", entidad: "dropi_publicaciones", entidadId: pub.id, detalle: `${pub.nombre}: análisis y sugerencias (${modelo})` });
  return { guardado: { ...ahora(g.id, usuario, modelo), resultado: analisis } };
}

/**
 * «Sugerir títulos»: la IA propone 6 títulos con las reglas del sistema (largo, español, cantidad), el estilo que el equipo aprobó antes y
 * lo que dicen los competidores; el sistema revisa cada uno y se queda con los que cumplen. Tarda de 10 a 60 segundos.
 */
export async function proponerTitulosIA(publicacionId: string): Promise<{ error?: string; guardado?: GuardadoIA<PropuestaTitulos> }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  if (!proveedorTexto()) return { error: SIN_IA };
  const sinMigracion = await migracionLista();
  if (sinMigracion) return { error: sinMigracion };
  const { datos, contexto, categoria, nombreProducto } = await cargarBase(pub);
  const r = await pedirIA({ ...pedidoTitulos(datos, contexto), imagenes: pub.foto_url ? [pub.foto_url] : [] }, false, consumoDe("titulos", usuario, pub));
  if ("error" in r) return { error: r.error };
  const actual = datos.tituloDropi ?? datos.nombre;
  let propuesta = normalizarTitulos(r.texto, categoria, contexto.reglas, actual, nombreProducto);
  if (!propuesta) return { error: "La IA no devolvió títulos que se puedan usar. Vuelve a intentar." };
  // La IA cuenta mal los caracteres: lo que no cumple el largo se le devuelve una vez con su largo real para que lo ajuste.
  const fallidos = propuesta.titulos.filter((t) => !t.cumple);
  if (fallidos.length) {
    const r2 = await pedirIA({ ...pedidoCorregirTitulos(fallidos, contexto), imagenes: [] }, false, consumoDe("titulos", usuario, pub));
    const corregida = "error" in r2 ? null : normalizarTitulos(r2.texto, categoria, contexto.reglas, actual, nombreProducto);
    if (corregida) {
      const buenos = [...propuesta.titulos.filter((t) => t.cumple), ...corregida.titulos.filter((t) => t.cumple)].filter((t, i, a) => a.findIndex((x) => x.titulo.toLowerCase() === t.titulo.toLowerCase()) === i);
      propuesta = buenos.length
        ? { enfoque: propuesta.enfoque, titulos: buenos.slice(0, 3), descartados: propuesta.descartados }
        : { ...corregida, enfoque: propuesta.enfoque };
    }
  }
  const modelo = modeloDeTexto();
  const g = await guardar(pub.id, "titulos", propuesta, modelo, usuario);
  if ("error" in g) return g;
  await registrarAuditoria({ accion: "ia_titulos_publicacion", entidad: "dropi_publicaciones", entidadId: pub.id, detalle: `${pub.nombre}: ${propuesta.titulos.length} títulos propuestos, ${propuesta.descartados} descartados (${modelo})` });
  return { guardado: { ...ahora(g.id, usuario, modelo), resultado: propuesta } };
}

/**
 * El equipo usa un título (tal cual o corregido): queda guardado como el elegido y desde entonces es un ejemplo del estilo de Ecomfive
 * para las siguientes sugerencias. Devuelve cómo queda el título final frente a las reglas.
 */
export async function elegirTituloIA(
  iaId: string,
  titulo: string,
): Promise<{ error?: string; chequeos?: ChequeoTitulo[]; cumple?: boolean; dropi?: { estado: "pendiente" | "error"; detalle: string } }> {
  const usuario = await requireModuloEscritura(MODULO);
  const limpio = typeof titulo === "string" ? titulo.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (typeof iaId !== "string" || !UUID.test(iaId) || limpio.length < 8) return { error: "Escribe el título." };
  const supabase = createServiceClient();
  const { data: fila } = await supabase.from("dropi_publicaciones_ia").select("id, publicacion_id, tipo, resultado").eq("id", iaId).maybeSingle();
  if (!fila || fila.tipo !== "titulos") return { error: "No se encontró la propuesta." };
  const pub = await publicacionPermitida(fila.publicacion_id as string, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  const { contexto, categoria, nombreProducto } = await cargarBase(pub);
  const r = fila.resultado as PropuestaTitulos;
  const editado = !r.titulos?.some((t) => t.titulo === limpio);
  const resultado: PropuestaTitulos = { ...r, elegido: { titulo: limpio, editado, por: usuario.nombre || usuario.email, en: new Date().toISOString() } };
  // La única excepción a «el nombre viene de Dropi» (pedido de Hernán, 22 oct 2026): el título de la IA que se elige con «Usar
  // este título» pasa a ser el Nombre en Dropi de la publicación (y después se pone en Dropi). Dropi admite 40 caracteres.
  if (limpio.length > MAX_NOMBRE_DROPI) return { error: `Dropi admite ${MAX_NOMBRE_DROPI} caracteres en el nombre: este tiene ${limpio.length}.` };
  const { error } = await supabase.from("dropi_publicaciones_ia").update({ resultado, actualizado_en: new Date().toISOString() }).eq("id", iaId);
  if (error) return { error: "No se pudo guardar el título elegido." };
  const cambio = await supabase.from("dropi_publicaciones").update({ nombre: limpio, actualizado_en: new Date().toISOString() }).eq("id", pub.id);
  if (cambio.error) return { error: "Se guardó el título, pero no se pudo cambiar el Nombre en Dropi." };
  await registrarAuditoria({
    accion: "ia_titulo_elegido",
    entidad: "dropi_publicaciones",
    entidadId: pub.id,
    detalle: `«${limpio}»${editado ? " (corregido)" : ""}`,
    antes: { "Nombre en Dropi": pub.nombre },
    despues: { "Nombre en Dropi": limpio },
  });
  const dropi = await enviarADropi(supabase, pub, limpio, { id: usuario.id, nombre: usuario.nombre || usuario.email }, pub.nombre);
  revalidatePath("/publicaciones-dropi");
  const c = chequearTitulo(limpio, categoria, contexto.reglas, nombreProducto);
  return { chequeos: c.chequeos, cumple: c.cumple, dropi };
}

/**
 * «Usar esta descripción» (pedido de Jhokser, 24 oct 2026; migración 0151): la descripción propuesta por la IA (tal cual o corregida) pasa a
 * ser la de la publicación y queda **pendiente para Dropi** en la cola de «Aplicar en Dropi» (se puede ver y deshacer en la lista de cambios
 * pendientes). Dropi pide 200 caracteres como mínimo. En una publicación «Sin publicar» se guarda con ella y se publica junto.
 */
export async function elegirDescripcionIA(iaId: string, texto: string): Promise<{ error?: string; largo?: number; dropi?: { estado: "pendiente" | "error"; detalle: string } }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof iaId !== "string" || !UUID.test(iaId) || typeof texto !== "string") return { error: "Descripción no válida." };
  const html = descripcionAHtml(texto.slice(0, 20_000));
  const medida = medirDescripcion(html);
  if (!medida.cumple) return { error: `Dropi pide una descripción de al menos ${MIN_DESCRIPCION_DROPI} caracteres: esta tiene ${medida.largo}.` };
  const supabase = createServiceClient();
  const { data: fila } = await supabase.from("dropi_publicaciones_ia").select("id, publicacion_id, tipo, resultado").eq("id", iaId).maybeSingle();
  if (!fila || fila.tipo !== "texto") return { error: "No se encontró la propuesta." };
  const pub = await publicacionPermitida(fila.publicacion_id as string, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  const extras = await extrasDePublicacion(pub.id);
  if (!extras) return { error: "Falta correr en Supabase la migración 0151." };
  const por = { id: usuario.id, nombre: usuario.nombre || usuario.email };
  let dropi: { estado: "pendiente" | "error"; detalle: string };
  if (extras.estado_publicacion === "borrador") {
    const guardado = await supabase.from("dropi_publicaciones").update({ descripcion: html, datos_dropi: { ...(extras.datos_dropi ?? {}), descripcion: html }, actualizado_en: new Date().toISOString() }).eq("id", pub.id);
    if (guardado.error) return { error: "No se pudo guardar la descripción." };
    dropi = { estado: "pendiente", detalle: "Guardada con la publicación: se sube a Dropi cuando la publiques." };
  } else {
    const r = await encolarCambio(supabase, pub, { descripcion: html, descripcionAntes: extras.descripcion }, por);
    if ("error" in r) return { error: r.error };
    const guardado = await supabase.from("dropi_publicaciones").update({ descripcion: html, actualizado_en: new Date().toISOString() }).eq("id", pub.id);
    if (guardado.error) return { error: "Se dejó pendiente para Dropi, pero no se pudo guardar la descripción en la publicación." };
    dropi = { estado: "pendiente", detalle: "Descripción pendiente para Dropi: pulsa «Aplicar en Dropi» con Dropi abierto." };
  }
  const resultado: PropuestaTexto = { ...(fila.resultado as PropuestaTexto), elegida: { html, por: por.nombre, en: new Date().toISOString() } };
  await supabase.from("dropi_publicaciones_ia").update({ resultado, actualizado_en: new Date().toISOString() }).eq("id", iaId);
  await registrarAuditoria({
    accion: "dropi_descripcion_pendiente",
    entidad: "dropi_publicaciones",
    entidadId: pub.id,
    detalle: `${pub.nombre}: descripción nueva (${medida.largo} caracteres)`,
    antes: { Descripción: extras.descripcion ? `${medirDescripcion(extras.descripcion).largo} caracteres` : "sin descripción guardada" },
    despues: { Descripción: `${medida.largo} caracteres` },
  });
  revalidatePath("/publicaciones-dropi");
  return { largo: medida.largo, dropi };
}

/**
 * Aprobar fotos generadas para subirlas a Dropi (pedido de Jhokser, 24 oct 2026; migración 0151): las fotos marcadas del plan quedan
 * **pendientes para Dropi** en la cola de «Aplicar en Dropi» (se ven y se deshacen en la lista de cambios pendientes); «Aplicar en Dropi» las
 * sube al producto. En una publicación «Sin publicar» se suman a las fotos que se publican con ella.
 */
export async function aprobarFotosIA(iaId: string, indices: number[]): Promise<{ error?: string; aprobadas?: number; dropi?: { estado: "pendiente" | "error"; detalle: string } }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof iaId !== "string" || !UUID.test(iaId) || !Array.isArray(indices) || indices.length === 0 || indices.length > MAX_FOTOS || !indices.every((i) => Number.isInteger(i) && i >= 0 && i < MAX_FOTOS)) return { error: "Elige las fotos que quieres subir." };
  const supabase = createServiceClient();
  const { data: fila } = await supabase.from("dropi_publicaciones_ia").select("id, publicacion_id, tipo, resultado").eq("id", iaId).maybeSingle();
  if (!fila || fila.tipo !== "fotos") return { error: "No se encontró el plan de fotos." };
  const pub = await publicacionPermitida(fila.publicacion_id as string, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  const extras = await extrasDePublicacion(pub.id);
  if (!extras) return { error: "Falta correr en Supabase la migración 0151." };
  const plan = fila.resultado as PlanFotos;
  // Solo fotos ya generadas, de la carpeta de esta publicación (el navegador no decide qué archivo se sube).
  const fotos: FotoCrear[] = [...new Set(indices)]
    .map((i) => plan.fotos?.[i]?.ruta)
    .filter((ruta): ruta is string => typeof ruta === "string" && ruta.startsWith(`publicaciones/${pub.id}/ia/`) && /^[A-Za-z0-9._/-]+$/.test(ruta))
    .map((ruta) => ({ url: urlPublica(ruta), nombre: ruta.split("/").pop() ?? "foto.jpg" }));
  if (!fotos.length) return { error: "Primero genera esas fotos." };
  const por = { id: usuario.id, nombre: usuario.nombre || usuario.email };
  let dropi: { estado: "pendiente" | "error"; detalle: string };
  if (extras.estado_publicacion === "borrador") {
    const datos = normalizarDatosCrear(extras.datos_dropi);
    const todas = [...datos.fotos, ...fotos.filter((f) => !datos.fotos.some((x) => x.url === f.url))];
    const guardado = await supabase.from("dropi_publicaciones").update({ datos_dropi: { ...(extras.datos_dropi ?? {}), fotos: todas }, actualizado_en: new Date().toISOString() }).eq("id", pub.id);
    if (guardado.error) return { error: "No se pudieron guardar las fotos." };
    dropi = { estado: "pendiente", detalle: "Guardadas con la publicación: se suben a Dropi cuando la publiques." };
  } else {
    const r = await encolarCambio(supabase, pub, { fotos }, por);
    if ("error" in r) return { error: r.error };
    dropi = { estado: "pendiente", detalle: `${fotos.length === 1 ? "1 foto pendiente" : `${fotos.length} fotos pendientes`} para Dropi: pulsa «Aplicar en Dropi» con Dropi abierto.` };
  }
  await registrarAuditoria({ accion: "dropi_fotos_pendiente", entidad: "dropi_publicaciones", entidadId: pub.id, detalle: `${pub.nombre}: ${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"} por subir a Dropi` });
  revalidatePath("/publicaciones-dropi");
  return { aprobadas: fotos.length, dropi };
}

/** «Me sirvió» o «no me sirvió» (con el porqué): queda en lo generado y sirve de ejemplo para la IA. */
export async function valorarIA(iaId: string, util: boolean, nota: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof iaId !== "string" || !UUID.test(iaId)) return { error: "Resultado no válido." };
  const supabase = createServiceClient();
  const { data: fila } = await supabase.from("dropi_publicaciones_ia").select("id, publicacion_id, tipo, resultado").eq("id", iaId).maybeSingle();
  if (!fila) return { error: "No se encontró lo generado." };
  const pub = await publicacionPermitida(fila.publicacion_id as string, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  const resultado = { ...(fila.resultado as object), feedback: { util: !!util, nota: String(nota ?? "").trim().slice(0, 400) } };
  const { error } = await supabase.from("dropi_publicaciones_ia").update({ resultado, actualizado_en: new Date().toISOString() }).eq("id", iaId);
  if (error) return { error: "No se pudo guardar la valoración." };
  return {};
}

/**
 * «Investigar descripción y ángulos»: la IA investiga el producto en internet (Alibaba, Amazon, tiendas), mira su foto y propone una
 * descripción (con el mínimo de las reglas) y 4 ángulos de venta. Tarda de 30 a 120 segundos. Devuelve el error como valor.
 */
export async function proponerTextoIA(publicacionId: string): Promise<{ error?: string; guardado?: GuardadoIA<PropuestaTexto> }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  if (!proveedorTexto()) return { error: SIN_IA };
  const sinMigracion = await migracionLista();
  if (sinMigracion) return { error: sinMigracion };
  const { datos, contexto } = await cargarBase(pub);
  const r = await pedirIA({ ...pedidoTexto(datos, contexto), imagenes: pub.foto_url ? [pub.foto_url] : [] }, true, consumoDe("texto", usuario, pub));
  if ("error" in r) return { error: r.error };
  const propuesta = normalizarPropuestaTexto(r.texto, r.fuentes);
  if (!propuesta) return { error: "La IA no devolvió algo que se pueda usar. Vuelve a intentar." };
  const modelo = modeloDeTexto();
  const g = await guardar(pub.id, "texto", propuesta, modelo, usuario);
  if ("error" in g) return g;
  await registrarAuditoria({ accion: "ia_texto_publicacion", entidad: "dropi_publicaciones", entidadId: pub.id, detalle: `${pub.nombre}: descripción y ángulos (${modelo})` });
  return { guardado: { ...ahora(g.id, usuario, modelo), resultado: propuesta } };
}

/**
 * «Agregar fotos»: la IA mira la foto del producto y decide qué fotos le faltan a la publicación (principal, beneficios, uso,
 * comparación…) con la instrucción de cada una. Aún no se genera ninguna imagen: eso se hace una por una con `generarFotoIA`.
 */
export async function planearFotosIA(publicacionId: string): Promise<{ error?: string; guardado?: GuardadoIA<PlanFotosVista> }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  if (!proveedorTexto()) return { error: SIN_IA };
  const sinMigracion = await migracionLista();
  if (sinMigracion) return { error: sinMigracion };
  if (!pub.foto_url) return { error: "Ni la publicación ni su producto vinculado tienen foto: agrégala primero en su ficha o en la del producto." };
  const { datos, contexto, fotosFaltan } = await cargarBase(pub);
  const cantidad = Math.max(1, Math.min(MAX_FOTOS, fotosFaltan));
  const r = await pedirIA({ ...pedidoFotos(datos, contexto, cantidad), imagenes: [pub.foto_url] }, true, consumoDe("fotos_plan", usuario, pub));
  if ("error" in r) return { error: r.error };
  const plan = normalizarPlanFotos(r.texto, cantidad);
  if (!plan) return { error: "La IA no devolvió un plan que se pueda usar. Vuelve a intentar." };
  const modelo = modeloDeTexto();
  const g = await guardar(pub.id, "fotos", plan, modelo, usuario);
  if ("error" in g) return g;
  await registrarAuditoria({ accion: "ia_plan_fotos_publicacion", entidad: "dropi_publicaciones", entidadId: pub.id, detalle: `${pub.nombre}: ${plan.fotos.length} fotos por generar (${plan.fotos.map((f) => f.tipo).join(", ")})` });
  return { guardado: { ...ahora(g.id, usuario, modelo), resultado: conUrls(plan) } };
}

/** Lee la imagen con la IA de texto y comprueba que trae las líneas pedidas bien escritas. null si no se pudo comprobar (sin IA de texto o con error). */
async function textoBienEscrito(imagen: string, esperados: string[], consumo: ReturnType<typeof consumoDe>): Promise<{ ok: boolean; faltantes: string[] } | null> {
  if (!proveedorTexto()) return null;
  const r = await pedirIA({ ...pedidoLeerTexto(), imagenes: [imagen] }, false, consumo);
  if ("error" in r) return null;
  return compararTexto(esperados, textoLeido(r.texto));
}

/**
 * Genera con Gemini la foto `indice` de un plan (la reemplaza si ya tenía). Manda la foto del producto como referencia para que
 * salga igual. Se guarda en Storage (wms-productos/publicaciones/<id>/ia/). Tarda de 10 a 60 segundos.
 * Las fotos informativas (beneficios, ingredientes y cómo se usa) llevan el texto del plan o el que la persona dejó en `textosEditados`
 * (una línea cada uno): se limpia, se rechaza lo que promete curar o tratar algo, y la imagen generada se lee con la IA de texto para
 * comprobar que quedó bien escrita; si no, se genera una vez más avisando qué línea falló. `textoOk` dice cómo quedó (null: no se pudo comprobar).
 */
export async function generarFotoIA(iaId: string, indice: number, textosEditados?: string[]): Promise<{ error?: string; url?: string; textos?: string[]; textoOk?: boolean | null }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof iaId !== "string" || !UUID.test(iaId) || !Number.isInteger(indice) || indice < 0 || indice >= MAX_FOTOS) return { error: "Foto no válida." };
  if (!geminiConectado()) return { error: "Falta conectar Gemini (la clave GEMINI_API_KEY en Vercel)." };
  const supabase = createServiceClient();
  const { data: fila } = await supabase.from("dropi_publicaciones_ia").select("id, publicacion_id, tipo, resultado").eq("id", iaId).maybeSingle();
  if (!fila || fila.tipo !== "fotos") return { error: "No se encontró el plan de fotos." };
  const pub = await publicacionPermitida(fila.publicacion_id as string, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  const plan = fila.resultado as PlanFotos;
  const foto = plan.fotos?.[indice];
  if (!foto) return { error: "Esa foto ya no está en el plan." };
  if (!pub.foto_url) return { error: "Ni la publicación ni su producto vinculado tienen foto: agrégala primero en su ficha o en la del producto." };

  // El texto de una foto informativa: el que dejó la persona o, si no, el del plan.
  const textos = normalizarTextos(foto.tipo, Array.isArray(textosEditados) ? textosEditados : (foto.textos ?? []));
  const riesgosa = lineaRiesgosa(textos);
  if (riesgosa) return { error: `«${riesgosa}» promete curar, tratar o garantizar algo: escríbelo como apoyo o bienestar.` };

  // La foto del producto como referencia.
  const referencias: { mime: string; base64: string }[] = [];
  const d = await descargarPublico(pub.foto_url, 10 * 1024 * 1024);
  if ("bytes" in d) {
    const tipo = detectarImagen(d.bytes.slice(0, 64));
    if (tipo && tipo.tipo !== "image/gif") referencias.push({ mime: tipo.tipo, base64: Buffer.from(d.bytes).toString("base64") });
  }
  if (!referencias.length) return { error: "No se pudo leer la foto del producto." };

  const { estilos } = await cargarEstilos(supabase);
  const prompt = promptFoto({ nombre: pub.nombre }, { ...foto, textos }, referencias.length, estilos);
  const consumo = consumoDe("foto", usuario, pub);
  const primera = await generarImagen(prompt, referencias, "1:1", consumo);
  if ("error" in primera) {
    await marcarError(iaId, indice, primera.error);
    return { error: primera.error };
  }
  const aBytes = (base64: string) => new Uint8Array(Buffer.from(base64, "base64"));
  let bytes = aBytes(primera.base64);
  let tipoImg = detectarImagen(bytes.slice(0, 64));
  if (!tipoImg) return { error: "Gemini devolvió algo que no es una imagen." };

  // Con texto: se lee la imagen y se compara con lo pedido; si salió mal escrito, un segundo intento avisando qué línea falló.
  let textoOk: boolean | null = null;
  if (textos.length) {
    const leer = (base64: string, mime: string) => textoBienEscrito(`data:${mime};base64,${base64}`, textos, consumoDe("foto_texto", usuario, pub));
    let veredicto = await leer(primera.base64, tipoImg.tipo);
    if (veredicto && !veredicto.ok) {
      const segunda = await generarImagen(`${prompt}\n${avisoDeReintento(veredicto.faltantes)}`, referencias, "1:1", consumo);
      if (!("error" in segunda)) {
        const bytes2 = aBytes(segunda.base64);
        const tipo2 = detectarImagen(bytes2.slice(0, 64));
        if (tipo2) {
          bytes = bytes2;
          tipoImg = tipo2;
          veredicto = await leer(segunda.base64, tipo2.tipo);
        }
      }
    }
    textoOk = veredicto ? veredicto.ok : null;
  }

  const ruta = `publicaciones/${pub.id}/ia/${Date.now()}-${foto.tipo}.${tipoImg.extension}`;
  const { error: errorSubida } = await supabase.storage.from(BUCKET).upload(ruta, bytes, { contentType: tipoImg.tipo });
  if (errorSubida) return { error: "No se pudo guardar la imagen generada." };

  // Se vuelve a leer el plan: mientras Gemini trabajaba pudo generarse otra foto del mismo plan.
  const { data: fresca } = await supabase.from("dropi_publicaciones_ia").select("resultado").eq("id", iaId).maybeSingle();
  const actual = (fresca?.resultado ?? plan) as PlanFotos;
  const anterior = actual.fotos[indice]?.ruta ?? null;
  actual.fotos[indice] = { ...actual.fotos[indice], textos, textoOk, ruta, error: null };
  const { error } = await supabase.from("dropi_publicaciones_ia").update({ resultado: actual, actualizado_en: new Date().toISOString() }).eq("id", iaId);
  if (error) {
    await supabase.storage.from(BUCKET).remove([ruta]);
    return { error: "No se pudo guardar la imagen generada." };
  }
  // La imagen reemplazada ya no la usa nadie (solo vivía en este plan): se borra, y solo si es de esta carpeta.
  // Salvo que esa foto esté aprobada y esperando en la cola de «Aplicar en Dropi»: sin ella, ese cambio no podría subirla.
  if (anterior && anterior.startsWith(`publicaciones/${pub.id}/ia/`) && !(await fotoEnCola(pub.id, urlPublica(anterior)))) await supabase.storage.from(BUCKET).remove([anterior]);
  await registrarAuditoria({ accion: "ia_foto_publicacion", entidad: "dropi_publicaciones", entidadId: pub.id, detalle: `${pub.nombre}: foto «${foto.titulo}» (${modeloImagen()})${textos.length ? ` con texto ${textoOk === true ? "verificado" : textoOk === false ? "por revisar" : "sin verificar"}` : ""}` });
  return { url: urlPublica(ruta), textos, textoOk };
}

/** Anota en el plan por qué falló una foto, para verlo sin volver a pedirla. */
async function marcarError(iaId: string, indice: number, mensaje: string) {
  const supabase = createServiceClient();
  const { data } = await supabase.from("dropi_publicaciones_ia").select("resultado").eq("id", iaId).maybeSingle();
  const plan = data?.resultado as PlanFotos | undefined;
  if (!plan?.fotos?.[indice]) return;
  plan.fotos[indice] = { ...plan.fotos[indice], error: mensaje.slice(0, 300) };
  await supabase.from("dropi_publicaciones_ia").update({ resultado: plan, actualizado_en: new Date().toISOString() }).eq("id", iaId);
}
