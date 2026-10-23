"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const RUTA = "/publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (n: number) => `$${n.toFixed(2)}`;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Un cambio que espera «Aplicar en Dropi», para la lista de la barra de la página: qué es, qué pasaría al deshacerlo y si todavía se puede. */
export interface CambioPendienteVista {
  id: string;
  tipo: "cambio" | "republicar" | "apagar";
  publicacion: string;
  /** Lo que lleva el cambio, una línea por dato («Nombre: «A» → «B»», «Precio $5.00 → $6.00»…). */
  lineas: string[];
  /** Lo que pasa en el sistema al deshacerlo. */
  alDeshacer: string;
  /** Con error (se reintenta al aplicar) o pendiente. */
  error: string | null;
  creadoPor: string | null;
  creadoEn: string;
  deshacible: boolean;
  motivoNo: string | null;
}

type Fila = Record<string, unknown>;

const COLUMNAS = "id, tipo, estado, error, intentos, publicacion_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes, nuevo_dropi_id, quitar_privados, creado_por_nombre, creado_en";

/** Los cambios pendientes y con error de un país, con el nombre de la publicación y lo que hay hoy en ella (para describir el antes). */
async function leerPendientes(paisId: string, soloIds?: string[]): Promise<{ filas: Fila[]; error?: string }> {
  const supabase = createServiceClient();
  const leer = (columnas: string) => {
    const q = supabase.from("dropi_cambios_pendientes").select(`${columnas}, dropi_publicaciones(nombre, precio_venta)` as "*").eq("pais_id", paisId).in("estado", ["pendiente", "error"]);
    return (soloIds ? q.in("id", soloIds) : q).order("creado_en").limit(200);
  };
  // Sin las migraciones 0145, 0148 o 0149 faltan columnas: se lee con lo que haya.
  const intentos = [`${COLUMNAS}, nombre_antes`, COLUMNAS, "id, estado, error, intentos, publicacion_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes, creado_por_nombre, creado_en", "id, estado, error, intentos, publicacion_id, nombre, nombre_guia, creado_por_nombre, creado_en"];
  for (const columnas of intentos) {
    const r = await leer(columnas);
    if (!r.error) return { filas: (r.data ?? []) as unknown as Fila[] };
  }
  return { filas: [], error: "No se pudieron leer los cambios pendientes." };
}

const pubDe = (f: Fila) => {
  const p = f.dropi_publicaciones;
  return (Array.isArray(p) ? p[0] : p) as { nombre?: string; precio_venta?: number | string | null } | null;
};

/** Los cambios que esperan «Aplicar en Dropi» en el país de la barra, con lo que pasaría al deshacer cada uno. Lo ve quien puede modificar el módulo. */
export async function listarCambiosPendientes(): Promise<{ error?: string; cambios?: CambioPendienteVista[] }> {
  const usuario = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais.id))) return { cambios: [] };
  const { filas, error } = await leerPendientes(pais.id);
  if (error) return { error };
  return {
    cambios: filas.map((f): CambioPendienteVista => {
      const tipo = f.tipo === "apagar" ? "apagar" : f.tipo === "republicar" ? "republicar" : "cambio";
      const pub = pubDe(f);
      const intentos = Number(f.intentos ?? 0);
      const lineas: string[] = [];
      let alDeshacer = "";
      let deshacible = true;
      let motivoNo: string | null = null;
      if (tipo === "apagar") {
        lineas.push(`Apagar: sacar todo el stock${f.quitar_privados === true ? ", quitar la privatización" : ""} y archivar`);
        alDeshacer = "Vuelve a verse como antes en el sistema (sale de Archivados). Dropi no se había tocado.";
        if (intentos > 0) {
          deshacible = false;
          motivoNo = "Ya se intentó en Dropi (el stock puede estar en cero): no se puede deshacer desde aquí.";
        }
      } else if (tipo === "republicar") {
        lineas.push("Republicar: crear el producto de nuevo en Dropi y archivar el actual sin stock");
        alDeshacer = "Se quita de la cola; no cambia nada en el sistema.";
        if (intentos > 0 || f.nuevo_dropi_id) {
          deshacible = false;
          motivoNo = "Ya se empezó en Dropi (puede haber un producto nuevo): no se puede deshacer desde aquí.";
        }
      } else {
        const antes = (f.nombre_antes as string | null | undefined) ?? null;
        const precioAntes = num(f.precio_antes);
        const partes: string[] = [];
        if (f.nombre) {
          lineas.push(antes ? `Nombre: «${antes}» → «${f.nombre}»` : `Nombre: «${f.nombre}»`);
          partes.push(antes ? `el nombre vuelve a «${antes}»` : "el nombre se queda como está (no estaba guardado el anterior)");
        }
        if (f.precio != null) {
          lineas.push(`Precio ${precioAntes !== null ? `${usd(precioAntes)} → ` : ""}${usd(Number(f.precio))}`);
          partes.push(precioAntes !== null ? `el precio vuelve a ${usd(precioAntes)}` : "el precio se queda como está (no estaba guardado el anterior)");
        }
        if (f.precio_sugerido != null) lineas.push(`Precio sugerido ${num(f.precio_sugerido_antes) !== null ? `${usd(Number(f.precio_sugerido_antes))} → ` : ""}${usd(Number(f.precio_sugerido))}`);
        alDeshacer = partes.length ? `En el sistema: ${partes.join(" y ")}.` : "Se quita de la cola.";
      }
      return {
        id: f.id as string,
        tipo,
        publicacion: pub?.nombre ?? "Publicación",
        lineas,
        alDeshacer,
        error: (f.error as string | null) ?? null,
        creadoPor: (f.creado_por_nombre as string | null) ?? null,
        creadoEn: f.creado_en as string,
        deshacible,
        motivoNo,
      };
    }),
  };
}

