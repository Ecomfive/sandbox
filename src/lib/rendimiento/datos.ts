import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { construirAreas } from "@/lib/nav-data";
import { paginasBuscables } from "@/lib/paleta";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { armarJornada, rangoDelDia, type Jornada } from "./jornada";

export interface PersonaDelDia {
  id: string;
  nombre: string;
  jornada: Jornada;
}

/** Todas las páginas del sistema (menú y pestañas), para ponerle nombre a una ruta. */
const PAGINAS = paginasBuscables(construirAreas([{ nombre: "Dropi", tieneDatos: true }]), null).sort((a, b) => b.href.length - a.href.length);

/** El nombre de la página de una ruta: la del menú o la pestaña que más se le parece («/retiros/12» es «Conciliación de Retiros»). */
export function paginaDeRuta(ruta: string): string {
  const p = PAGINAS.find((x) => (x.href === "/" ? ruta === "/" : ruta === x.href || ruta.startsWith(`${x.href}/`)));
  return p ? p.etiqueta : ruta;
}

/**
 * La jornada de cada persona activa en un día de Panamá (Equipo › Rendimiento): sus minutos en el sistema (migración 0166) y lo
 * que guardó (auditoría). Las que no tuvieron nada salen al final, sin jornada. `null` si falta la migración.
 */
export async function cargarDia(dia: string): Promise<PersonaDelDia[] | null> {
  const supabase = createServiceClient();
  const { desde, hasta } = rangoDelDia(dia);
  const [perfiles, minutos, auditoria] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, email").eq("activo", true),
    traerTodasConError<{ usuario_id: string; minuto: string; ruta: string }>((a, b) =>
      supabase.from("actividad_minutos").select("usuario_id, minuto, ruta").gte("minuto", desde).lt("minuto", hasta).order("minuto").range(a, b),
    ),
    traerTodasConError<{ usuario_id: string | null; accion: string; detalle: string | null; antes: Record<string, string> | null; despues: Record<string, string> | null; creado_en: string }>(
      (a, b) =>
        supabase
          .from("historial_auditoria")
          .select("usuario_id, accion, detalle, antes, despues, creado_en")
          .not("usuario_id", "is", null)
          .gte("creado_en", desde)
          .lt("creado_en", hasta)
          .order("creado_en")
          .range(a, b),
    ),
  ]);
  if (minutos.error) return null;
  const minutosDe = new Map<string, { minuto: string; ruta: string }[]>();
  for (const m of minutos.data ?? []) (minutosDe.get(m.usuario_id) ?? minutosDe.set(m.usuario_id, []).get(m.usuario_id)!).push(m);
  const accionesDe = new Map<string, { creadoEn: string; texto: string }[]>();
  for (const e of auditoria.data ?? []) {
    const lista = accionesDe.get(e.usuario_id!) ?? accionesDe.set(e.usuario_id!, []).get(e.usuario_id!)!;
    lista.push({ creadoEn: e.creado_en, texto: formatearEventoAuditoria({ ...e, usuario_nombre: null }) });
  }
  return (perfiles.data ?? [])
    .map((p) => ({ id: p.id as string, nombre: (p.nombre as string | null) || (p.email as string), jornada: armarJornada(minutosDe.get(p.id) ?? [], accionesDe.get(p.id) ?? [], paginaDeRuta) }))
    .sort((a, b) => b.jornada.minutosActivos - a.jornada.minutosActivos || b.jornada.acciones - a.jornada.acciones || a.nombre.localeCompare(b.nombre));
}
