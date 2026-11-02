"use server";

import { montoDePais } from "@/lib/moneda/simbolo";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { DECISIONES, MAX_COMPETIDORES_RECOMENDACION, TIPOS_RECOMENDACION, etiquetaRecomendacion, sumarDias, vigenteHasta, type Decision } from "@/lib/publicaciones/recomendaciones";
import { REGLAS, leerValorRegla, mostrarRegla, revisarReglas, type ClaveRegla, type Reglas } from "@/lib/publicaciones/reglas";
import { encolarCambio, enviarPrecioADropi } from "@/lib/publicaciones/cambios-dropi";
import { cargarReglas } from "@/lib/publicaciones/reglas-datos";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPublicaciones } from "./datos-publicaciones";

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
  // Los competidores que se vieron al decidir (subir o bajar el precio), limpios: quedan guardados con la decisión.
  const competidores = (Array.isArray(o.competidores) ? o.competidores : [])
    .slice(0, MAX_COMPETIDORES_RECOMENDACION)
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : {}))
    .map((c) => ({ proveedor: corto(c.proveedor, 120), nombre: corto(c.nombre, 200), precio: Number(c.precio), stock: Number(c.stock), vendido30: Number(c.vendido30) }))
    .filter((c) => c.proveedor && [c.precio, c.stock, c.vendido30].every((n) => Number.isFinite(n) && n >= 0 && n < 1e7));
  return { titulo: corto(o.titulo, 300), motivo: corto(o.motivo, 600), resultado: corto(o.resultado, 600), datos, ...(competidores.length ? { competidores } : {}) };
}

/**
 * Acepta, rechaza o pospone una recomendación de una publicación, con el porqué de la persona (obligatorio al rechazar). Queda en
 * `dropi_publicaciones_decisiones` con lo que decía la recomendación y el precio y margen de ese momento, y en la actividad de la
 * publicación. La recomendación deja de verse hasta `vigente_hasta`.
 */
export async function decidirRecomendacion(entrada: { publicacionId: string; recomendacion: unknown; decision: string; nota: string; dias?: number; responsableId?: string | null }): Promise<{ error?: string; dropi?: string }> {
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
  const { data: pub } = await supabase.from("dropi_publicaciones").select("id, nombre, pais_id, dropi_id, precio_venta, margen").eq("id", publicacionId).maybeSingle();
  if (!pub || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pub.pais_id as string))) return { error: "No se encontró la publicación." };
  const { data: paisPub } = await supabase.from("paises").select("codigo").eq("id", pub.pais_id).maybeSingle();
  const codigoPub = String(paisPub?.codigo ?? "PA");

  const dia = hoy();
  const hasta = vigenteHasta(decision, dia, entrada.dias);

  // Aceptada = una tarea (migración 0128): con responsable (el elegido, o quien acepta) y un plazo según las reglas.
  let tarea: Record<string, unknown> = {};
  let responsable: { id: string; nombre: string } | null = null;
  if (decision === "aceptada") {
    const pedido = typeof entrada.responsableId === "string" && UUID.test(entrada.responsableId) ? entrada.responsableId : usuario.id;
    const { data: perfil } = await supabase.from("perfiles").select("id, nombre, email, activo").eq("id", pedido).maybeSingle();
    if (!perfil || perfil.activo === false) return { error: "La persona elegida no está activa." };
    responsable = { id: perfil.id as string, nombre: ((perfil.nombre as string | null) || (perfil.email as string | null) || "").trim() };
    const { reglas } = await cargarReglas(supabase);
    tarea = { responsable_id: responsable.id, responsable_nombre: responsable.nombre, plazo: sumarDias(dia, reglas.dias_plazo) };
  }
  const fila = {
    publicacion_id: publicacionId,
    tipo,
    decision,
    nota: nota || null,
    recomendacion: { tipo, ...rec, actual: { precio: pub.precio_venta === null ? null : Number(pub.precio_venta), margen: pub.margen === null ? null : Number(pub.margen) } },
    vigente_hasta: hasta,
    usuario_id: usuario.id,
    usuario_nombre: usuario.nombre ?? usuario.email ?? null,
  };
  let { error } = await supabase.from("dropi_publicaciones_decisiones").insert({ ...fila, ...tarea });
  // Sin la migración 0128 no hay columnas de tarea: se guarda la decisión igual.
  if (error && Object.keys(tarea).length && faltaMigracion(error.message)) ({ error } = await supabase.from("dropi_publicaciones_decisiones").insert(fila));
  if (error) return { error: faltaMigracion(error.message) ? "Falta correr en Supabase la migración 0127." : `No se pudo guardar: ${error.message}` };

  const etiqueta = DECISIONES.find((d) => d.valor === decision)!.etiqueta;
  await registrarAuditoria({
    accion: "decidir_recomendacion_publicacion",
    entidad: "dropi_publicaciones",
    entidadId: publicacionId,
    detalle: `Recomendación ${etiqueta.toLowerCase()}: ${rec.titulo || tipo}${decision === "pospuesta" ? ` (hasta el ${hasta})` : ""}${responsable ? ` · la hace ${responsable.nombre}` : ""}${nota ? ` · «${nota}»` : ""}`,
  });
  // Un aviso «Para ti» a quien la tiene que hacer (si no es quien la aceptó). Si falla, la decisión ya quedó.
  if (responsable && responsable.id !== usuario.id && tarea.plazo)
    await supabase.from("notificaciones_usuario").insert({
      usuario_id: responsable.id,
      tipo: "tarea",
      titulo: `Tarea en Gestión de IDs Dropi: ${rec.titulo || etiquetaRecomendacion(tipo)}`.slice(0, 300),
      texto: `${pub.nombre} · para el ${tarea.plazo}${nota ? ` · «${nota}»` : ""}`.slice(0, 600),
      href: "/publicaciones-dropi/tareas",
      autor_id: usuario.id,
      autor_nombre: usuario.nombre ?? usuario.email ?? null,
    });
  // Aceptar subir o bajar el precio lo cambia en el sistema y lo deja en la cola de «Aplicar en Dropi» (22 oct 2026). El precio sale
  // de la recomendación que se vio; se revisa que sea un número razonable.
  let dropi: string | undefined;
  const nuevo = Number(rec.datos.precioSugerido);
  if (decision === "aceptada" && (tipo === "subir_precio" || tipo === "igualar_precio") && Number.isFinite(nuevo) && nuevo > 0 && nuevo < 10000) {
    const antes = pub.precio_venta === null ? null : Number(pub.precio_venta);
    if (antes === null || Math.abs(antes - nuevo) > 0.004) {
      await supabase.from("dropi_publicaciones").update({ precio_venta: nuevo, ultimo_cambio_precio: dia, actualizado_en: new Date().toISOString() }).eq("id", publicacionId);
      await registrarAuditoria({
        accion: "editar_publicacion_dropi",
        entidad: "dropi_publicaciones",
        entidadId: publicacionId,
        antes: { "Precio de venta": antes === null ? "—" : montoDePais(antes, codigoPub) },
        despues: { "Precio de venta": montoDePais(nuevo, codigoPub) },
      });
      const r = await enviarPrecioADropi(supabase, { id: pub.id as string, pais_id: pub.pais_id as string, dropi_id: (pub.dropi_id as string | null) ?? null }, nuevo, antes, { id: usuario.id, nombre: usuario.nombre || usuario.email });
      dropi = r.estado === "pendiente" ? r.detalle : `El precio se guardó, pero no quedó para Dropi: ${r.detalle}`;
    }
  }
  // Aceptar «Igualar el precio sugerido» lo deja en la cola de «Aplicar en Dropi» con el sugerido = el precio de venta (23 oct 2026).
  const precioActual = pub.precio_venta === null ? null : Number(pub.precio_venta);
  if (decision === "aceptada" && tipo === "precio_sugerido" && precioActual !== null && precioActual > 0) {
    const r = await encolarCambio(supabase, { id: pub.id as string, pais_id: pub.pais_id as string, dropi_id: (pub.dropi_id as string | null) ?? null }, { precioSugerido: precioActual }, { id: usuario.id, nombre: usuario.nombre || usuario.email });
    dropi = "error" in r ? `No quedó para Dropi: ${r.error}` : `Precio sugerido ${montoDePais(precioActual, codigoPub)} para Dropi: pulsa «Aplicar en Dropi» con Dropi abierto.`;
  }
  revalidatePath("/publicaciones-dropi");
  revalidatePath("/publicaciones-dropi/recomendaciones");
  return { dropi };
}

