import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { construirAreas } from "@/lib/nav-data";
import { paginasBuscables } from "@/lib/paleta";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { nombreSinNumero } from "@/lib/whatsapp/telefono-oculto";
import { armarJornada, rangoDelDia, type Dispositivo, type Jornada, type MensajeEnviado } from "./jornada";

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

type FilaMinuto = { usuario_id: string; minuto: string; ruta: string; dispositivo?: Dispositivo | null };

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Los WhatsApp que una persona mandó desde el CRM en un rato, con el nombre del chat. Sin los importados del celular: son historia, no lo que se mandó ese día. */
async function mensajesDe(supabase: ReturnType<typeof createServiceClient>, persona: string, desde: string, hasta: string): Promise<MensajeEnviado[]> {
  const { data } = await traerTodasConError<{ conversacion_id: string; momento: string; wa_id: string | null; whatsapp_conversaciones: unknown }>((a, b) =>
    supabase
      .from("whatsapp_mensajes")
      .select("conversacion_id, momento, wa_id, whatsapp_conversaciones(nombre_perfil, dropshippers(nombre))")
      .eq("autor_id", persona)
      .eq("direccion", "saliente")
      .gte("momento", desde)
      .lt("momento", hasta)
      .order("id")
      .range(a, b),
  );
  return (data ?? [])
    .filter((m) => !m.wa_id?.startsWith("import:"))
    .map((m) => {
      const c = uno(m.whatsapp_conversaciones as { nombre_perfil: string | null; dropshippers: { nombre: string | null } | { nombre: string | null }[] | null } | null);
      return { momento: m.momento, chat: uno(c?.dropshippers)?.nombre ?? c?.nombre_perfil ?? nombreSinNumero(m.conversacion_id) };
    });
}

/**
 * La jornada de cada persona activa en un día de Panamá (Equipo › Rendimiento): sus minutos en el sistema (migración 0166) y lo
 * que guardó (auditoría). Las que no tuvieron nada salen al final, sin jornada. `null` si falta la migración.
 * Con `soloPersona`, la de esa persona, con sus WhatsApp: es lo que pide su ficha.
 */
export async function cargarDia(dia: string, soloPersona?: string): Promise<PersonaDelDia[] | null> {
  const supabase = createServiceClient();
  const { desde, hasta } = rangoDelDia(dia);
  const traerMinutos = (columnas: string) =>
    traerTodasConError<FilaMinuto>((a, b) => {
      const consulta = supabase.from("actividad_minutos").select(columnas).gte("minuto", desde).lt("minuto", hasta);
      return (soloPersona ? consulta.eq("usuario_id", soloPersona) : consulta).order("minuto").range(a, b) as unknown as PromiseLike<{ data: FilaMinuto[] | null; error: { message: string } | null }>;
    });
  const consultaPerfiles = supabase.from("perfiles").select("id, nombre, email").eq("activo", true);
  const [perfiles, minutos, auditoria, mensajes] = await Promise.all([
    soloPersona ? consultaPerfiles.eq("id", soloPersona) : consultaPerfiles,
    // Sin la migración 0242 no hay dispositivo: los minutos salen igual.
    traerMinutos("usuario_id, minuto, ruta, dispositivo").then((r) => (r.error ? traerMinutos("usuario_id, minuto, ruta") : r)),
    traerTodasConError<{ usuario_id: string | null; accion: string; detalle: string | null; antes: Record<string, string> | null; despues: Record<string, string> | null; creado_en: string }>(
      (a, b) => {
        const consulta = supabase.from("historial_auditoria").select("usuario_id, accion, detalle, antes, despues, creado_en").gte("creado_en", desde).lt("creado_en", hasta);
        return (soloPersona ? consulta.eq("usuario_id", soloPersona) : consulta.not("usuario_id", "is", null)).order("creado_en").range(a, b);
      },
    ),
    soloPersona ? mensajesDe(supabase, soloPersona, desde, hasta) : [],
  ]);
  if (minutos.error) return null;
  const minutosDe = new Map<string, FilaMinuto[]>();
  for (const m of minutos.data ?? []) (minutosDe.get(m.usuario_id) ?? minutosDe.set(m.usuario_id, []).get(m.usuario_id)!).push(m);
  const accionesDe = new Map<string, { creadoEn: string; texto: string }[]>();
  for (const e of auditoria.data ?? []) {
    const lista = accionesDe.get(e.usuario_id!) ?? accionesDe.set(e.usuario_id!, []).get(e.usuario_id!)!;
    lista.push({ creadoEn: e.creado_en, texto: formatearEventoAuditoria({ ...e, usuario_nombre: null }) });
  }
  return (perfiles.data ?? [])
    .map((p) => ({ id: p.id as string, nombre: (p.nombre as string | null) || (p.email as string), jornada: armarJornada(minutosDe.get(p.id) ?? [], accionesDe.get(p.id) ?? [], paginaDeRuta, mensajes) }))
    .sort((a, b) => b.jornada.minutosActivos - a.jornada.minutosActivos || b.jornada.acciones - a.jornada.acciones || a.nombre.localeCompare(b.nombre));
}
