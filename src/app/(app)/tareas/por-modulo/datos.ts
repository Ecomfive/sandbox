import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { etiquetaRecomendacion } from "@/lib/publicaciones/recomendaciones";
import { etiquetaEstado as etiquetaEstadoDropi } from "@/lib/publicaciones/tareas";
import { etiquetaEstado as etiquetaEstadoEquipo } from "@/lib/tareas/tareas";
import { MODULO_EQUIPO, type TareaDeModulo } from "@/lib/tareas/por-modulo";

type Fila = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Las del tablero del equipo que siguen abiertas. */
const CERRADAS_EQUIPO = ["hecho", "archivado", "aprobado"];

/** «PUB-0290 · Base Magica Zephoco». */
function publicacion(p: Fila | null): string | null {
  if (!p) return null;
  const numero = p.numero == null ? null : `PUB-${String(p.numero).padStart(4, "0")}`;
  return [numero, texto(p.nombre)].filter(Boolean).join(" · ") || null;
}

/**
 * Las tareas abiertas de la persona en cada módulo donde viven tareas: el tablero del equipo (asignadas a ella), Gestión de IDs Dropi (las escritas a mano
 * donde es responsable o una de las personas, y las recomendaciones aceptadas a su nombre, de todos los países) y el CRM de dropshippers (a su cargo). Un
 * módulo se lee solo si la persona tiene acceso. Si a la base le falta una migración, ese módulo no sale y los demás sí.
 */
export async function cargarMisTareasPorModulo(supabase: SupabaseClient, usuario: UsuarioActual): Promise<TareaDeModulo[]> {
  const yo = usuario.id;
  const acceso = new Set(usuario.modulos);
  const tareas: TareaDeModulo[] = [];

  const { data: paises } = await supabase.from("paises").select("id, nombre");
  const nombrePais = new Map((paises ?? []).map((p) => [String(p.id), String(p.nombre)]));

  const lecturas: Promise<void>[] = [];

  if (acceso.has(MODULO_EQUIPO))
    lecturas.push(
      (async () => {
        const { data, error } = await supabase
          .from("tareas_equipo")
          .select("id, titulo, estado, fecha_limite, modulo")
          .eq("responsable_id", yo)
          .not("estado", "in", `(${CERRADAS_EQUIPO.join(",")})`)
          .limit(500);
        if (error) return;
        for (const f of (data ?? []) as Fila[])
          tareas.push({
            origen: "equipo",
            id: String(f.id),
            titulo: String(f.titulo ?? ""),
            detalle: "Tablero del equipo",
            pais: null,
            plazo: texto(f.fecha_limite),
            estado: etiquetaEstadoEquipo(String(f.estado ?? "")),
            modulo: texto(f.modulo) ?? MODULO_EQUIPO,
            href: `/tareas?abrir=${f.id}`,
          });
      })(),
    );

  if (acceso.has("publicaciones-dropi")) {
    lecturas.push(
      (async () => {
        // Donde es una de las personas (migración 0255); sin la tabla, solo las de responsable principal.
        const { data: otras } = await supabase.from("dropi_tareas_responsables").select("tarea_id").eq("persona_id", yo).limit(1000);
        const ids = (otras ?? []).map((o) => String(o.tarea_id));
        const filtro = ids.length ? `responsable_id.eq.${yo},id.in.(${ids.join(",")})` : `responsable_id.eq.${yo}`;
        const conEstados = await supabase.from("dropi_publicaciones_tareas").select("id, titulo, plazo, estado, dropi_publicaciones(numero, nombre, pais_id)").or(filtro).neq("estado", "hecha").is("archivada_en", null).limit(1000);
        // Sin estados (migración 0178): las que no están hechas.
        const r = conEstados.error ? await supabase.from("dropi_publicaciones_tareas").select("id, titulo, plazo, dropi_publicaciones(numero, nombre, pais_id)").or(filtro).is("hecha_en", null).limit(1000) : conEstados;
        if (r.error) return;
        for (const f of (r.data ?? []) as Fila[]) {
          const p = uno(f.dropi_publicaciones as Fila | Fila[] | null);
          tareas.push({
            origen: "dropi",
            id: String(f.id),
            titulo: String(f.titulo ?? ""),
            detalle: publicacion(p),
            pais: p ? (nombrePais.get(String(p.pais_id)) ?? null) : null,
            plazo: texto(f.plazo),
            estado: etiquetaEstadoDropi(String(f.estado ?? "por_hacer")),
            modulo: "publicaciones-dropi",
            href: "/publicaciones-dropi/tareas",
          });
        }
      })(),
    );
    lecturas.push(
      (async () => {
        const { data, error } = await supabase
          .from("dropi_publicaciones_decisiones")
          .select("id, tipo, recomendacion, plazo, dropi_publicaciones(numero, nombre, pais_id)")
          .eq("decision", "aceptada")
          .eq("responsable_id", yo)
          .is("hecha_en", null)
          .limit(1000);
        if (error) return;
        for (const f of (data ?? []) as Fila[]) {
          const p = uno(f.dropi_publicaciones as Fila | Fila[] | null);
          tareas.push({
            origen: "recomendacion",
            id: String(f.id),
            titulo: (f.recomendacion as { titulo?: string } | null)?.titulo || etiquetaRecomendacion(String(f.tipo ?? "")),
            detalle: publicacion(p),
            pais: p ? (nombrePais.get(String(p.pais_id)) ?? null) : null,
            plazo: texto(f.plazo),
            estado: "Recomendación aceptada",
            modulo: "publicaciones-dropi",
            href: "/publicaciones-dropi/tareas",
          });
        }
      })(),
    );
  }

  if (acceso.has("crm-dropshippers"))
    lecturas.push(
      (async () => {
        const { data, error } = await supabase
          .from("tareas_dropshipper")
          .select("id, titulo, vence, estado, dropshipper_id, conversacion_id, dropshippers(nombre), whatsapp_conversaciones(nombre_personalizado, nombre_perfil)")
          .eq("responsable_id", yo)
          .neq("estado", "hecha")
          .limit(1000);
        if (error) return;
        for (const f of (data ?? []) as Fila[]) {
          const ds = uno(f.dropshippers as Fila | Fila[] | null);
          const chat = uno(f.whatsapp_conversaciones as Fila | Fila[] | null);
          tareas.push({
            origen: "crm",
            id: String(f.id),
            titulo: String(f.titulo ?? ""),
            detalle: texto(ds?.nombre) ?? texto(chat?.nombre_personalizado) ?? texto(chat?.nombre_perfil),
            pais: null,
            plazo: texto(f.vence),
            estado: f.estado === "esperando" ? "Esperando el producto" : "Pendiente",
            modulo: "crm-dropshippers",
            href: f.conversacion_id ? `/crm-dropshippers/bandeja?abrir=${f.conversacion_id}` : f.dropshipper_id ? `/crm-dropshippers?abrir=${f.dropshipper_id}` : "/crm-dropshippers/tareas",
          });
        }
      })(),
    );

  await Promise.all(lecturas);
  return tareas;
}
