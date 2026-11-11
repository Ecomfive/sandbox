"use server";

// Cambiar los precios de Drop y de Dunamixfy desde el sistema (10 nov 2026, migración 0266): la ficha deja el cambio en `plataforma_cambios_precio` y el
// favorito «Aplicar precios» (`marcador-aplicar-precios.ts`) lo aplica desde la pestaña de la plataforma; la ventana que abre el favorito usa las demás
// acciones de aquí. Solo quien puede escribir en Gestión de IDs de esa plataforma. Los errores se devuelven como valor (en producción Next.js oculta el
// mensaje de una excepción).

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { precioValido } from "@/lib/effi/precios";
import { createServiceClient } from "@/lib/supabase/server";
import type { PlataformaPrecios } from "./marcador-aplicar-precios";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr en Supabase la migración 0266 (cambiar precios de Drop y Dunamixfy).";
const esFalta = (m: string) => /plataforma_cambios_precio|precio_proveedor|schema cache|does not exist/i.test(m);

const CONFIG = {
  drop: { modulo: "publicaciones-drop", tabla: "drop_publicaciones", externo: "drop_id", activo: "en_drop", precio: "precio_proveedor", ruta: "/publicaciones-drop", nombre: "Drop" },
  dunamixfy: { modulo: "publicaciones-dunamixfy", tabla: "dunamixfy_publicaciones", externo: "interno", activo: "en_dunamixfy", precio: "precio", ruta: "/publicaciones-dunamixfy", nombre: "Dunamixfy" },
} as const;

const esPlataforma = (v: unknown): v is PlataformaPrecios => v === "drop" || v === "dunamixfy";
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const colones = (n: number | null) => (n === null ? "—" : `₡${n.toLocaleString("es-CR")}`);

/** Un cambio de precio que espera «Aplicar precios» (o que falló la última vez). */
export interface CambioPrecioEsperando {
  id: string;
  publicacionId: string;
  precio: number | null;
  sugerido: number | null;
  precioAntes: number | null;
  sugeridoAntes: number | null;
  estado: "pendiente" | "error";
  error: string | null;
  creadoPor: string | null;
  creadoEn: string;
}

type FilaCola = {
  id: string;
  publicacion_id: string;
  externo: string;
  precio: number | null;
  precio_sugerido: number | null;
  precio_antes: number | null;
  precio_sugerido_antes: number | null;
  estado: "pendiente" | "error";
  error: string | null;
  creado_por_nombre: string | null;
  creado_en: string;
};

const aCambio = (f: FilaCola): CambioPrecioEsperando => ({
  id: f.id,
  publicacionId: f.publicacion_id,
  precio: num(f.precio),
  sugerido: num(f.precio_sugerido),
  precioAntes: num(f.precio_antes),
  sugeridoAntes: num(f.precio_sugerido_antes),
  estado: f.estado,
  error: f.error,
  creadoPor: f.creado_por_nombre,
  creadoEn: f.creado_en,
});

/**
 * La ficha pide un precio y un sugerido nuevos (el estado que debe quedar). Se compara con lo último leído de la plataforma: lo que no cambia no se manda.
 * El cambio anterior que seguía esperando queda «reemplazado» por este; si ya no cambia nada, queda «descartado».
 */
