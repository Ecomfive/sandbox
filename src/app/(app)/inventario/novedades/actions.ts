"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { createServiceClient } from "@/lib/supabase/server";
import { quienesAutorizan } from "@/lib/wms/correccion-remision";
import { ETIQUETA_ESTADO_NOVEDAD, ETIQUETA_TIPO_NOVEDAD, motivoNoResolver, numeroNovedad, resultadoValido, revisarNovedad, type EstadoNovedad, type TipoNovedad } from "@/lib/wms/novedades";
import { PAISES_CON_RECEPCION } from "@/lib/wms/recepcion";

const RUTA = "/inventario/novedades";
const BUCKET = "wms-productos";
const ES_ID = /^[0-9a-fA-F-]{8,64}$/;
const FALTA_MIGRACION = "Falta correr la migración 0243 en la base.";
const urlPublica = (ruta: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta}`;

/** Da permiso para subir directo a Storage la foto de un dañado. */
export async function prepararFotoNovedad(nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  await requireModuloEscritura("inventario");
  const nombre = String(nombreArchivo ?? "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "foto";
  const ruta = `novedades/${crypto.randomUUID()}/${Date.now()}-${nombre}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No se pudo preparar la subida de la foto." };
  return { ruta, token: data.token };
}

async function avisar(supabase: ReturnType<typeof createServiceClient>, personas: string[], titulo: string, texto: string, autor: { id: string; nombre: string }) {
  if (!personas.length) return;
  await supabase.from("notificaciones_usuario").insert(personas.map((usuario_id) => ({ usuario_id, tipo: "remision", titulo, texto: texto.slice(0, 500), href: RUTA, autor_id: autor.id, autor_nombre: autor.nombre })));
}

/** Reporta un dañado o una devolución en una plataforma. No cambia ningún stock: queda por revisar y, si es un dañado, les llega el aviso a quienes autorizan. */
export async function crearNovedad(datos: Record<string, unknown>): Promise<{ error?: string; numero?: string }> {
  const usuario = await requireModuloEscritura("inventario");
  const n = revisarNovedad(datos);
  if ("error" in n) return n;
  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, n.bodega))) return { error: "No tienes acceso al país de esa plataforma." };
  const { data: bodega } = await supabase.from("wms_bodegas").select("nombre, tipo, activa, pais_id, paises(codigo)").eq("id", n.bodega).maybeSingle();
  const pais = bodega?.paises as { codigo: string } | { codigo: string }[] | null | undefined;
  if (!bodega || bodega.tipo !== "externa" || !bodega.activa) return { error: "Elige una plataforma activa." };
  if (!PAISES_CON_RECEPCION.includes((Array.isArray(pais) ? pais[0] : pais)?.codigo ?? "")) return { error: "Esto por ahora es solo para Costa Rica." };
  const { data: sku } = await supabase.from("skus_maestros").select("codigo").eq("id", n.sku).maybeSingle();
  if (!sku) return { error: "El producto no existe." };

  // El navegador no decide qué se sube: se revisa por su contenido.
  if (n.foto) {
    const { data: archivo, error } = await supabase.storage.from(BUCKET).download(n.foto);
    if (error || !archivo) return { error: "No se encontró la foto: vuelve a subirla." };
    if (!detectarImagen(new Uint8Array(await archivo.slice(0, 64).arrayBuffer()))) return { error: "El archivo no es una imagen." };
  }
  let autoriza: string[] = [];
  if (n.tipo === "danado") {
    const { data: autorizadores, error } = await supabase.from("wms_autorizadores_remision").select("perfil_id, pais_id");
    if (error) return { error: "No se pudo saber quién autoriza." };
    autoriza = quienesAutorizan(autorizadores ?? [], bodega.pais_id as string, usuario.id);
    if (!autoriza.length) return { error: "No hay quién confirme este dañado." };
  }
  const nombre = usuario.nombre || usuario.email;
  const { data, error } = await supabase
    .from("wms_novedades_plataforma")
    .insert({
      pais_id: bodega.pais_id,
      bodega_id: n.bodega,
      sku_maestro_id: n.sku,
      tipo: n.tipo,
      cantidad: n.cantidad,
      referencia: n.referencia,
      nota: n.nota,
      foto_url: n.foto ? urlPublica(n.foto) : null,
      retorno_oficina: n.retornoOficina,
      autoriza_a: autoriza,
      creado_por: usuario.id,
      creado_por_nombre: nombre,
    })
    .select("id, numero")
    .single();
  if (error || !data) return { error: error?.code === "42P01" || error?.code === "PGRST205" ? FALTA_MIGRACION : "No se pudo guardar." };
  const numero = numeroNovedad(data.numero as number);
  const que = `${ETIQUETA_TIPO_NOVEDAD[n.tipo]} · ${sku.codigo} · ${n.cantidad} u. en ${bodega.nombre}`;
  await avisar(supabase, autoriza, `Dañado por confirmar: ${numero}`, `${que}. Lo reportó ${nombre}.`, { id: usuario.id, nombre });
  await registrarAuditoria({ accion: "novedad_plataforma", entidad: "wms_novedades_plataforma", entidadId: data.id as string, detalle: `${numero}: ${que}` });
  revalidatePath(RUTA);
  revalidatePath("/inventario/cuadro");
  return { numero };
}

/** Resuelve una novedad. La condición sobre el estado evita que dos personas la resuelvan a la vez. */
export async function resolverNovedad(id: string, resultado: unknown, nota: unknown): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID.test(id)) return { error: "Novedad no válida." };
  const supabase = createServiceClient();
  const { data: f } = await supabase.from("wms_novedades_plataforma").select("numero, tipo, estado, autoriza_a, creado_por, bodega_id, cantidad").eq("id", id).maybeSingle();
  if (!f) return { error: "Esa novedad ya no existe." };
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, f.bodega_id as string))) return { error: "No tienes acceso al país de esa plataforma." };
  const tipo = f.tipo as TipoNovedad;
  if (!resultadoValido(tipo, resultado)) return { error: "Resultado no válido." };
  const motivo = motivoNoResolver({ tipo, estado: f.estado as EstadoNovedad, autorizaA: (f.autoriza_a as string[] | null) ?? [], creadoPor: (f.creado_por as string | null) ?? null }, usuario.id);
  if (motivo) return { error: motivo };
  const texto = typeof nota === "string" ? nota.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const { data, error } = await supabase
    .from("wms_novedades_plataforma")
    .update({ estado: resultado, resuelto_por: usuario.id, resuelto_por_nombre: usuario.nombre || usuario.email, resuelto_en: new Date().toISOString(), nota_resolucion: texto || null })
    .eq("id", id)
    .eq("estado", "por_revisar")
    .select("id");
  if (error) return { error: "No se pudo guardar." };
  if (!data?.length) return { error: "Esa novedad ya se resolvió." };
  await registrarAuditoria({ accion: "novedad_plataforma_resuelta", entidad: "wms_novedades_plataforma", entidadId: id, detalle: `${numeroNovedad(f.numero as number)}: ${ETIQUETA_ESTADO_NOVEDAD[resultado]}${texto ? ` · ${texto}` : ""}` });
  revalidatePath(RUTA);
  revalidatePath("/inventario/cuadro");
  return {};
}
