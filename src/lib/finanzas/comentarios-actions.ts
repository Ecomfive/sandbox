"use server";

// Acciones de los comentarios en cifras (mejora 92). Leer y comentar pide poder abrir el módulo de la página (un
// comentario no cambia ningún dato financiero, así que también puede quien tiene el Panel en solo lectura); borrar, solo
// quien lo escribió. Las menciones dejan un aviso «Para ti» (`notificarMenciones`). Devuelven el error como valor.

import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual } from "@/lib/auth";
import { mencionadosValidos, notificarMenciones } from "@/lib/menciones";
import { createServiceClient } from "@/lib/supabase/server";
import { PAGINAS_COMENTARIOS, enlaceAncla, limpiarTexto, nombreCifra, validarAncla } from "./comentarios";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_MIGRACION = "Falta correr la migración 0937 (comentarios) en Supabase.";

export interface ComentarioCifra {
  id: string;
  texto: string;
  autorId: string | null;
  autor: string;
  creadoEn: string;
  respuestaA: string | null;
  propio: boolean;
}

async function conAcceso(anclaCruda: unknown) {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "No hay sesión activa." } as const;
  const ancla = validarAncla(anclaCruda);
  if (!ancla) return { error: "Cifra inválida." } as const;
  if (!usuario.modulos.includes(PAGINAS_COMENTARIOS[ancla.pagina].modulo)) return { error: "No tienes acceso a esta página." } as const;
  return { usuario, ancla } as const;
}

export async function obtenerHiloCifra(anclaCruda: unknown): Promise<{ error: string } | { comentarios: ComentarioCifra[] }> {
  const a = await conAcceso(anclaCruda);
  if ("error" in a) return { error: a.error! };
  const { data, error } = await createServiceClient()
    .from("fin_comentarios")
    .select("id, texto, autor_id, autor_nombre, creado_en, respuesta_a")
    .eq("pagina", a.ancla.pagina)
    .eq("periodo", a.ancla.periodo)
    .eq("clave", a.ancla.clave)
    .order("creado_en")
    .limit(200);
  if (error) return { error: SIN_MIGRACION };
  return {
    comentarios: (data ?? []).map((c) => ({
      id: c.id as string,
      texto: c.texto as string,
      autorId: (c.autor_id as string | null) ?? null,
      autor: (c.autor_nombre as string | null) ?? "—",
      creadoEn: c.creado_en as string,
      respuestaA: (c.respuesta_a as string | null) ?? null,
      propio: c.autor_id === a.usuario.id,
    })),
  };
}

export async function comentarCifra(
  anclaCruda: unknown,
  textoCrudo: unknown,
  menciones: unknown,
  etiqueta: unknown,
): Promise<{ error?: string }> {
  const a = await conAcceso(anclaCruda);
  if ("error" in a) return { error: a.error };
  const texto = limpiarTexto(textoCrudo);
  if (!texto) return { error: "Escribe el comentario (hasta 2 000 caracteres)." };
  const ids = Array.isArray(menciones) ? menciones.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];
  const mencionados = await mencionadosValidos(ids, texto, a.usuario.id);
  const autor = a.usuario.nombre ?? a.usuario.email;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fin_comentarios")
    .insert({ pagina: a.ancla.pagina, periodo: a.ancla.periodo, clave: a.ancla.clave, texto, menciones: mencionados.map((m) => m.id), autor_id: a.usuario.id, autor_nombre: autor })
    .select("id")
    .single();
  if (error || !data) return { error: SIN_MIGRACION };
  const cifra = typeof etiqueta === "string" && etiqueta.trim() ? etiqueta.trim().slice(0, 120) : nombreCifra(a.ancla.clave);
  const pagina = PAGINAS_COMENTARIOS[a.ancla.pagina].titulo;
  await notificarMenciones({ mencionados, autorId: a.usuario.id, autorNombre: autor, titulo: `${pagina} · ${cifra}`, texto, href: enlaceAncla(a.ancla) });
  await registrarAuditoria({ accion: "comentar_cifra", entidad: "fin_comentarios", entidadId: data.id as string, detalle: `${pagina} · ${cifra}: ${texto}`.slice(0, 500) });
  return {};
}

export async function eliminarComentarioCifra(id: unknown): Promise<{ error?: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "No hay sesión activa." };
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Comentario inválido." };
  const supabase = createServiceClient();
  const { data: c, error: e0 } = await supabase.from("fin_comentarios").select("autor_id, pagina, texto").eq("id", id).maybeSingle();
  if (e0) return { error: SIN_MIGRACION };
  if (!c) return { error: "El comentario ya no existe." };
  if (c.autor_id !== usuario.id) return { error: "Solo quien lo escribió puede eliminarlo." };
  const { error } = await supabase.from("fin_comentarios").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar." };
  await registrarAuditoria({ accion: "eliminar_comentario_cifra", entidad: "fin_comentarios", entidadId: id, detalle: String(c.texto).slice(0, 500) });
  return {};
}