export async function cambiarPrecioPlataforma(
  plataforma: unknown,
  publicacionId: unknown,
  nuevos: { precio?: unknown; precioSugerido?: unknown },
): Promise<{ ok: true; esperando: CambioPrecioEsperando | null } | { error: string }> {
  if (!esPlataforma(plataforma) || typeof publicacionId !== "string" || !UUID.test(publicacionId) || !nuevos || typeof nuevos !== "object") return { error: "Datos no válidos." };
  const cfg = CONFIG[plataforma];
  const usuario = await requireModuloEscritura(cfg.modulo);
  const supabase = createServiceClient();
  const extra = plataforma === "drop" ? ", con_variantes" : "";
  const { data: pub, error } = await supabase
    .from(cfg.tabla)
    .select(`id, pais_id, nombre, ${cfg.externo}, ${cfg.activo}, ${cfg.precio}, precio_sugerido${extra}`)
    .eq("id", publicacionId)
    .maybeSingle();
  if (error) return { error: esFalta(error.message) ? FALTA : "No se pudo leer la publicación." };
  if (!pub) return { error: "Esa publicación ya no existe. Recarga la página." };
  const fila = pub as unknown as Record<string, unknown>;
  if (!fila[cfg.activo]) return { error: `Ya no aparece en ${cfg.nombre}: no se puede cambiar su precio.` };
  if (fila.con_variantes) return { error: "Tiene variantes en Drop: cambia su precio allá." };
  const externo = String(fila[cfg.externo] ?? "");
  if (!externo) return { error: `Falta el id de ${cfg.nombre} de esta publicación: pulsa «Actualizar» para leerla de nuevo.` };

  const actual = { precio: num(fila[cfg.precio]), sugerido: num(fila.precio_sugerido) };
  const cambio: { precio: number | null; sugerido: number | null } = { precio: null, sugerido: null };
  for (const [clave, valor, etiqueta] of [
    ["precio", nuevos.precio, plataforma === "drop" ? "Precio sin comisión" : "Precio al dropshipper"],
    ["sugerido", nuevos.precioSugerido, "Precio sugerido"],
  ] as const) {
    if (valor === undefined || valor === null || valor === "") continue;
    const n = precioValido(valor);
    if (n === null || n <= 0) return { error: `${etiqueta}: escribe un precio mayor que cero.` };
    if (actual[clave] === null || Math.abs(n - actual[clave]!) > 0.004) cambio[clave] = n;
  }

  const { data: anteriores, error: errorCola } = await supabase
    .from("plataforma_cambios_precio")
    .select("id")
    .eq("plataforma", plataforma)
    .eq("publicacion_id", publicacionId)
    .in("estado", ["pendiente", "error"]);
  if (errorCola) return { error: esFalta(errorCola.message) ? FALTA : "No se pudo leer la cola de cambios." };
  const sinCambio = cambio.precio === null && cambio.sugerido === null;
  if (anteriores?.length)
    await supabase
      .from("plataforma_cambios_precio")
      .update({ estado: sinCambio ? "descartado" : "reemplazado" })
      .in(
        "id",
        anteriores.map((a) => a.id as string),
      );
  if (sinCambio) {
    revalidatePath(cfg.ruta);
    return anteriores?.length ? { ok: true, esperando: null } : { error: "No cambiaste ningún precio." };
  }

  const { data: nueva, error: errorNueva } = await supabase
    .from("plataforma_cambios_precio")
    .insert({
      pais_id: fila.pais_id,
      plataforma,
      publicacion_id: publicacionId,
      externo,
      precio: cambio.precio,
      precio_sugerido: cambio.sugerido,
      precio_antes: cambio.precio === null ? null : actual.precio,
      precio_sugerido_antes: cambio.sugerido === null ? null : actual.sugerido,
      creado_por: usuario.id,
      creado_por_nombre: usuario.nombre || usuario.email,
    })
    .select("id, publicacion_id, externo, precio, precio_sugerido, precio_antes, precio_sugerido_antes, estado, error, creado_por_nombre, creado_en")
    .single();
  if (errorNueva || !nueva) return { error: errorNueva && esFalta(errorNueva.message) ? FALTA : "No se pudo guardar el cambio." };
  await registrarAuditoria({
    accion: `pedir_precio_${plataforma}`,
    entidad: cfg.tabla,
    entidadId: publicacionId,
    detalle: `${fila.nombre as string}: cambio de precio esperando «Aplicar precios» en ${cfg.nombre}`,
    antes: { ...(cambio.precio !== null ? { Precio: colones(actual.precio) } : {}), ...(cambio.sugerido !== null ? { Sugerido: colones(actual.sugerido) } : {}) },
    despues: { ...(cambio.precio !== null ? { Precio: colones(cambio.precio) } : {}), ...(cambio.sugerido !== null ? { Sugerido: colones(cambio.sugerido) } : {}) },
  });
  revalidatePath(cfg.ruta);
  return { ok: true, esperando: aCambio(nueva as unknown as FilaCola) };
}

