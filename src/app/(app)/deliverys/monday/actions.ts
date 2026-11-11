"use server";

// Deliverys › Monday (migración 0951): tablero y mapeo de columnas y «Leer ahora» (quien puede modificar Usuarios y roles);
// reglas de estado, catálogo de causas y asignación de textos a una causa (quien puede modificar Deliverys). Todo devuelve
// `{ error }` como valor y deja su línea en la auditoría.

import { revalidatePath } from "next/cache";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { normalizar } from "@/lib/finanzas/clasificacion";
import { codigoDeNombre, esCodigoCausa, leerPalabras, normalizarTexto } from "@/lib/monday/causas";
import { esGrupoEstado, esIdTablero, ETIQUETA_GRUPO, leerReglasEstado, validarMapeo, type ColumnaTablero, type MapeoColumnas } from "@/lib/monday/columnas";
import { columnasDeTablero, mondayConfigurado, SIN_MIGRACION_MONDAY } from "@/lib/monday/sincronizar";
import { administraIntegraciones } from "@/lib/quickbooks/permiso";
import { createServiceClient } from "@/lib/supabase/server";
import { ejecutarTarea } from "@/lib/tareas/ejecutar";

const MODULO = "deliverys";
const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });
const revalidar = () => {
  revalidatePath("/deliverys/monday");
  revalidatePath("/panel-financiero/comite");
  revalidatePath("/panel-financiero/estado-sistema");
};

async function exigirAdministrador() {
  await requireModuloEscritura(MODULO);
  const u = await getUsuarioActual();
  if (!administraIntegraciones(u)) throw new Error("Solo quien puede modificar Usuarios y roles configura la conexión con Monday.");
  return u!;
}

/** Las columnas del tablero, para elegir el mapeo. */
export async function leerColumnasMonday(tableroId: string): Promise<{ error?: string; nombre?: string; columnas?: ColumnaTablero[] }> {
  try {
    await exigirAdministrador();
    if (!mondayConfigurado()) return { error: "Falta MONDAY_API_TOKEN en el servidor." };
    const id = String(tableroId ?? "").trim();
    if (!esIdTablero(id)) return { error: "El id del tablero son solo números (está en su dirección de Monday)." };
    const r = await columnasDeTablero(id);
    return "error" in r ? { error: r.error } : { nombre: r.nombre, columnas: r.columnas };
  } catch (e) {
    return fallo(e, "No se pudo leer el tablero.");
  }
}

