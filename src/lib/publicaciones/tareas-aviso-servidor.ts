import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Aviso el día del plazo (8 nov 2026, pedido de Alcides): cada mañana (la tarea programada «notificaciones-diarias», 8:00 de Panamá), a cada persona que hace una
 * tarea de Gestión de IDs Dropi sin hacer y sin archivar que vence hoy le llega un aviso en la campana. Si ese día ya se le avisó de esa tarea, no se repite.
 * Nunca lanza: si algo falla, el resto de la tarea programada sigue.
 */
export async function avisarTareasPublicacionesDeHoy(supabase: SupabaseClient): Promise<number> {
  try {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
    const { data: tareas, error } = await supabase
      .from("dropi_publicaciones_tareas")
      .select("id, titulo, responsable_id, plazo, estado, archivada_en, dropi_publicaciones!inner(nombre)")
      .eq("plazo", hoy)
      .is("hecha_en", null)
      .is("archivada_en", null)
      .limit(1000);
    if (error || !tareas?.length) return 0;
    const ids = tareas.map((t) => t.id as string);
    const { data: otros } = await supabase.from("dropi_tareas_responsables").select("tarea_id, persona_id").in("tarea_id", ids);
    const desde = `${hoy}T05:00:00Z`; // medianoche de Panamá
    let avisos = 0;
    for (const t of tareas) {
      if (t.estado === "hecha") continue;
      const personas = new Set([t.responsable_id as string | null, ...(otros ?? []).filter((o) => o.tarea_id === t.id).map((o) => o.persona_id as string)].filter((x): x is string => !!x));
      const pub = t.dropi_publicaciones as { nombre?: string } | { nombre?: string }[] | null;
      const nombrePub = (Array.isArray(pub) ? pub[0]?.nombre : pub?.nombre) ?? "Publicación";
      const titulo = `Vence hoy: ${t.titulo}`.slice(0, 300);
      for (const persona of personas) {
        const { count } = await supabase.from("notificaciones_usuario").select("id", { count: "exact", head: true }).eq("usuario_id", persona).eq("titulo", titulo).gte("creado_en", desde);
        if (count) continue;
        const r = await supabase.from("notificaciones_usuario").insert({ usuario_id: persona, tipo: "tarea", titulo, texto: `${nombrePub} · tarea de Gestión de IDs Dropi para hoy`.slice(0, 600), href: "/publicaciones-dropi/tareas", autor_nombre: "Sistema" });
        if (!r.error) avisos++;
      }
    }
    return avisos;
  } catch {
    return 0;
  }
}