/** Quita un cambio que todavía no se aplicó. */
export async function descartarCambioPrecio(plataforma: unknown, cambioId: unknown): Promise<{ error?: string }> {
  if (!esPlataforma(plataforma) || typeof cambioId !== "string" || !UUID.test(cambioId)) return { error: "Datos no válidos." };
  const cfg = CONFIG[plataforma];
  await requireModuloEscritura(cfg.modulo);
  const { data, error } = await createServiceClient()
    .from("plataforma_cambios_precio")
    .update({ estado: "descartado" })
    .eq("id", cambioId)
    .eq("plataforma", plataforma)
    .in("estado", ["pendiente", "error"])
    .select("id");
  if (error) return { error: esFalta(error.message) ? FALTA : "No se pudo quitar el cambio." };
  if (!data?.length) return { error: "Ese cambio ya se aplicó o ya no está." };
  revalidatePath(cfg.ruta);
  return {};
}

/** Un cambio como lo recibe el favorito. */
export interface CambioParaAplicar {
  id: string;
  externo: string;
  nombre: string;
  precio: number | null;
  sugerido: number | null;
  precioAntes: number | null;
  sugeridoAntes: number | null;
  estado: "pendiente" | "error";
  error: string | null;
}

/** Para la ventana del favorito: los cambios que esperan en esa plataforma (los pendientes y los que fallaron), del más viejo al más nuevo. */
export async function cambiosParaAplicar(plataforma: unknown): Promise<{ cambios?: CambioParaAplicar[]; error?: string }> {
  if (!esPlataforma(plataforma)) return { error: "Plataforma no válida." };
  const cfg = CONFIG[plataforma];
  await requireModuloEscritura(cfg.modulo);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("plataforma_cambios_precio")
    .select("id, publicacion_id, externo, precio, precio_sugerido, precio_antes, precio_sugerido_antes, estado, error, creado_por_nombre, creado_en")
    .eq("plataforma", plataforma)
    .in("estado", ["pendiente", "error"])
    .order("creado_en")
    .limit(100);
  if (error) return { error: esFalta(error.message) ? FALTA : "No se pudieron leer los cambios pendientes." };
  const filas = (data ?? []) as unknown as FilaCola[];
  const ids = [...new Set(filas.map((f) => f.publicacion_id))];
  const { data: pubs } = ids.length ? await supabase.from(cfg.tabla).select("id, nombre").in("id", ids) : { data: [] };
  const nombre = new Map((pubs ?? []).map((p) => [p.id as string, p.nombre as string]));
  return {
    cambios: filas.map((f) => ({
      id: f.id,
      externo: f.externo,
      nombre: nombre.get(f.publicacion_id) ?? "(sin nombre)",
      precio: num(f.precio),
      sugerido: num(f.precio_sugerido),
      precioAntes: num(f.precio_antes),
      sugeridoAntes: num(f.precio_sugerido_antes),
      estado: f.estado,
      error: f.error,
    })),
  };
}

const monto = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return v === null || v === undefined || !Number.isFinite(n) || n < 0 || n > 100_000_000 ? null : Math.round(n * 100) / 100;
};
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Drop: los precios de todos nuestros productos, leídos por el favorito al abrir la ventana (sin comisión, con comisión, sugerido y si tiene variantes).
 * Solo actualiza las publicaciones que ya existen (por su id de Drop); no crea ninguna.
 */
export async function guardarPreciosLeidosDrop(productos: unknown): Promise<{ guardados?: number; error?: string }> {
  await requireModuloEscritura(CONFIG.drop.modulo);
  if (!Array.isArray(productos)) return { error: "Datos no válidos." };
  const limpios = productos
    .slice(0, 2000)
    .map((p: Record<string, unknown>) => ({
      id: typeof p?.id === "string" && /^[0-9a-f]{24}$/.test(p.id) ? p.id : null,
      precio: monto(p?.precio),
      precioProveedor: monto(p?.precioProveedor),
      sugerido: monto(p?.sugerido),
      variantes: p?.variantes === true,
    }))
    .filter((p): p is { id: string; precio: number | null; precioProveedor: number | null; sugerido: number | null; variantes: boolean } => !!p.id);
  if (!limpios.length) return { guardados: 0 };
  const supabase = createServiceClient();
  const ahora = new Date().toISOString();
  let guardados = 0;
  for (let i = 0; i < limpios.length; i += 10) {
    const lote = await Promise.all(
      limpios.slice(i, i + 10).map((p) =>
        supabase
          .from("drop_publicaciones")
          .update({
            ...(p.precio !== null ? { precio: p.precio } : {}),
            precio_proveedor: p.precioProveedor,
            precio_sugerido: p.sugerido && p.sugerido > 0 ? p.sugerido : null,
            con_variantes: p.variantes,
            precios_leidos_en: ahora,
          })
          .eq("drop_id", p.id)
          .select("id"),
      ),
    );
    for (const r of lote) {
      if (r.error) return { error: esFalta(r.error.message) ? FALTA : "No se pudieron guardar los precios leídos de Drop." };
      guardados += r.data?.length ?? 0;
    }
  }
  revalidatePath(CONFIG.drop.ruta);
  return { guardados };
}

