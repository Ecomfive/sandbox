"use server";

// Catálogo único de proveedores (migración 0925): crear, editar (con RUC y DV validados), unificar nombres detectados en
// el libro como alias y quitar un alias. Todas devuelven `{ error }` como valor.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { claveProveedor } from "@/lib/finanzas/proveedores";
import { validarRucDv } from "@/lib/finanzas/ruc-panama";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "libro-movimientos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr la migración 0925 en Supabase.";

function revalidar() {
  revalidatePath("/libro-movimientos", "layout");
}

const limpiarNombre = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
const mensaje = (e: { code?: string; message: string }) =>
  e.code === "42P01" ? FALTA : e.code === "23505" ? "Ya existe un proveedor con ese nombre, RUC o alias." : e.message;

/** Lee y valida nombre, RUC y DV del formulario. */
function leerProveedor(f: FormData): { nombre: string; ruc: string | null; dv: string | null } | { error: string } {
  const nombre = limpiarNombre(f.get("nombre"));
  if (nombre.length < 2) return { error: "Falta el nombre." };
  const v = validarRucDv(String(f.get("ruc") ?? ""), String(f.get("dv") ?? ""));
  if (v.error) return { error: `RUC: ${v.error}` };
  return { nombre, ruc: v.ruc || null, dv: v.ruc ? v.dv : null };
}

/** Agrega alias a un proveedor (normalizados; los que ya son de otro proveedor pasan a este). */
async function ponerAlias(proveedorId: string, alias: string[], usuarioId: string): Promise<{ error?: string; puestos: number }> {
  const claves = [...new Set(alias.map(claveProveedor).filter((a) => a.length >= 2))].slice(0, 200);
  if (!claves.length) return { puestos: 0 };
  const { error } = await createServiceClient()
    .from("fin_proveedor_alias")
    .upsert(claves.map((a) => ({ proveedor_id: proveedorId, alias: a, creado_por: usuarioId })), { onConflict: "alias" });
  return error ? { error: mensaje(error), puestos: 0 } : { puestos: claves.length };
}

export async function crearProveedor(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const d = leerProveedor(formData);
    if ("error" in d) return d;
    const { data, error } = await createServiceClient().from("fin_proveedores").insert({ ...d, creado_por: usuario.id }).select("id").single();
    if (error || !data) return { error: error ? mensaje(error) : "No se pudo crear." };
    const alias = String(formData.get("alias") ?? "").split(/[,\n]/);
    const a = await ponerAlias(data.id as string, [d.nombre, ...alias], usuario.id);
    if (a.error) return { error: a.error };
    await registrarAuditoria({ accion: "crear_proveedor", entidad: "fin_movimientos", detalle: `Proveedor «${d.nombre}»${d.ruc ? ` (RUC ${d.ruc})` : ""}` });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear el proveedor." };
  }
}

export async function actualizarProveedor(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const id = String(formData.get("id") ?? "");
    if (!UUID.test(id)) return { error: "Proveedor inválido." };
    const d = leerProveedor(formData);
    if ("error" in d) return d;
    const activo = formData.get("activo") === "si";
    const supabase = createServiceClient();
    const { data: antes } = await supabase.from("fin_proveedores").select("nombre, ruc, dv, activo").eq("id", id).maybeSingle();
    if (!antes) return { error: "El proveedor ya no existe." };
    const { error } = await supabase.from("fin_proveedores").update({ ...d, activo, actualizado_en: new Date().toISOString() }).eq("id", id);
    if (error) return { error: mensaje(error) };
    await ponerAlias(id, [d.nombre], usuario.id);
    await registrarAuditoria({
      accion: "editar_proveedor",
      entidad: "fin_movimientos",
      antes: { Proveedor: antes.nombre, RUC: antes.ruc ?? "", DV: antes.dv ?? "", Activo: antes.activo ? "Sí" : "No" },
      despues: { Proveedor: d.nombre, RUC: d.ruc ?? "", DV: d.dv ?? "", Activo: activo ? "Sí" : "No" },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el proveedor." };
  }
}

/**
 * Unifica nombres detectados en el libro bajo un proveedor: el existente (`proveedorId`) o uno nuevo con `nombre`. Cada
 * nombre queda como alias, así los filtros y reportes usan el proveedor canónico.
 */
export async function unificarProveedores(nombres: string[], proveedorId: string | null, nombreNuevo: string | null): Promise<{ error: string } | { proveedorId: string; alias: number }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const lista = (Array.isArray(nombres) ? nombres : []).map(limpiarNombre).filter(Boolean).slice(0, 200);
    if (!lista.length) return { error: "Elige al menos un nombre." };
    const supabase = createServiceClient();
    let id = typeof proveedorId === "string" && UUID.test(proveedorId) ? proveedorId : null;
    if (id) {
      const { data, error } = await supabase.from("fin_proveedores").select("id").eq("id", id).maybeSingle();
      if (error) return { error: FALTA };
      if (!data) return { error: "El proveedor ya no existe." };
    } else {
      const nombre = limpiarNombre(nombreNuevo) || lista[0];
      const { data: existe, error: e0 } = await supabase.from("fin_proveedores").select("id").ilike("nombre", nombre.replace(/[%_\\]/g, "")).maybeSingle();
      if (e0) return { error: FALTA };
      if (existe) id = existe.id as string;
      else {
        const { data, error } = await supabase.from("fin_proveedores").insert({ nombre, creado_por: usuario.id }).select("id").single();
        if (error || !data) return { error: error ? mensaje(error) : "No se pudo crear." };
        id = data.id as string;
      }
    }
    const a = await ponerAlias(id, lista, usuario.id);
    if (a.error) return { error: a.error };
    await registrarAuditoria({ accion: "unificar_proveedores", entidad: "fin_movimientos", detalle: `${lista.join(", ")} → un solo proveedor` });
    revalidar();
    return { proveedorId: id, alias: a.puestos };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo unificar." };
  }
}

export async function quitarAlias(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!UUID.test(String(id))) return { error: "Alias inválido." };
    const { error } = await createServiceClient().from("fin_proveedor_alias").delete().eq("id", id);
    if (error) return { error: mensaje(error) };
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo quitar." };
  }
}
