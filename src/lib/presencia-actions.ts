"use server";

import { getUsuarioIdSesion } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { rutaDeLatido } from "@/lib/rendimiento/jornada";

/**
 * El "estoy aquí" que manda `LatidoPresencia` cada minuto mientras la pestaña está visible. Sin sesión no hace nada (no es un
 * error: puede llegar justo cuando la sesión ya venció). Siempre guarda «visto por última vez»; si además la persona estaba
 * usando el sistema (`trabajando`: mouse o teclado en los últimos minutos), anota ese minuto con la página en que estaba
 * (Equipo › Rendimiento, migración 0166). Varias pestañas en el mismo minuto cuentan una vez. Sin la migración, solo lo primero.
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
  await supabase
    .from("actividad_minutos")
    .upsert({ usuario_id: id, minuto: ahora.toISOString(), ruta: limpia }, { onConflict: "usuario_id,minuto", ignoreDuplicates: true });
}