/** Lo que devolvió el favorito por cada cambio: se guarda el resultado y, si se aplicó, el precio nuevo en la publicación (lo que quedó en la plataforma). */
export async function guardarResultadosPrecios(plataforma: unknown, resultados: unknown): Promise<{ error?: string }> {
  if (!esPlataforma(plataforma) || !Array.isArray(resultados)) return { error: "Datos no válidos." };
  const cfg = CONFIG[plataforma];
  const usuario: UsuarioActual = await requireModuloEscritura(cfg.modulo);
  const limpios = resultados
    .slice(0, 100)
    .map((r: Record<string, unknown>) => ({
      id: typeof r?.id === "string" && UUID.test(r.id) ? r.id : null,
      ok: r?.ok === true,
      error: texto(r?.error, 300),
      aviso: texto(r?.aviso, 300),
      precio: monto(r?.precio),
      precioProveedor: monto(r?.precioProveedor),
      sugerido: monto(r?.sugerido),
    }))
    .filter((r) => r.id !== null);
  if (!limpios.length) return {};
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("plataforma_cambios_precio")
    .select("id, publicacion_id, precio, precio_sugerido, precio_antes, precio_sugerido_antes, intentos")
    .eq("plataforma", plataforma)
    .in(
      "id",
      limpios.map((r) => r.id!),
    )
    .in("estado", ["pendiente", "error"]);
  if (error) return { error: esFalta(error.message) ? FALTA : "No se pudieron guardar los resultados." };
  const porId = new Map((data ?? []).map((f) => [f.id as string, f]));
  const ahora = new Date().toISOString();
  for (const r of limpios) {
    const f = porId.get(r.id!);
    if (!f) continue;
    await supabase
      .from("plataforma_cambios_precio")
      .update(
        r.ok
          ? { estado: "aplicado", aplicado_en: ahora, error: null, aviso: r.aviso, intentos: Number(f.intentos) + 1 }
          : { estado: "error", error: r.error ?? "No se pudo aplicar.", intentos: Number(f.intentos) + 1 },
      )
      .eq("id", r.id!);
    if (!r.ok) continue;
    // El precio que quedó en la plataforma (el que la volvió a leer); si no vino, el pedido.
    const precio = plataforma === "drop" ? (r.precioProveedor ?? num(f.precio)) : (r.precio ?? num(f.precio));
    const actualizar: Record<string, unknown> = { actualizado_en: ahora };
    if (f.precio !== null && precio !== null) actualizar[cfg.precio] = precio;
    if (plataforma === "drop" && r.precio !== null) actualizar.precio = r.precio;
    if (f.precio_sugerido !== null) actualizar.precio_sugerido = r.sugerido && r.sugerido > 0 ? r.sugerido : num(f.precio_sugerido);
    const { data: pub } = await supabase.from(cfg.tabla).update(actualizar).eq("id", f.publicacion_id as string).select("nombre").maybeSingle();
    await registrarAuditoria({
      accion: `cambiar_precio_${plataforma}`,
      entidad: cfg.tabla,
      entidadId: f.publicacion_id as string,
      detalle: `${(pub?.nombre as string | undefined) ?? "Publicación"}: precio cambiado en ${cfg.nombre} con «Aplicar precios» por ${usuario.nombre || usuario.email}${r.aviso ? `. ${r.aviso}` : ""}`,
      antes: { ...(f.precio !== null ? { Precio: colones(num(f.precio_antes)) } : {}), ...(f.precio_sugerido !== null ? { Sugerido: colones(num(f.precio_sugerido_antes)) } : {}) },
      despues: { ...(f.precio !== null ? { Precio: colones(precio) } : {}), ...(f.precio_sugerido !== null ? { Sugerido: colones(r.sugerido ?? num(f.precio_sugerido)) } : {}) },
    });
  }
  revalidatePath(cfg.ruta);
  return {};
}