/** Guarda el tablero y el mapeo (se vuelve a validar contra las columnas reales del tablero). */
export async function guardarConfigMonday(tableroId: string, mapeo: MapeoColumnas): Promise<{ error?: string }> {
  try {
    const u = await exigirAdministrador();
    const id = String(tableroId ?? "").trim();
    if (!esIdTablero(id)) return { error: "Id de tablero inválido." };
    const r = await columnasDeTablero(id);
    if ("error" in r) return { error: r.error };
    const v = validarMapeo((mapeo ?? {}) as Record<string, unknown>, r.columnas);
    if ("error" in v) return v;
    const supabase = createServiceClient();
    const { data: previo, error: e0 } = await supabase.from("mon_config").select("tablero_id").eq("id", 1).maybeSingle();
    if (e0) return { error: SIN_MIGRACION_MONDAY };
    const cambiaTablero = previo?.tablero_id && previo.tablero_id !== id;
    const { error } = await supabase.from("mon_config").upsert(
      {
        id: 1,
        tablero_id: id,
        tablero_nombre: r.nombre.slice(0, 200) || null,
        columnas: v.mapeo,
        // Con otro tablero o con otro mapeo la próxima lectura vuelve a leer todo.
        cursor_actualizado: null,
        ...(cambiaTablero ? { estados: {}, items: 0 } : {}),
        actualizado_por: u.id,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({ accion: "configurar_monday", entidad: "mon_config", detalle: `Tablero ${r.nombre || id} · ${Object.keys(v.mapeo).length} columnas` });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar la configuración.");
  }
}

export async function leerMondayAhora(): Promise<{ error?: string; resumen?: string }> {
  try {
    const u = await exigirAdministrador();
    const r = await ejecutarTarea(createServiceClient(), "monday", { disparo: "manual", usuarioId: u.id });
    revalidar();
    return r.ok ? { resumen: r.resumen } : { error: r.error ?? "Falló la lectura." };
  } catch (e) {
    return fallo(e, "No se pudo leer Monday.");
  }
}

/** El grupo de una etiqueta de estado del tablero (y recalcula los despachos con esa etiqueta). */
export async function guardarReglaEstado(etiqueta: string, grupo: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const n = normalizar(String(etiqueta ?? "")).slice(0, 120);
    if (!n || !esGrupoEstado(grupo)) return { error: "Estado o grupo inválido." };
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("mon_config").select("estados").eq("id", 1).maybeSingle();
    if (error) return { error: SIN_MIGRACION_MONDAY };
    const reglas = { ...leerReglasEstado(data?.estados), [n]: grupo };
    const u = await supabase.from("mon_config").upsert({ id: 1, estados: reglas, actualizado_en: new Date().toISOString() }, { onConflict: "id" });
    if (u.error) return { error: u.error.message };
    // Las etiquetas tal como vienen de Monday que normalizan igual.
    const { data: etiquetas } = await supabase.from("mon_despachos").select("estado").not("estado", "is", null).limit(5000);
    const crudas = [...new Set((etiquetas ?? []).map((x) => String(x.estado)).filter((x) => normalizar(x) === n))];
    if (crudas.length) {
      const r = await supabase.from("mon_despachos").update({ estado_grupo: grupo }).in("estado", crudas);
      if (r.error) return { error: r.error.message };
    }
    await registrarAuditoria({ accion: "cambiar_estado_monday", entidad: "mon_config", detalle: `«${etiqueta}» → ${ETIQUETA_GRUPO[grupo]}` });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar el estado.");
  }
}

/** Crea o cambia una causa del catálogo. Sin código, crea una nueva a partir del nombre. */
export async function guardarCausa(datos: FormData): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const nombre = String(datos.get("nombre") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!nombre) return { error: "Escribe el nombre de la causa." };
    const palabras = leerPalabras(String(datos.get("palabras") ?? ""));
    const codigoPedido = String(datos.get("codigo") ?? "").trim();
    const codigo = codigoPedido || codigoDeNombre(nombre);
    if (!esCodigoCausa(codigo)) return { error: "Código inválido." };
    const activo = datos.get("activo") !== "no";
    const orden = Math.max(1, Math.min(998, Number(datos.get("orden")) || 100));
    const supabase = createServiceClient();
    if (!codigoPedido) {
      const { data: existe } = await supabase.from("mon_causas").select("codigo").eq("codigo", codigo).maybeSingle();
      if (existe) return { error: "Ya hay una causa con ese nombre." };
    }
    const { error } = await supabase.from("mon_causas").upsert({ codigo, nombre, palabras, activo, orden, actualizado_en: new Date().toISOString() }, { onConflict: "codigo" });
    if (error) return { error: /mon_causas/.test(error.message) ? SIN_MIGRACION_MONDAY : error.message };
    await registrarAuditoria({ accion: codigoPedido ? "cambiar_causa_monday" : "crear_causa_monday", entidad: "mon_causas", detalle: `${nombre}: ${palabras.join(", ") || "sin palabras"}${activo ? "" : " · inactiva"}` });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar la causa.");
  }
}

/** Asigna un texto libre del tablero a una causa (manda sobre las palabras clave). */
export async function asignarTextoCausa(texto: string, codigo: string): Promise<{ error?: string }> {
  try {
    const u = await requireModuloEscritura(MODULO);
    const n = normalizarTexto(texto);
    if (!n || !esCodigoCausa(codigo)) return { error: "Texto o causa inválida." };
    const supabase = createServiceClient();
    const { data: causa, error: e0 } = await supabase.from("mon_causas").select("nombre").eq("codigo", codigo).maybeSingle();
    if (e0) return { error: SIN_MIGRACION_MONDAY };
    if (!causa) return { error: "Esa causa no existe." };
    const { error } = await supabase.from("mon_causa_textos").upsert({ texto: n, codigo, actualizado_por: u.id, actualizado_en: new Date().toISOString() }, { onConflict: "texto" });
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: "asignar_causa_monday", entidad: "mon_causas", detalle: `«${n.slice(0, 80)}» → ${causa.nombre}` });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo asignar.");
  }
}
