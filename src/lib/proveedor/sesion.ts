// Portal del proveedor: la sesión de una cuenta del portal. Toda página y acción del portal empieza con `requireProveedor` o
// `cuentaProveedorActual`; el proveedor sale de la base, nunca de lo que mande el navegador. Solo servidor.

import { redirect } from "next/navigation";
import { cache } from "react";
import { getUsuarioIdSesion, getUsuarioSesion } from "@/lib/auth";
import { cuentaDeProveedor, type CuentaProveedor } from "./cuenta";

/** La cuenta del portal con sesión en esta petición (o null). */
export const cuentaProveedorActual = cache(async (): Promise<CuentaProveedor | null> => {
  const usuarioId = await getUsuarioIdSesion();
  return usuarioId ? cuentaDeProveedor(usuarioId) : null;
});

/**
 * Si la cuenta todavía entra con la clave temporal que le dio un administrador (marca `clave_temporal` en el `app_metadata` de su
 * usuario: la pone `cuenta-actions.ts` y la quita `cambiarClaveProveedor`). Mientras la tenga, el portal le pide elegir su clave.
 */
export async function tieneClaveTemporal(): Promise<boolean> {
  return (await getUsuarioSesion())?.app_metadata?.clave_temporal === true;
}

/** Para las páginas del portal: sin sesión va a entrar; con sesión del equipo (no de proveedor), al sistema. */
export async function requireProveedor(): Promise<CuentaProveedor> {
  const cuenta = await cuentaProveedorActual();
  if (cuenta) return cuenta;
  redirect((await getUsuarioIdSesion()) ? "/" : "/login");
}
