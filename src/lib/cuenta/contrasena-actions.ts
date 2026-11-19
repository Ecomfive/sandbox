"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, getUsuarioSesion } from "@/lib/auth";
import { cuentaDeProveedor } from "@/lib/proveedor/cuenta";
import { cerrarIntento, revisarIngreso } from "@/lib/seguridad/limite-ingreso";
import { DEMASIADOS_INTENTOS } from "@/lib/seguridad/limite-reglas";
import { createAnonClient, createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { errorContrasenaNueva } from "./contrasena";

/**
 * La persona con sesión cambia su propia contraseña (31 oct 2026, pedido de Alcides): desde «Cambiar contraseña» del menú de su
 * cuenta o, si entra con la temporal que le dio un administrador, en /elegir-contrasena. Siempre la de la sesión (nunca un id que
 * llegue del navegador; en «Ver así» también es la de quien mira). La actual se comprueba con un cliente aparte, sin tocar las
 * cookies; la nueva se guarda con la clave de servicio, se quita la marca de temporal y se vuelve a iniciar la sesión con ella.
 * Devuelve el error como valor.
 */
export async function cambiarMiContrasena(actual: string, nueva: string, repetida: string): Promise<{ error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario?.email) return { error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  // Una cuenta del portal de Shen Zhen cambia su clave en su portal.
  if (await cuentaDeProveedor(usuario.id)) return { error: "Cambia tu clave desde tu portal." };
  // Una cuenta suspendida no cambia su contraseña aunque su sesión siga viva (auditoría de seguridad, 18 nov 2026).
  if (!(await getUsuarioActual())) return { error: "Tu cuenta no está activa. Habla con quien administra el sistema." };
  const claveActual = String(actual ?? "");
  const claveNueva = String(nueva ?? "");
  const falla = errorContrasenaNueva(claveActual, claveNueva, String(repetida ?? ""));
  if (falla) return { error: falla };

  // La contraseña actual cuenta como un ingreso: mismo tope de claves equivocadas que el login (seguridad · 19 nov 2026).
  const { intento, frenado } = await revisarIngreso(usuario.email);
  if (frenado) return { error: DEMASIADOS_INTENTOS };
  const comprobar = createAnonClient();
  const { error: errorActual } = await comprobar.auth.signInWithPassword({ email: usuario.email, password: claveActual });
  await cerrarIntento(intento, errorActual);
  if (errorActual) return { error: "La contraseña actual no es correcta." };
  await comprobar.auth.signOut({ scope: "local" });

  const { error } = await createServiceClient().auth.admin.updateUserById(usuario.id, { password: claveNueva, app_metadata: { clave_temporal: false } });
  if (error) return { error: "No se pudo cambiar la contraseña. Intenta de nuevo." };
  // Con la contraseña nueva, la sesión de este navegador se renueva para que no se cierre.
  await (await createSessionClient()).auth.signInWithPassword({ email: usuario.email, password: claveNueva });
  await registrarAuditoria({ accion: "cambiar_contrasena", entidad: "perfiles", entidadId: usuario.id, detalle: "Cambió su contraseña" });
  return {};
}
