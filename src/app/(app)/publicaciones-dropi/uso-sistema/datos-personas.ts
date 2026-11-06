import type { SupabaseClient } from "@supabase/supabase-js";
import { paginaDeRuta } from "@/lib/rendimiento/datos";
import { diaPanama, rangoDelDia } from "@/lib/rendimiento/jornada";
import type { PlataformaExterna } from "@/lib/rendimiento/uso-externo";
import { frenteDeRuta, restarDias, type ConteoPersona, type DatosUsoPersonas, type JornadaDia, type MinutosExterno, type MinutosPagina, type WhatsappDia } from "@/lib/rendimiento/uso-personas";
import { traerTodasConError } from "@/lib/supabase/paginar";

/** Los días que se pueden mirar: el panel recorta desde aquí. */
export const DIAS_USO = 30;

const CELULAR = "Desde el celular";

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Agrupa filas sueltas por persona y día, sumando. */
function contar(claves: { persona: string; dia: string }[]): ConteoPersona[] {
  const m = new Map<string, ConteoPersona>();
  for (const c of claves) {
    const k = `${c.persona}|${c.dia}`;
    const x = m.get(k) ?? { ...c, n: 0 };
    x.n++;
    m.set(k, x);
  }
  return [...m.values()];
}

/** Lo que hizo cada persona activa en los últimos 30 días, ya agrupado por día. `null` si falta la migración 0166. */
export async function cargarUsoPersonas(supabase: SupabaseClient): Promise<(DatosUsoPersonas & { hoy: string }) | null> {
  const hoy = diaPanama();
  const inicio = rangoDelDia(restarDias(hoy, DIAS_USO - 1)).desde;

  const [perfiles, minutos, auditoria, mensajes, externos, extensiones] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, email, avatar_url, ultima_actividad_en, roles(nombre)").eq("activo", true),
    traerTodasConError<{ usuario_id: string; minuto: string; ruta: string }>((a, b) =>
      supabase.from("actividad_minutos").select("usuario_id, minuto, ruta").gte("minuto", inicio).order("minuto").range(a, b),
    ),
    traerTodasConError<{ usuario_id: string; creado_en: string }>((a, b) =>
      supabase.from("historial_auditoria").select("usuario_id, creado_en").not("usuario_id", "is", null).gte("creado_en", inicio).order("creado_en").range(a, b),
    ),
    // Sin los chats importados del celular: son historia, no lo que se mandó ese día.
    traerTodasConError<{ autor_id: string | null; autor_nombre: string | null; momento: string; wa_id: string | null; whatsapp_conversaciones: unknown }>((a, b) =>
      supabase
        .from("whatsapp_mensajes")
        .select("autor_id, autor_nombre, momento, wa_id, whatsapp_conversaciones(whatsapp_numeros(nombre))")
        .eq("direccion", "saliente")
        .gte("momento", inicio)
        .order("id")
        .range(a, b),
    ),
    // Sin la migración 0240 no hay nada de afuera: el panel sale igual, todos sin medir.
    traerTodasConError<{ usuario_id: string; minuto: string; plataforma: PlataformaExterna; seccion: string }>((a, b) =>
      supabase.from("uso_externo_minutos").select("usuario_id, minuto, plataforma, seccion").gte("minuto", inicio).order("minuto").range(a, b),
    ),
    supabase.from("uso_externo_extensiones").select("usuario_id"),
  ]);
  if (minutos.error) return null;

  const paginas = new Map<string, { persona: string; dia: string; ruta: string; minutos: number }>();
  const jornada = new Map<string, { persona: string; dia: string; primero: number; ultimo: number }>();
  for (const m of minutos.data ?? []) {
    const dia = diaPanama(m.minuto);
    const k = `${m.usuario_id}|${dia}|${m.ruta}`;
    const x = paginas.get(k) ?? { persona: m.usuario_id, dia, ruta: m.ruta, minutos: 0 };
    x.minutos++;
    paginas.set(k, x);
    const t = new Date(m.minuto).getTime();
    const kj = `${m.usuario_id}|${dia}`;
    const j = jornada.get(kj) ?? { persona: m.usuario_id, dia, primero: t, ultimo: t };
    j.primero = Math.min(j.primero, t);
    j.ultimo = Math.max(j.ultimo, t);
    jornada.set(kj, j);
  }
  // Varias rutas son la misma página (cada ficha tiene la suya).
  const porPagina = new Map<string, MinutosPagina>();
  for (const p of paginas.values()) {
    const pagina = paginaDeRuta(p.ruta);
    const frente = frenteDeRuta(p.ruta);
    const k = `${p.persona}|${p.dia}|${frente}|${pagina}`;
    const x = porPagina.get(k) ?? { persona: p.persona, dia: p.dia, frente, pagina, minutos: 0 };
    x.minutos += p.minutos;
    porPagina.set(k, x);
  }
  const jornadas: JornadaDia[] = [...jornada.values()].map((j) => ({ persona: j.persona, dia: j.dia, minutos: Math.round((j.ultimo - j.primero) / 60_000) + 1 }));

  const whatsapp = new Map<string, WhatsappDia>();
  const delCrm: { persona: string; dia: string }[] = [];
  for (const m of mensajes.data ?? []) {
    if (!m.autor_nombre || m.wa_id?.startsWith("import:")) continue;
    const dia = diaPanama(m.momento);
    const numero = uno(uno(m.whatsapp_conversaciones as { whatsapp_numeros: { nombre: string | null } | { nombre: string | null }[] | null } | null)?.whatsapp_numeros)?.nombre ?? "Sin número";
    const k = `${numero}|${dia}`;
    const x = whatsapp.get(k) ?? { numero, dia, crm: 0, celular: 0 };
    if (m.autor_nombre === CELULAR) x.celular++;
    else x.crm++;
    whatsapp.set(k, x);
    if (m.autor_id) delCrm.push({ persona: m.autor_id, dia });
  }

  const externo = new Map<string, MinutosExterno>();
  for (const e of externos.data ?? []) {
    const dia = diaPanama(e.minuto);
    const k = `${e.usuario_id}|${dia}|${e.plataforma}|${e.seccion}`;
    const x = externo.get(k) ?? { persona: e.usuario_id, dia, plataforma: e.plataforma, seccion: e.seccion, minutos: 0 };
    x.minutos++;
    externo.set(k, x);
  }

  return {
    hoy,
    externos: [...externo.values()],
    conExtension: (extensiones.data ?? []).map((e) => e.usuario_id as string),
    personas: ((perfiles.data ?? []) as { id: string; nombre: string | null; email: string; avatar_url: string | null; ultima_actividad_en: string | null; roles: unknown }[]).map((p) => ({
      id: p.id,
      nombre: p.nombre || p.email,
      email: p.email,
      avatar: p.avatar_url,
      rol: uno(p.roles as { nombre: string } | { nombre: string }[] | null)?.nombre ?? null,
      ultimaVez: p.ultima_actividad_en,
    })),
    minutos: [...porPagina.values()],
    jornadas,
    cambios: contar((auditoria.data ?? []).map((a) => ({ persona: a.usuario_id, dia: diaPanama(a.creado_en) }))),
    mensajes: contar(delCrm),
    whatsapp: [...whatsapp.values()],
  };
}
