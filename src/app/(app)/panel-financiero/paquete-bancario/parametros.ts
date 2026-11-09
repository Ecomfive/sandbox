// Lo que comparten la página del paquete bancario, su acción de guardar y la descarga en Excel: quién puede verlo y qué
// corte, entidad y secciones se pidieron (validado en el servidor, nunca tal cual llega del navegador).

import type { SupabaseClient } from "@supabase/supabase-js";
import { mesEnCursoPanama, leerPeriodo } from "@/lib/af4/fecha";
import type { UsuarioActual } from "@/lib/auth";
import { mesesCerrados } from "@/lib/finanzas/cargar-paquete-bancario";
import { cargarEntidades } from "@/lib/finanzas/cargar-entidades";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import type { Entidad } from "@/lib/finanzas/entidades";
import { corteSugerido, cortesDisponibles, leerEntidad, leerSecciones, seccionesPermitidas, type SeccionPaquete } from "@/lib/finanzas/paquete-bancario";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";

export const RUTA_PAQUETE = "/panel-financiero/paquete-bancario";

/** El paquete es de toda la empresa: con tiendas limitadas no se ve. */
export async function puedeVerPaquete(): Promise<boolean> {
  return veTodaLaEmpresa(await cargarTiendasPermitidas());
}

export interface ParametrosPaquete {
  corte: string;
  cortes: string[];
  entidad: Entidad | null;
  entidades: Entidad[];
  secciones: SeccionPaquete[];
  permitidas: SeccionPaquete[];
  cerrados: string[];
}

export async function leerParametrosPaquete(
  supabase: SupabaseClient,
  usuario: UsuarioActual,
  p: { corte?: unknown; entidad?: unknown; secciones?: unknown },
): Promise<ParametrosPaquete> {
  const mesEnCurso = mesEnCursoPanama();
  const [entidades, cerrados, primero] = await Promise.all([
    cargarEntidades(supabase),
    mesesCerrados(supabase),
    supabase.from("fin_movimientos").select("periodo").order("periodo").limit(1),
  ]);
  const inicio = primero.data?.[0]?.periodo ? String(primero.data[0].periodo).slice(0, 10) : null;
  const cortes = cortesDisponibles(mesEnCurso, inicio);
  const pedido = leerPeriodo(p.corte);
  const sugerido = corteSugerido(mesEnCurso, cerrados);
  const corte = pedido && cortes.includes(pedido) ? pedido : cortes.includes(sugerido) ? sugerido : (cortes[0] ?? sugerido);
  const codigo = entidades.length > 1 ? leerEntidad(p.entidad, entidades.map((e) => e.codigo)) : "consolidado";
  const permitidas = seccionesPermitidas(usuario.modulos);
  return {
    corte,
    cortes,
    entidad: entidades.find((e) => e.codigo === codigo) ?? null,
    entidades,
    secciones: leerSecciones(p.secciones, permitidas),
    permitidas,
    cerrados,
  };
}