/** Marca como hecha una tarea (una recomendación aceptada) que el sistema todavía no detectó, con una nota opcional. */
export async function marcarTareaHecha(decisionId: string, nota: string): Promise<{ error?: string }> {
  let usuario;
  try {
    usuario = await requireModuloEscritura(MODULO);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sin permiso." };
  }
  if (typeof decisionId !== "string" || !UUID.test(decisionId)) return { error: "Tarea no válida." };
  const supabase = createServiceClient();
  const { data: d, error: e1 } = await supabase
    .from("dropi_publicaciones_decisiones")
    .select("id, publicacion_id, tipo, decision, hecha_en, recomendacion, dropi_publicaciones!inner(pais_id)")
    .eq("id", decisionId)
    .maybeSingle();
  if (e1) return { error: faltaMigracion(e1.message) ? "Falta correr en Supabase la migración 0128." : e1.message };
  const pais = (d?.dropi_publicaciones as unknown as { pais_id: string } | null)?.pais_id;
  if (!d || d.decision !== "aceptada" || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais))) return { error: "No se encontró la tarea." };
  if (d.hecha_en) return {};
  const texto = corto(nota, 600);
  const { error } = await supabase
    .from("dropi_publicaciones_decisiones")
    .update({ hecha_en: new Date().toISOString(), hecha_por_nombre: usuario.nombre ?? usuario.email ?? null, hecha_como: "manual", hecha_nota: texto || null })
    .eq("id", decisionId)
    .is("hecha_en", null);
  if (error) return { error: faltaMigracion(error.message) ? "Falta correr en Supabase la migración 0128." : `No se pudo guardar: ${error.message}` };
  const titulo = (d.recomendacion as { titulo?: string } | null)?.titulo || etiquetaRecomendacion(d.tipo as string);
  await registrarAuditoria({ accion: "tarea_hecha_publicacion", entidad: "dropi_publicaciones", entidadId: d.publicacion_id as string, detalle: `Tarea hecha: ${titulo}${texto ? ` · «${texto}»` : ""}` });
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

/**
 * Cuántas recomendaciones siguen pendientes en las publicaciones del país de la barra (el globo de la pestaña «Recomendaciones»). Es una
 * lectura: basta poder abrir el módulo. `null` si falta la migración 0116.
 */
export async function contarRecomendacionesPendientes(): Promise<number | null> {
  const usuario = await requireModulo(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await cargarPublicaciones(supabase, pais.id, usuario);
  return datos ? datos.filas.reduce((n, f) => n + f.recomendaciones.length, 0) : null;
}