/**
 * Deshace un cambio pendiente (pedido de Hernán, 23 oct 2026): lo quita de la cola de «Aplicar en Dropi» y deja el sistema como estaba antes
 * del cambio: un nombre vuelve al anterior, un precio vuelve al anterior, un apagado deja de verse apagado. Solo mientras Dropi no se haya
 * tocado (un apagado o una republicación que ya se intentó no se deshace desde aquí). Un nombre o un precio solo se devuelve si el sistema
 * todavía tiene el valor del cambio (si alguien lo volvió a cambiar, no se pisa).
 */
export async function deshacerCambioPendiente(cambioId: string): Promise<{ error?: string; detalle?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof cambioId !== "string" || !UUID.test(cambioId)) return { error: "Cambio no válido." };
  const supabase = createServiceClient();
  const { data: base } = await supabase.from("dropi_cambios_pendientes").select("pais_id").eq("id", cambioId).maybeSingle();
  if (!base || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, base.pais_id as string))) return { error: "Cambio no válido." };
  const { filas, error } = await leerPendientes(base.pais_id as string, [cambioId]);
  const f = filas[0];
  if (error || !f) return { error: "Ese cambio ya no está pendiente." };
  const tipo = f.tipo === "apagar" ? "apagar" : f.tipo === "republicar" ? "republicar" : "cambio";
  const intentos = Number(f.intentos ?? 0);
  const pubId = f.publicacion_id as string;
  const pub = pubDe(f);
  const nombrePub = pub?.nombre ?? "Publicación";

  if (tipo === "apagar" && intentos > 0) return { error: "Ya se intentó en Dropi (el stock puede estar en cero): no se puede deshacer desde aquí." };
  if (tipo === "republicar" && (intentos > 0 || f.nuevo_dropi_id)) return { error: "Ya se empezó en Dropi (puede haber un producto nuevo): no se puede deshacer desde aquí." };

  const restaurado: string[] = [];
  const antes: Record<string, string> = {};
  const despues: Record<string, string> = {};
  if (tipo === "cambio") {
    const cambios: Record<string, unknown> = {};
    const nombreAntes = (f.nombre_antes as string | null | undefined) ?? null;
    if (f.nombre && nombreAntes && pub?.nombre === f.nombre) {
      cambios.nombre = nombreAntes;
      antes["Nombre en Dropi"] = String(f.nombre);
      despues["Nombre en Dropi"] = nombreAntes;
      restaurado.push(`el nombre vuelve a «${nombreAntes}»`);
    }
    const precioAntes = num(f.precio_antes);
    const precioHoy = num(pub?.precio_venta);
    if (f.precio != null && precioAntes !== null && precioHoy !== null && Math.abs(precioHoy - Number(f.precio)) < 0.005) {
      cambios.precio_venta = precioAntes;
      antes["Precio"] = usd(Number(f.precio));
      despues["Precio"] = usd(precioAntes);
      restaurado.push(`el precio vuelve a ${usd(precioAntes)}`);
    }
    if (Object.keys(cambios).length) {
      const { error: errorPub } = await supabase.from("dropi_publicaciones").update({ ...cambios, actualizado_en: new Date().toISOString() }).eq("id", pubId);
      if (errorPub) return { error: "No se pudo devolver la publicación a como estaba." };
    }
  }

  // Se quita de la cola (con «reemplazado», que ya sale de las listas y libera los índices); solo si Dropi sigue sin tocarse.
  const q = supabase.from("dropi_cambios_pendientes").update({ estado: "reemplazado" }).eq("id", cambioId).in("estado", ["pendiente", "error"]);
  const { error: errorCola } = await (tipo === "cambio" ? q : q.eq("intentos", 0));
  if (errorCola) return { error: "No se pudo quitar el cambio de la cola." };
  await registrarAuditoria({
    accion: tipo === "apagar" ? "dropi_apagar_cancelado" : tipo === "republicar" ? "dropi_republicar_cancelado" : "dropi_cambio_deshecho",
    entidad: "dropi_publicaciones",
    entidadId: pubId,
    detalle: `${nombrePub} · deshecho antes de aplicarse en Dropi${restaurado.length ? `: ${restaurado.join(" y ")}` : ""}`,
    ...(Object.keys(antes).length ? { antes, despues } : {}),
  });
  revalidatePath(RUTA);
  const resumen = tipo === "apagar" ? "vuelve a verse como antes" : tipo === "republicar" ? "se quitó de la cola" : restaurado.length ? restaurado.join(" y ") : "se quitó de la cola; el sistema se queda como está";
  return { detalle: `Deshecho: ${resumen}. Dropi no se tocó.` };
}
