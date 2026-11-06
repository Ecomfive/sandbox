"use server";

import { headers } from "next/headers";
import { getUsuarioIdSesion } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { dispositivoDeAgente, rutaDeLatido } from "@/lib/rendimiento/jornada";

/**
 * El "estoy aquí" que manda `LatidoPresencia` cada minuto mientras la pestaña está visible. Sin sesión no hace nada (no es un
 * error: puede llegar justo cuando la sesión ya venció). Siempre guarda «visto por última vez»; si además la persona estaba
 * usando el sistema (`trabajando`: mouse o teclado en los últimos minutos), anota ese minuto con la página en que estaba
 * (Equipo › Rendimiento, migración 0166) y si venía de una computadora o de un teléfono (migración 0241). Varias pestañas en el mismo minuto cuentan una vez.
 * Sin la migración 0166, solo lo primero; sin la 0241, el minuto sin dispositivo.
 */
export async function registrarActividad(ruta?: string, trabajando?: boolean) {
  const id = await getUsuarioIdSesion();
  if (!id) return;
  const supabase = createServiceClient();
  const ahora = new Date();
  await supabase.from("perfiles").update({ ultima_actividad_en: ahora.toISOString() }).eq("id", id);
  const limpia = rutaDeLatido(ruta);
  if (trabajando !== true || !limpia) return;
  ahora.setUTCSeconds(0, 0);
  const fila = { usuario_id: id, minuto: ahora.toISOString(), ruta: limpia };
  const opciones = { onConflict: "usuario_id,minuto", ignoreDuplicates: true };
  const dispositivo = dispositivoDeAgente((await headers()).get("user-agent"));
  const { error } = await supabase.from("actividad_minutos").upsert({ ...fila, dispositivo }, opciones);
  if (error) await supabase.from("actividad_minutos").upsert(fila, opciones);
}
