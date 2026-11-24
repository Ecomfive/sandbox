import { after } from "next/server";
import { requireModulo } from "@/lib/auth";
import { refrescarAnalisisMeta } from "@/lib/meta-ads/analisis-guardado";
import { getPaisActual } from "@/lib/pais";
import { cargarAnunciosMeta, periodoValido, type DatosMeta } from "@/lib/meta-ads/datos";
import { tokenDeMeta } from "@/lib/meta-ads/api";
import { geminiConectado } from "@/lib/meta-ads/gemini-video";
import { hoyEnPanama } from "@/lib/meta-ads/sincronizar";
import { createServiceClient } from "@/lib/supabase/server";

export type ParametrosMeta = Promise<{ [k: string]: string | string[] | undefined }>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lo que necesita cada pestaña de Anuncios Meta: la persona, el país de la barra y todo lo armado para el periodo y la cuenta elegidos en la dirección (`?periodo=` y `?cuenta=`). */
export async function cargarPaginaMeta(searchParams: ParametrosMeta): Promise<{ datos: DatosMeta; escribe: boolean; pais: string; paisId: string; hayToken: boolean }> {
  const usuario = await requireModulo("anuncios-meta");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await cargarAnunciosMeta(supabase, { paisId: pais.id, cuentaId: uno(sp.cuenta) ?? null, periodo: periodoValido(uno(sp.periodo)), hoy: hoyEnPanama(), producto: uno(sp.producto) ?? null });
  return { datos: { ...datos, iaConectada: geminiConectado() }, escribe: !usuario.modulosSoloLectura.includes("anuncios-meta"), pais: pais.nombre, paisId: pais.id, hayToken: tokenDeMeta() !== null };
}

/**
 * Si el análisis del historial todavía no está hecho (o es de hace más de un día), lo prepara en segundo plano, después de contestar la página: la persona no espera. Normalmente lo deja hecho el cron de Meta;
 * esto cubre el primer día y los fallos. Un bloqueo evita que dos personas que abren la pantalla a la vez lancen dos cálculos.
 */
export function prepararAnalisisSiHaceFalta(datos: DatosMeta, paisId: string, paisNombre: string): void {
  if (!datos.analisisPendiente || datos.faltaMigracion || datos.cuentas.length === 0) return;
  after(async () => {
    await refrescarAnalisisMeta(createServiceClient(), { paisId, paisNombre, hoy: hoyEnPanama(), interpretar: true, bloqueo: true });
  });
}
