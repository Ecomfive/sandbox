import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { cargarAnunciosMeta, periodoValido, type DatosMeta } from "@/lib/meta-ads/datos";
import { tokenDeMeta } from "@/lib/meta-ads/api";
import { hoyEnPanama } from "@/lib/meta-ads/sincronizar";
import { createServiceClient } from "@/lib/supabase/server";

export type ParametrosMeta = Promise<{ [k: string]: string | string[] | undefined }>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lo que necesita cada pestaña de Anuncios Meta: la persona, el país de la barra y todo lo armado para el periodo y la cuenta elegidos en la dirección (`?periodo=` y `?cuenta=`). */
export async function cargarPaginaMeta(searchParams: ParametrosMeta): Promise<{ datos: DatosMeta; escribe: boolean; pais: string; hayToken: boolean }> {
  const usuario = await requireModulo("anuncios-meta");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await cargarAnunciosMeta(supabase, { paisId: pais.id, cuentaId: uno(sp.cuenta) ?? null, periodo: periodoValido(uno(sp.periodo)), hoy: hoyEnPanama() });
  return { datos, escribe: !usuario.modulosSoloLectura.includes("anuncios-meta"), pais: pais.nombre, hayToken: tokenDeMeta() !== null };
}
