"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { cargarNuestrosEnDropi } from "@/lib/publicaciones/competencia-publicaciones";
import { normalizarPlanFotos, normalizarPropuestaTexto, pedidoFotos, pedidoTexto, promptFoto, MAX_FOTOS, type DatosPublicacionIA, type PlanFotos, type PropuestaTexto, type TipoIA } from "@/lib/publicaciones/ia/asistente";
import { openaiConectado, modeloTexto, pedirTexto } from "@/lib/publicaciones/ia/openai-api";
import { revisarPublicacion } from "@/lib/publicaciones/optimizacion";
import { cargarReglas } from "@/lib/publicaciones/reglas-datos";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { descargarPublico } from "@/lib/seguridad/url-externa";
import { createServiceClient } from "@/lib/supabase/server";
import { geminiConectado, generarImagen, modeloImagen } from "@/lib/landings/gemini-api";

const MODULO = "publicaciones-dropi";
const BUCKET = "wms-productos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const faltaMigracion = (m: string) => /does not exist|schema cache|relation/i.test(m);
const SIN_MIGRACION = "Falta correr en Supabase la migración 0131.";
const urlPublica = (ruta: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta}`;
const idsDropi = (dropiId: string | null) => (String(dropiId ?? "").match(/\d{3,6}/g) ?? []).map(Number);

export interface EstadoIA {
  openai: boolean;
  gemini: boolean;
}

/** Qué está conectado: sin la clave de OpenAI no se investiga el texto; sin la de Gemini no se generan fotos. */
export async function estadoAsistenteIA(): Promise<EstadoIA> {
  await requireModulo(MODULO);
  return { openai: openaiConectado(), gemini: geminiConectado() };
}

/** Un resultado guardado (lo último que se generó para esa publicación y tipo). */
export interface GuardadoIA<T> {
  id: string;
  creadoEn: string;
  por: string;
  modelo: string | null;
  resultado: T;
}

/** El plan de fotos con la dirección pública de cada imagen ya generada. */
export interface PlanFotosVista extends Omit<PlanFotos, "fotos"> {
  fotos: (PlanFotos["fotos"][number] & { url: string | null })[];
}

export interface AsistenteVista {
  texto: GuardadoIA<PropuestaTexto> | null;
  fotos: GuardadoIA<PlanFotosVista> | null;
}

const conUrls = (p: PlanFotos): PlanFotosVista => ({ ...p, fotos: p.fotos.map((f) => ({ ...f, url: f.ruta ? urlPublica(f.ruta) : null })) });

type FilaIA = { id: string; tipo: string; resultado: unknown; modelo: string | null; creado_por_nombre: string | null; creado_en: string };

/** La publicación, si existe y es de un país que la persona puede ver. */
async function publicacionPermitida(id: string, usuario: UsuarioActual) {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("dropi_publicaciones").select("id, nombre, dropi_id, pais_id, precio_venta, foto_url, sku_maestro_id").eq("id", id).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, data.pais_id as string))) return null;
  return data as { id: string; nombre: string; dropi_id: string | null; pais_id: string; precio_venta: number | null; foto_url: string | null; sku_maestro_id: string | null };
}

/** Lo último que se generó para una publicación (texto y fotos). Basta poder abrir el módulo. */
export async function obtenerAsistenteIA(publicacionId: string): Promise<AsistenteVista | { error: string }> {
  const usuario = await requireModulo(MODULO);
  if (!(await publicacionPermitida(publicacionId, usuario))) return { error: "No se encontró la publicación." };
  const { data, error } = await createServiceClient()
    .from("dropi_publicaciones_ia")
    .select("id, tipo, resultado, modelo, creado_por_nombre, creado_en")
    .eq("publicacion_id", publicacionId)
    .order("creado_en", { ascending: false })
    .limit(20);
  if (error) return { error: faltaMigracion(error.message) ? SIN_MIGRACION : "No se pudo cargar lo que generó la IA." };
  const filas = (data ?? []) as FilaIA[];
  const ultimo = (tipo: TipoIA) => filas.find((f) => f.tipo === tipo);
  const guardado = <T,>(f: FilaIA | undefined, resultado: T | null): GuardadoIA<T> | null => (f && resultado ? { id: f.id, creadoEn: f.creado_en, por: f.creado_por_nombre ?? "", modelo: f.modelo, resultado } : null);
  const t = ultimo("texto");
  const f = ultimo("fotos");
  return {
    texto: guardado(t, t ? (t.resultado as PropuestaTexto) : null),
    fotos: guardado(f, f ? conUrls(f.resultado as PlanFotos) : null),
  };
}

/** Los datos de la publicación para el pedido: lo que se ve en Dropi y lo que le falta (la misma revisión de «Optimización»). */
async function datosParaIA(pub: NonNullable<Awaited<ReturnType<typeof publicacionPermitida>>>): Promise<{ datos: DatosPublicacionIA; fotoUrl: string | null; fotosFaltan: number }> {
  const supabase = createServiceClient();
  const [{ data: pais }, enDropi, { reglas }, sku] = await Promise.all([
    supabase.from("paises").select("nombre").eq("id", pub.pais_id).maybeSingle(),
    cargarNuestrosEnDropi(supabase, pub.pais_id),
    cargarReglas(supabase),
    pub.sku_maestro_id ? supabase.from("skus_maestros").select("codigo, nombre").eq("id", pub.sku_maestro_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const cat = idsDropi(pub.dropi_id).map((n) => enDropi.get(n)).find((x) => !!x) ?? null;
  const revisiones = revisarPublicacion(
    {
      titulo: cat?.nombre ?? pub.nombre,
      categoria: cat?.categoria ?? null,
      precio: cat?.precio ?? (pub.precio_venta === null ? null : Number(pub.precio_venta)),
      precioSugerido: cat?.precioSugerido ?? null,
      fotos: cat?.fotos ?? null,
      videos: cat?.videos ?? null,
      descripcionLargo: cat?.descripcionLargo ?? null,
      leidoEnDropi: !!cat,
    },
    reglas,
  );
  const s = sku.data as { codigo: string; nombre: string } | null;
  return {
    datos: {
      nombre: pub.nombre,
      tituloDropi: cat?.nombre ?? null,
      categoria: cat?.categoria ?? null,
      pais: (pais?.nombre as string | undefined) ?? "",
      precio: pub.precio_venta === null ? null : Number(pub.precio_venta),
      producto: s ? `${s.codigo} · ${s.nombre}` : null,
      faltas: revisiones.filter((x) => x.estado === "falta" || x.estado === "revisar").map((x) => `${x.etiqueta}: ${x.detalle}`),
      minDescripcion: reglas.min_descripcion,
    },
    fotoUrl: pub.foto_url,
    // Cuántas fotos faltan para el mínimo de las reglas (si se leyó el catálogo); sin dato, 4.
    fotosFaltan: cat?.fotos == null ? 4 : Math.max(1, reglas.min_fotos - cat.fotos),
  };
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

/**
 * «Mejorar el título / la descripción / ángulos de venta»: la IA investiga el producto en internet (Alibaba, Amazon, tiendas), mira
 * su foto y propone 3 títulos, una descripción y 4 ángulos de venta. Queda guardado en la publicación; subirlo a Dropi es a mano.
 * Tarda de 30 a 120 segundos. Devuelve el error como valor.
 */
export async function proponerTextoIA(publicacionId: string): Promise<{ error?: string; guardado?: GuardadoIA<PropuestaTexto> }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  if (!openaiConectado()) return { error: "Falta conectar OpenAI (la clave OPENAI_API_KEY en Vercel)." };
  const { datos, fotoUrl } = await datosParaIA(pub);
  const r = await pedirTexto({ ...pedidoTexto(datos), imagenes: fotoUrl ? [fotoUrl] : [] }, true);
  if ("error" in r) return { error: r.error };
  const propuesta = normalizarPropuestaTexto(r.texto, r.fuentes);
  if (!propuesta) return { error: "La IA no devolvió algo que se pueda usar. Vuelve a intentar." };
  const g = await guardar(pub.id, "texto", propuesta, modeloTexto(), usuario);
  if ("error" in g) return g;
  await registrarAuditoria({ accion: "ia_texto_publicacion", entidad: "dropi_publicaciones", entidadId: pub.id, detalle: `${pub.nombre}: títulos, descripción y ángulos (${modeloTexto()})` });
  return { guardado: { id: g.id, creadoEn: new Date().toISOString(), por: usuario.nombre || usuario.email, modelo: modeloTexto(), resultado: propuesta } };
}

/**
 * «Agregar fotos»: la IA mira la foto del producto y decide qué fotos le faltan a la publicación (principal, beneficios, uso,
 * comparación…) con la instrucción de cada una. Aún no se genera ninguna imagen: eso se hace una por una con `generarFotoIA`.
 */
export async function planearFotosIA(publicacionId: string): Promise<{ error?: string; guardado?: GuardadoIA<PlanFotosVista> }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario);
  if (!pub) return { error: "No se encontró la publicación." };
  if (!openaiConectado()) return { error: "Falta conectar OpenAI (la clave OPENAI_API_KEY en Vercel)." };
  if (!pub.foto_url) return { error: "La publicación no tiene foto del producto: agrégala primero en su ficha." };
  const { datos, fotosFaltan } = await datosParaIA(pub);
  const cantidad = Math.max(1, Math.min(MAX_FOTOS, fotosFaltan));
  const r = await pedirTexto({ ...pedidoFotos(datos, cantidad), imagenes: [pub.foto_url] }, true);
  if ("error" in r) return { error: r.error };
  const plan = normalizarPlanFotos(r.texto, cantidad);
  if (!plan) return { error: "La IA no devolvió un plan que se pueda usar. Vuelve a intentar." };
  const g = await guardar(pub.id, "fotos", plan, modeloTexto(), usuario);
  if ("error" in g) return g;
  await registrarAuditoria({ accion: "ia_plan_fotos_publicacion", entidad: "dropi_publicaciones", entidadId: pub.id, detalle: `${pub.nombre}: ${plan.fotos.length} fotos por generar (${plan.fotos.map((f) => f.tipo).join(", ")})` });
  return { guardado: { id: g.id, creadoEn: new Date().toISOString(), por: usuario.nombre || usuario.email, modelo: modeloTexto(), resultado: conUrls(plan) } };
}

/**
 * Genera con Gemini la foto `indice` de un plan (la reemplaza si ya tenía). Manda la foto del producto como referencia para que
 * salga igual. Se guarda en Storage (wms-productos/publicaciones/<id>/ia/). Tarda de 10 a 60 segundos.
 */
export async function generarFotoIA(iaId: string, indice: number): Promise<{ error?: string; url?: string }> {
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
  if (!pub.foto_url) return { error: "La publicación no tiene foto del producto: agrégala primero en su ficha." };

  // La foto del producto como referencia (y, si ya hay otras generadas, hasta completar las que acepta el modelo).
  const referencias: { mime: string; base64: string }[] = [];
  const d = await descargarPublico(pub.foto_url, 10 * 1024 * 1024);
  if ("bytes" in d) {
    const tipo = detectarImagen(d.bytes.slice(0, 64));
    if (tipo && tipo.tipo !== "image/gif") referencias.push({ mime: tipo.tipo, base64: Buffer.from(d.bytes).toString("base64") });
  }
  if (!referencias.length) return { error: "No se pudo leer la foto del producto." };

  const prompt = promptFoto({ nombre: pub.nombre }, foto, referencias.length);
  const r = await generarImagen(prompt, referencias, "1:1");
  if ("error" in r) {
    await marcarError(iaId, indice, r.error);
    return { error: r.error };
  }
  const bytes = new Uint8Array(Buffer.from(r.base64, "base64"));
  const tipoImg = detectarImagen(bytes.slice(0, 64));
  if (!tipoImg) return { error: "Gemini devolvió algo que no es una imagen." };
  const ruta = `publicaciones/${pub.id}/ia/${Date.now()}-${foto.tipo}.${tipoImg.extension}`;
  const { error: errorSubida } = await supabase.storage.from(BUCKET).upload(ruta, bytes, { contentType: tipoImg.tipo });
  if (errorSubida) return { error: "No se pudo guardar la imagen generada." };

  // Se vuelve a leer el plan: mientras Gemini trabajaba pudo generarse otra foto del mismo plan.
  const { data: fresca } = await supabase.from("dropi_publicaciones_ia").select("resultado").eq("id", iaId).maybeSingle();
  const actual = ((fresca?.resultado ?? plan) as PlanFotos);
  const anterior = actual.fotos[indice]?.ruta ?? null;
  actual.fotos[indice] = { ...actual.fotos[indice], ruta, error: null };
  const { error } = await supabase.from("dropi_publicaciones_ia").update({ resultado: actual, actualizado_en: new Date().toISOString() }).eq("id", iaId);
  if (error) {
    await supabase.storage.from(BUCKET).remove([ruta]);
    return { error: "No se pudo guardar la imagen generada." };
  }
  // La imagen reemplazada ya no la usa nadie (solo vivía en este plan): se borra, y solo si es de esta carpeta.
  if (anterior && anterior.startsWith(`publicaciones/${pub.id}/ia/`)) await supabase.storage.from(BUCKET).remove([anterior]);
  await registrarAuditoria({ accion: "ia_foto_publicacion", entidad: "dropi_publicaciones", entidadId: pub.id, detalle: `${pub.nombre}: foto «${foto.titulo}» (${modeloImagen()})` });
  return { url: urlPublica(ruta) };
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
