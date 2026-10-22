"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { DECISIONES, TIPOS_RECOMENDACION, vigenteHasta, type Decision } from "@/lib/publicaciones/recomendaciones";
import { REGLAS, leerValorRegla, mostrarRegla, revisarReglas, type ClaveRegla, type Reglas } from "@/lib/publicaciones/reglas";
import { cargarReglas } from "@/lib/publicaciones/reglas-datos";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
const corto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const faltaMigracion = (m: string) => /does not exist|schema cache|relation/i.test(m);

/** Lo que dice la recomendación lo manda el navegador: se guarda solo texto corto y números, como foto de lo que se vio. */
function limpiarRecomendacion(r: unknown) {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  const datos: Record<string, number | string | null> = {};
  const crudos = o.datos && typeof o.datos === "object" ? (o.datos as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(crudos).slice(0, 20)) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) datos[k] = v;
    else if (typeof v === "string") datos[k] = v.slice(0, 120);
    else if (v === null) datos[k] = null;
  }
  return { titulo: corto(o.titulo, 300), motivo: corto(o.motivo, 600), resultado: corto(o.resultado, 600), datos };
}

/**
 * Acepta, rechaza o pospone una recomendación de una publicación, con el porqué de la persona (obligatorio al rechazar). Queda en
 * `dropi_publicaciones_decisiones` con lo que decía la recomendación y el precio y margen de ese momento, y en la actividad de la
 * publicación. La recomendación deja de verse hasta `vigente_hasta`.
 */
export async function decidirRecomendacion(entrada: { publicacionId: string; recomendacion: unknown; decision: string; nota: string; dias?: number }): Promise<{ error?: string }> {
  let usuario;
  try {
    usuario = await requireModuloEscritura(MODULO);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sin permiso." };
  }
  const { publicacionId } = entrada;
  if (typeof publicacionId !== "string" || !UUID.test(publicacionId)) return { error: "Publicación no válida." };
  const decision = DECISIONES.find((d) => d.valor === entrada.decision)?.valor as Decision | undefined;
  if (!decision) return { error: "Decisión no válida." };
  const rec = limpiarRecomendacion(entrada.recomendacion);
  const tipo = corto((entrada.recomendacion as { tipo?: unknown } | null)?.tipo, 40);
  if (!TIPOS_RECOMENDACION.some((t) => t.valor === tipo)) return { error: "Recomendación no válida." };
  const nota = corto(entrada.nota, 1000);
  if (decision === "rechazada" && !nota) return { error: "Escribe por qué la rechazas." };

  const supabase = createServiceClient();
  const { data: pub } = await supabase.from("dropi_publicaciones").select("id, nombre, pais_id, precio_venta, margen").eq("id", publicacionId).maybeSingle();
  if (!pub || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pub.pais_id as string))) return { error: "No se encontró la publicación." };

  const dia = hoy();
  const hasta = vigenteHasta(decision, dia, entrada.dias);
  const { error } = await supabase.from("dropi_publicaciones_decisiones").insert({
    publicacion_id: publicacionId,
    tipo,
    decision,
    nota: nota || null,
    recomendacion: { tipo, ...rec, actual: { precio: pub.precio_venta === null ? null : Number(pub.precio_venta), margen: pub.margen === null ? null : Number(pub.margen) } },
    vigente_hasta: hasta,
    usuario_id: usuario.id,
    usuario_nombre: usuario.nombre ?? usuario.email ?? null,
  });
  if (error) return { error: faltaMigracion(error.message) ? "Falta correr en Supabase la migración 0127." : `No se pudo guardar: ${error.message}` };

  const etiqueta = DECISIONES.find((d) => d.valor === decision)!.etiqueta;
  await registrarAuditoria({
    accion: "decidir_recomendacion_publicacion",
    entidad: "dropi_publicaciones",
    entidadId: publicacionId,
    detalle: `Recomendación ${etiqueta.toLowerCase()}: ${rec.titulo || tipo}${decision === "pospuesta" ? ` (hasta el ${hasta})` : ""}${nota ? ` · «${nota}»` : ""}`,
  });
  revalidatePath("/publicaciones-dropi");
  revalidatePath("/publicaciones-dropi/recomendaciones");
  return {};
}

/** Guarda los umbrales de la pantalla Reglas: solo los que cambiaron, con quién y cuándo, y una línea en la auditoría. */
export async function guardarReglas(_previo: { error?: string; ok?: boolean } | null, f: FormData): Promise<{ error?: string; ok?: boolean }> {
  let usuario;
  try {
    usuario = await requireModuloEscritura(MODULO);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sin permiso." };
  }
  const supabase = createServiceClient();
  const actuales = await cargarReglas(supabase);
  if (!actuales.disponible) return { error: "Falta correr en Supabase la migración 0127." };

  const nuevas: Reglas = { ...actuales.reglas };
  for (const d of REGLAS) {
    const t = f.get(d.clave);
    if (typeof t !== "string") continue;
    const r = leerValorRegla(d.clave, t);
    if ("error" in r) return { error: r.error };
    nuevas[d.clave] = r.valor;
  }
  const incoherente = revisarReglas(nuevas);
  if (incoherente) return { error: incoherente };

  const cambiadas = REGLAS.filter((d) => Math.abs(nuevas[d.clave] - actuales.reglas[d.clave]) > 1e-9);
  if (!cambiadas.length) return { ok: true };
  const ahora = new Date().toISOString();
  const { error } = await supabase.from("dropi_publicaciones_reglas").upsert(
    cambiadas.map((d) => ({ clave: d.clave, valor: nuevas[d.clave], actualizado_en: ahora, actualizado_por: usuario.id, actualizado_por_nombre: usuario.nombre ?? usuario.email ?? null })),
  );
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  const ver = (c: ClaveRegla, v: number) => mostrarRegla(REGLAS.find((d) => d.clave === c)!, v);
  await registrarAuditoria({
    accion: "editar_reglas_publicaciones",
    entidad: "dropi_publicaciones_reglas",
    antes: Object.fromEntries(cambiadas.map((d) => [d.etiqueta, ver(d.clave, actuales.reglas[d.clave])])),
    despues: Object.fromEntries(cambiadas.map((d) => [d.etiqueta, ver(d.clave, nuevas[d.clave])])),
  });
  revalidatePath("/publicaciones-dropi", "layout");
  return { ok: true };
}
