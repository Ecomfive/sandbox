"use server";

import { randomInt } from "node:crypto";
import { getUsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { esAdministrador } from "@/lib/permisos/acceso";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import type { CuentaPortal } from "./cuenta-proveedor";

// Las cuentas con las que el proveedor entra a su portal (fase 3 de PORTAL-PROVEEDOR.md). Solo un administrador las crea, le da una clave
// nueva o la desactiva. La clave temporal se muestra una vez a quien la genera, para que se la pase a Shen Zhen (como en Usuarios y roles);
// queda marcada (`app_metadata.clave_temporal`) y al entrar el portal le pide elegir la suya (`cambiarClaveProveedor`).

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const claveTemporal = (largo = 14) => Array.from({ length: largo }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
const CORREO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

async function exigirAdministrador() {
  const usuario = await getUsuarioActual();
  if (!usuario || !esAdministrador(usuario)) return null;
  return usuario;
}

/** Crea una cuenta del proveedor (puede tener varias: una por persona de su lado) y devuelve su clave temporal. */
export async function crearCuentaProveedor(proveedorId: string, nombre: string, email: string): Promise<{ error?: string; clave?: string; cuenta?: CuentaPortal }> {
  if (!(await exigirAdministrador())) return { error: "Solo un administrador puede crear la cuenta del proveedor." };
  if (!esUuid(proveedorId)) return { error: "Proveedor no válido." };
  const correo = String(email ?? "").trim().toLowerCase();
  const nombreLimpio = String(nombre ?? "").trim().slice(0, 80);
  if (!CORREO.test(correo)) return { error: "Escribe un correo válido." };
  if (!nombreLimpio) return { error: "Falta el nombre." };
  const supabase = createServiceClient();
  const { data: proveedor } = await supabase.from("proveedores").select("id").eq("id", proveedorId).maybeSingle();
  if (!proveedor) return { error: "Proveedor no válido." };
  const { count: esDelEquipo } = await supabase.from("perfiles").select("id", { count: "exact", head: true }).ilike("email", correo);
  if ((esDelEquipo ?? 0) > 0) return { error: "Ese correo es de una persona del equipo. Usa otro para el proveedor." };

  const clave = claveTemporal();
  const { data: creado, error } = await supabase.auth.admin.createUser({ email: correo, password: clave, email_confirm: true, app_metadata: { clave_temporal: true } });
  if (error || !creado.user) return { error: error?.message.includes("already") ? "Ya existe una cuenta con ese correo." : "No se pudo crear la cuenta." };
  const { data: fila, error: errorCuenta } = await supabase
    .from("proveedor_usuarios")
    .insert({ usuario_id: creado.user.id, proveedor_id: proveedorId, nombre: nombreLimpio, email: correo })
    .select("id")
    .single();
  if (errorCuenta || !fila) {
    await supabase.auth.admin.deleteUser(creado.user.id);
    return { error: "No se pudo crear la cuenta." };
  }
  await registrarAuditoria({ accion: "crear_usuario", entidad: "proveedor_usuarios", entidadId: creado.user.id, detalle: `Cuenta del portal del proveedor: ${nombreLimpio} <${correo}>` });
  return { clave, cuenta: { id: fila.id as string, nombre: nombreLimpio, email: correo, activo: true, ultimoIngreso: null } };
}

/** Clave temporal nueva para la cuenta del proveedor (la olvidó o nunca llegó a entrar). */
export async function nuevaClaveProveedor(cuentaId: string): Promise<{ error?: string; clave?: string }> {
  if (!(await exigirAdministrador())) return { error: "Solo un administrador puede hacer esto." };
  if (!esUuid(cuentaId)) return { error: "Cuenta no válida." };
  const supabase = createServiceClient();
  const { data } = await supabase.from("proveedor_usuarios").select("usuario_id, nombre").eq("id", cuentaId).maybeSingle();
  if (!data) return { error: "La cuenta ya no existe." };
  const clave = claveTemporal();
  const { error } = await supabase.auth.admin.updateUserById(data.usuario_id as string, { password: clave, app_metadata: { clave_temporal: true } });
  if (error) return { error: "No se pudo cambiar la clave." };
  await registrarAuditoria({ accion: "generar_contrasena_temporal", entidad: "proveedor_usuarios", entidadId: data.usuario_id as string, detalle: `Clave temporal nueva para ${data.nombre}` });
  return { clave };
}

/** Desactiva o reactiva la cuenta: desactivada, el portal la deja fuera en la siguiente página que abra. */
export async function cambiarCuentaProveedorActiva(cuentaId: string, activo: boolean): Promise<{ error?: string }> {
  if (!(await exigirAdministrador())) return { error: "Solo un administrador puede hacer esto." };
  if (!esUuid(cuentaId) || typeof activo !== "boolean") return { error: "Cuenta no válida." };
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("proveedor_usuarios").update({ activo }).eq("id", cuentaId).select("usuario_id, nombre").maybeSingle();
  if (error || !data) return { error: "No se pudo cambiar la cuenta." };
  await registrarAuditoria({ accion: activo ? "editar_usuario" : "suspender_usuario", entidad: "proveedor_usuarios", entidadId: data.usuario_id as string, detalle: `Cuenta del portal del proveedor: ${data.nombre}` });
  return {};
}
