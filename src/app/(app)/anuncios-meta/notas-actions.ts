"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { esCierre, pospuestaHasta, revisarNota, type CierreNota, type NotaMeta } from "@/lib/meta-ads/notas";
import { hoyEnPanama } from "@/lib/meta-ads/sincronizar";
import { getPaisActual } from "@/lib/pais";
import { exigirAcceso } from "@/lib/seguridad/exigir-acceso";
import { createServiceClient } from "@/lib/supabase/server";

// Notas de Anuncios Meta (26 nov 2026, pedido de Hernán; migración 0370). Son del país elegido en la barra, para quien abre Anuncios Meta; escribe quien lo tiene con edición.

const MODULO = "anuncios-meta";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_MIGRACION = "Falta correr en Supabase la migración 0370 (notas de Anuncios Meta).";
const errorDe = (m: string | undefined, porDefecto: string) => (m && /meta_notas|schema cache|does not exist/i.test(m) ? SIN_MIGRACION : porDefecto);
const COLUMNAS = "id, texto, origen_clave, origen_texto, estado, pospuesta_hasta, creado_por_nombre, creado_en, cerrado_por_nombre, cerrado_en";

type Fila = { id: string; texto: string; origen_clave: string | null; origen_texto: string | null; estado: NotaMeta["estado"]; pospuesta_hasta: string | null; creado_por_nombre: string | null; creado_en: string; cerrado_por_nombre: string | null; cerrado_en: string | null };
const aNota = (f: Fila): NotaMeta => ({ id: f.id, texto: f.texto, origenClave: f.origen_clave, origenTexto: f.origen_texto, estado: f.estado, pospuestaHasta: f.pospuesta_hasta, creadoPorNombre: f.creado_por_nombre, creadoEn: f.creado_en, cerradoPorNombre: f.cerrado_por_nombre, cerradoEn: f.cerrado_en });

type Resultado = { ok: true } | { error: string };

/** Las notas del país de la barra (las últimas 200) y si quien mira puede escribir. */
export async function listarNotasMeta(): Promise<{ notas: NotaMeta[]; hoy: string; escribe: boolean; pais: string } | { error: string }> {
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const acceso = await exigirAcceso({ modulo: MODULO, paisId: pais.id });
  if (acceso.error !== undefined) return { error: acceso.error };
  const { data, error } = await supabase.from("meta_notas").select(COLUMNAS).eq("pais_id", pais.id).order("creado_en", { ascending: false }).limit(200);
  if (error) return { error: errorDe(error.message, "No se pudieron leer las notas.") };
  return { notas: ((data ?? []) as Fila[]).map(aNota), hoy: hoyEnPanama(), escribe: !acceso.usuario.modulosSoloLectura.includes(MODULO), pais: pais.nombre };
}

/** Una nota nueva, en el país de la barra. Si se anotó desde una sugerencia, guarda su llave y su texto. */
export async function crearNotaMeta(entrada: { texto?: unknown; origenClave?: unknown; origenTexto?: unknown }): Promise<Resultado> {
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const acceso = await exigirAcceso({ modulo: MODULO, escritura: true, paisId: pais.id });
  if (acceso.error !== undefined) return { error: acceso.error };
  const r = revisarNota(entrada ?? {});
  if ("error" in r) return r;
  const u = acceso.usuario;
  const { data, error } = await supabase
    .from("meta_notas")
    .insert({ pais_id: pais.id, texto: r.texto, origen_clave: r.origenClave, origen_texto: r.origenTexto, creado_por: u.id, creado_por_nombre: u.nombre ?? u.email ?? null })
    .select("id")
    .single();
  if (error || !data) return { error: errorDe(error?.message, "No se pudo guardar la nota.") };
  await registrarAuditoria({ accion: "crear_nota_meta", entidad: "meta_notas", entidadId: data.id as string, detalle: r.texto.slice(0, 200) });
  return { ok: true };
}

/** Cierra una nota con uno de los tres botones, o la vuelve a abrir (`null`). Solo notas del país de la persona. */
export async function cerrarNotaMeta(id: string, estado: CierreNota | null): Promise<Resultado> {
  if (!UUID.test(String(id))) return { error: "Esa nota no existe." };
  if (estado !== null && !esCierre(estado)) return { error: "Acción no válida." };
  const acceso = await exigirAcceso({ modulo: MODULO, escritura: true, filaDePais: { tabla: "meta_notas", id } });
  if (acceso.error !== undefined) return { error: acceso.error };
  const u = acceso.usuario;
  const cambio =
    estado === null
      ? { estado: "abierta", pospuesta_hasta: null, cerrado_por: null, cerrado_por_nombre: null, cerrado_en: null }
      : { estado, pospuesta_hasta: estado === "pospuesta" ? pospuestaHasta(hoyEnPanama()) : null, cerrado_por: u.id, cerrado_por_nombre: u.nombre ?? u.email ?? null, cerrado_en: new Date().toISOString() };
  const { data, error } = await createServiceClient().from("meta_notas").update(cambio).eq("id", id).select("id");
  if (error) return { error: errorDe(error.message, "No se pudo guardar.") };
  if (!data?.length) return { error: "Esa nota ya no existe." };
  await registrarAuditoria({ accion: "cerrar_nota_meta", entidad: "meta_notas", entidadId: id, detalle: estado ?? "reabierta" });
  return { ok: true };
}
