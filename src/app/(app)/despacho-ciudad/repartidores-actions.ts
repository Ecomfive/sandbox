"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { ETIQUETAS } from "@/lib/despacho/etiquetas";
import { esAdministrador } from "@/lib/permisos/acceso";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { avisoTrasClaveNueva, avisoTrasSuspender, detalleSalida } from "@/lib/seguridad/sesiones";
import { bloquearIngreso, cerrarSesionesDe, sacarDelSistema } from "@/lib/seguridad/sesiones-cuenta";
import { createServiceClient } from "@/lib/supabase/server";

// Panel del repartidor (24 nov 2026, migración 0362), lo que hace Envíos Delivery:
//   * Las cuentas de los repartidores (solo un administrador): crear con una clave temporal que se muestra una vez, darle una nueva o desactivarla,
//     igual que las cuentas del portal del proveedor. Cada cuenta va unida a su nombre de repartidor en Envíos Delivery.
//   * Los cierres del día: Soporte (edición de Envíos Delivery) valida o devuelve con una nota.

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const claveTemporal = (largo = 14) => Array.from({ length: largo }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
const CORREO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const SIN_MIGRACION = "Falta correr en Supabase la migración 0362 (panel del repartidor).";

async function exigirAdministrador() {
  const usuario = await getUsuarioActual();
  if (!usuario || !esAdministrador(usuario)) return null;
  return usuario;
}

export interface CuentaRepartidorFila {
  id: string;
  courier: string;
  nombre: string;
  email: string;
  activo: boolean;
  ultimoIngreso: string | null;
}

/** Crea la cuenta de un repartidor (unida a su nombre en Envíos Delivery) y devuelve su clave temporal. */
export async function crearCuentaRepartidor(courier: string, nombre: string, email: string): Promise<{ error?: string; clave?: string; cuenta?: CuentaRepartidorFila }> {
  const admin = await exigirAdministrador();
  if (!admin) return { error: "Solo un administrador crea las cuentas de los repartidores." };
  if (!ETIQUETAS.courier.opciones.some((o) => o.nombre === courier)) return { error: "Elige el repartidor de la lista." };
  const correo = String(email ?? "").trim().toLowerCase();
  const nombreLimpio = String(nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!CORREO.test(correo)) return { error: "Escribe un correo válido." };
  if (!nombreLimpio) return { error: "Falta el nombre." };
  const supabase = createServiceClient();
  const { error: sinTabla } = await supabase.from("despacho_repartidores").select("id").limit(1);
  if (sinTabla) return { error: SIN_MIGRACION };
  const { count: esDelEquipo } = await supabase.from("perfiles").select("id", { count: "exact", head: true }).ilike("email", correo);
  if ((esDelEquipo ?? 0) > 0) return { error: "Ese correo es de una persona del equipo. Usa otro para el repartidor." };

  const clave = claveTemporal();
  const { data: creado, error } = await supabase.auth.admin.createUser({ email: correo, password: clave, email_confirm: true, app_metadata: { clave_temporal: true } });
  if (error || !creado.user) return { error: error?.message.includes("already") ? "Ya existe una cuenta con ese correo." : "No se pudo crear la cuenta." };
  const { data: fila, error: errorCuenta } = await supabase
    .from("despacho_repartidores")
    .insert({ usuario_id: creado.user.id, courier, nombre: nombreLimpio, email: correo, creado_por: admin.id })
    .select("id")
    .single();
  if (errorCuenta || !fila) {
    await supabase.auth.admin.deleteUser(creado.user.id);
    return { error: "No se pudo crear la cuenta." };
  }
  await registrarAuditoria({ accion: "crear_usuario", entidad: "despacho_repartidores", entidadId: creado.user.id, detalle: `Cuenta del panel del repartidor: ${nombreLimpio} (${courier}) <${correo}>` });
  revalidatePath("/despacho-ciudad/repartidores");
  return { clave, cuenta: { id: fila.id as string, courier, nombre: nombreLimpio, email: correo, activo: true, ultimoIngreso: null } };
}

/** Clave temporal nueva (la olvidó o nunca entró); cierra sus sesiones abiertas. */
export async function nuevaClaveRepartidor(cuentaId: string): Promise<{ error?: string; clave?: string; aviso?: string }> {
  if (!(await exigirAdministrador())) return { error: "Solo un administrador puede hacer esto." };
  if (!esUuid(cuentaId)) return { error: "Cuenta no válida." };
  const supabase = createServiceClient();
  const { data } = await supabase.from("despacho_repartidores").select("usuario_id, nombre").eq("id", cuentaId).maybeSingle();
  if (!data) return { error: "La cuenta ya no existe." };
  const clave = claveTemporal();
  const { error } = await supabase.auth.admin.updateUserById(data.usuario_id as string, { password: clave, app_metadata: { clave_temporal: true } });
  if (error) return { error: "No se pudo cambiar la clave." };
  const fallaSesiones = (await cerrarSesionesDe(data.usuario_id as string)).error ?? null;
  await registrarAuditoria({
    accion: "generar_contrasena_temporal",
    entidad: "despacho_repartidores",
    entidadId: data.usuario_id as string,
    detalle: `Clave temporal nueva para ${data.nombre} (repartidor); ${fallaSesiones ? `no se pudieron cerrar sus sesiones (${fallaSesiones})` : "se cerraron sus sesiones abiertas"}`,
  });
  const aviso = avisoTrasClaveNueva(fallaSesiones);
  return aviso ? { clave, aviso } : { clave };
}

/** Desactiva o reactiva la cuenta: desactivada, queda fuera del panel, se le bloquea el ingreso y se cierran sus sesiones. */
export async function cambiarCuentaRepartidorActiva(cuentaId: string, activo: boolean): Promise<{ error?: string; aviso?: string }> {
  if (!(await exigirAdministrador())) return { error: "Solo un administrador puede hacer esto." };
  if (!esUuid(cuentaId) || typeof activo !== "boolean") return { error: "Cuenta no válida." };
  const supabase = createServiceClient();
  if (activo) {
    const { data: cuenta } = await supabase.from("despacho_repartidores").select("usuario_id").eq("id", cuentaId).maybeSingle();
    if (!cuenta) return { error: "La cuenta ya no existe." };
    const desbloqueo = await bloquearIngreso(cuenta.usuario_id as string, false);
    if (desbloqueo.error) return { error: `No se pudo reactivar: ${desbloqueo.error}. Inténtalo de nuevo.` };
  }
  const { data, error } = await supabase.from("despacho_repartidores").update({ activo }).eq("id", cuentaId).select("usuario_id, nombre").maybeSingle();
  if (error || !data) return { error: "No se pudo cambiar la cuenta." };
  const salida = activo ? null : await sacarDelSistema(data.usuario_id as string);
  await registrarAuditoria({
    accion: activo ? "editar_usuario" : "suspender_usuario",
    entidad: "despacho_repartidores",
    entidadId: data.usuario_id as string,
    detalle: `Cuenta del panel del repartidor: ${data.nombre}${salida ? ` (${detalleSalida(salida)})` : ""}`,
    antes: { Estado: activo ? "Desactivada" : "Activa" },
    despues: { Estado: activo ? "Activa" : "Desactivada" },
  });
  revalidatePath("/despacho-ciudad/repartidores");
  const aviso = salida ? avisoTrasSuspender(salida) : null;
  return aviso ? { aviso } : {};
}

/** Soporte valida el cierre de un repartidor (o lo devuelve con una nota para que lo corrija y lo vuelva a enviar). */
export async function revisarCierre(cierreId: string, validar: boolean, nota: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("despacho-ciudad");
  if (!esUuid(cierreId)) return { error: "Cierre no válido." };
  const texto = String(nota ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!validar && !texto) return { error: "Escribe qué tiene que corregir." };
  const supabase = createServiceClient();
  const { data: c } = await supabase.from("despacho_cierres").select("id, courier, dia, estado").eq("id", cierreId).maybeSingle();
  if (!c) return { error: "Ese cierre ya no existe." };
  if (c.estado !== "enviado") return { error: c.estado === "validado" ? "Ese cierre ya está validado." : "Ese cierre está devuelto: espera que lo vuelva a enviar." };
  const { error } = await supabase
    .from("despacho_cierres")
    .update({ estado: validar ? "validado" : "devuelto", nota: validar ? null : texto, revisado_por: usuario.id, revisado_por_nombre: usuario.nombre ?? usuario.email, revisado_en: new Date().toISOString() })
    .eq("id", cierreId)
    .eq("estado", "enviado");
  if (error) return { error: "No se pudo guardar." };
  await registrarAuditoria({ accion: validar ? "validar_cierre_repartidor" : "devolver_cierre_repartidor", entidad: "despacho_cierres", entidadId: cierreId, detalle: `${c.courier} · ${c.dia}${validar ? "" : `: ${texto}`}` });
  revalidatePath("/despacho-ciudad");
  revalidatePath("/repartidor/cierre");
  return {};
}
