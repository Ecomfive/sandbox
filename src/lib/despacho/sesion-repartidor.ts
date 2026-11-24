// Panel del repartidor: la sesión de una cuenta de repartidor. Toda página y acción del panel empieza con `requireRepartidor` o
// `cuentaRepartidorActual`; el repartidor (y su nombre en Despacho ciudad) sale de la base, nunca de lo que mande el navegador. Solo servidor.

import { redirect } from "next/navigation";
import { cache } from "react";
import { getUsuarioIdSesion, getUsuarioSesion } from "@/lib/auth";
import { cuentaDeRepartidor, type CuentaRepartidor } from "./cuenta-repartidor";

/** La cuenta de repartidor con sesión en esta petición (o null). */
export const cuentaRepartidorActual = cache(async (): Promise<CuentaRepartidor | null> => {
  const usuarioId = await getUsuarioIdSesion();
  return usuarioId ? cuentaDeRepartidor(usuarioId) : null;
});

/** Si entra con la clave temporal que le dio un administrador (`app_metadata.clave_temporal`): el panel le pide elegir la suya. */
export async function repartidorConClaveTemporal(): Promise<boolean> {
  return (await getUsuarioSesion())?.app_metadata?.clave_temporal === true;
}

/** Para las páginas del panel: sin sesión va a entrar; con sesión del equipo (no de repartidor), al sistema. */
export async function requireRepartidor(): Promise<CuentaRepartidor> {
  const cuenta = await cuentaRepartidorActual();
  if (cuenta) return cuenta;
  redirect((await getUsuarioIdSesion()) ? "/" : "/login");
}
