"use server";

import { headers } from "next/headers";
import { getUsuarioActual, getUsuarioIdSesion } from "@/lib/auth";
import { veEnLinea, type PersonaEnLinea } from "@/lib/en-linea";
import { paginaDeRuta } from "@/lib/rendimiento/datos";
import { createServiceClient } from "@/lib/supabase/server";
import { dispositivoDeAgente, rutaDeLatido } from "@/lib/rendimiento/jornada";

/**
 * El "estoy aquí" que manda `LatidoPresencia` cada minuto mientras la pestaña está visible. Sin sesión no hace nada (no es un
 * error: puede llegar justo cuando la sesión ya venció). Siempre guarda «visto por última vez»; si además la persona estaba
 * usando el sistema (`trabajando`: mouse o teclado en los últimos minutos), anota ese minuto con la página en que estaba
 * (Equipo › Rendimiento, migración 0166) y si venía de una computadora o de un teléfono (migración 0242). Varias pestañas en el mismo minuto cuentan una vez.
 * Sin la migración 0166, solo lo primero; sin la 0242, el minuto sin dispositivo.
 */
export async function registrarActividad(ruta?: string, trabajando?: boolean) {
  const id = await getUsuarioIdSesion();
  if (!id) return;
  const supabase = createServiceClient();
  const ahora = new Date();
  // Solo cuentas activas: una suspendida con la sesión todavía viva no aparece «en línea» ni suma minutos (auditoría de seguridad, 18 nov 2026).
  const { data: activa } = await supabase.from("perfiles").update({ ultima_actividad_en: ahora.toISOString() }).eq("id", id).eq("activo", true).select("id");
  if (!activa?.length) return;
  const limpia = rutaDeLatido(ruta);
  if (trabajando !== true || !limpia) return;
  ahora.setUTCSeconds(0, 0);
  const fila = { usuario_id: id, minuto: ahora.toISOString(), ruta: limpia };
  const opciones = { onConflict: "usuario_id,minuto", ignoreDuplicates: true };
  const dispositivo = dispositivoDeAgente((await headers()).get("user-agent"));
  const { error } = await supabase.from("actividad_minutos").upsert({ ...fila, dispositivo }, opciones);
  if (error) await supabase.from("actividad_minutos").upsert(fila, opciones);
}


/** Con un latido en los últimos 135 s (dos latidos de `LatidoPresencia`, el mismo umbral del «Activo» de Usuarios y roles). */
const EN_LINEA_MS = 135_000;

/** Quién del equipo está en línea ahora y en qué página. Solo para Admin y CEO; a cualquier otro le devuelve la lista vacía. */
export async function quienesEnLinea(): Promise<PersonaEnLinea[]> {
  const usuario = await getUsuarioActual();
  if (!usuario || !veEnLinea(usuario.rolNombre)) return [];
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - EN_LINEA_MS).toISOString();
  const [{ data: perfiles }, { data: minutos }] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, email, avatar_url").eq("activo", true).gte("ultima_actividad_en", desde),
    supabase.from("actividad_minutos").select("usuario_id, ruta").gte("minuto", new Date(Date.now() - 3 * 60_000).toISOString()).order("minuto", { ascending: false }),
  ]);
  const paginas = new Map<string, string>();
  for (const m of minutos ?? []) if (!paginas.has(m.usuario_id as string)) paginas.set(m.usuario_id as string, paginaDeRuta(m.ruta as string));
  return (perfiles ?? [])
    .map((p) => ({ id: p.id as string, nombre: ((p.nombre as string | null) || (p.email as string)).trim(), avatarUrl: (p.avatar_url as string | null) ?? null, pagina: paginas.get(p.id as string) ?? null }))
    .sort((a, b) => (a.id === usuario.id ? -1 : b.id === usuario.id ? 1 : a.nombre.localeCompare(b.nombre, "es")));
}
