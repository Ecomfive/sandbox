import type { SupabaseClient } from "@supabase/supabase-js";
import { filtrarPaises } from "@/lib/paises-permitidos";
import { INICIO_USO_SISTEMA, esMotivoFuera, tipoDeAlta, type AltaPublicacion, type OrigenPublicacion } from "@/lib/publicaciones/origen";
import { traerTodasConError } from "@/lib/supabase/paginar";

interface FilaPublicacion {
  id: string;
  numero: number | null;
  nombre: string;
  pais_id: string;
  origen: OrigenPublicacion;
  fecha_publicacion: string | null;
  creado_en: string;
  relacionados: string[] | null;
  tipo_publicacion: string | null;
}

const diaPanama = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** Lo creado desde el 24 oct 2026 en el sistema o en Dropi, con su motivo. `null` si faltan las migraciones 0226 y 0227. */
export async function cargarAltas(supabase: SupabaseClient, paisesPermitidos: string[] | null): Promise<{ altas: AltaPublicacion[]; paises: { codigo: string; nombre: string }[] } | null> {
  const { data: todos } = await supabase.from("paises").select("id, codigo, nombre").order("nombre");
  const paises = filtrarPaises(paisesPermitidos, (todos ?? []) as { id: string; codigo: string; nombre: string }[]);
  const codigoDe = new Map(paises.map((p) => [p.id, p.codigo]));

  const [publicaciones, actividad, motivos] = await Promise.all([
    traerTodasConError<FilaPublicacion>((desde, hasta) =>
      supabase
        .from("dropi_publicaciones")
        .select("id, numero, nombre, pais_id, origen, fecha_publicacion, creado_en, relacionados, tipo_publicacion")
        .in("origen", ["sistema", "dropi"])
        .order("id")
        .range(desde, hasta),
    ),
    // La creación de cada una: de ahí salen quién fue y si fue republicación o privatización. El vínculo a una anotada queda como «editar».
    traerTodasConError<{ id: string; entidad_id: string; accion: string; detalle: string | null; usuario_nombre: string | null }>((desde, hasta) =>
      supabase
        .from("historial_auditoria")
        .select("id, entidad_id, accion, detalle, usuario_nombre")
        .eq("entidad", "dropi_publicaciones")
        .gte("creado_en", INICIO_USO_SISTEMA)
        .or("accion.in.(crear_publicacion_dropi,crear_borrador_dropi),detalle.ilike.%estaba en Dropi sin publicación%")
        .order("id")
        .range(desde, hasta),
    ),
    traerTodasConError<{ publicacion_id: string; motivo: string; nota: string | null }>((desde, hasta) =>
      supabase.from("uso_sistema_motivos").select("publicacion_id, motivo, nota").order("publicacion_id").range(desde, hasta),
    ),
  ]);
  if (publicaciones.error || motivos.error) return null;

  const creacion = new Map((actividad.data ?? []).map((a) => [a.entidad_id, a]));
  const motivoDe = new Map((motivos.data ?? []).map((m) => [m.publicacion_id, m]));

  const altas: AltaPublicacion[] = [];
  for (const p of publicaciones.data ?? []) {
    const pais = codigoDe.get(p.pais_id);
    if (!pais || p.origen === "carga_inicial") continue;
    // De lo hecho en Dropi vale el día que dice Dropi: una anotada hoy pudo crearse mucho antes.
    const fecha = p.origen === "dropi" && p.fecha_publicacion ? p.fecha_publicacion.slice(0, 10) : diaPanama(p.creado_en);
    if (fecha < INICIO_USO_SISTEMA) continue;
    const a = creacion.get(p.id);
    const m = motivoDe.get(p.id);
    altas.push({
      id: p.id,
      numero: p.numero,
      nombre: p.nombre,
      pais,
      origen: p.origen,
      tipo: tipoDeAlta({ detalle: a?.detalle ?? null, privado: p.tipo_publicacion === "privado", relacionados: p.relacionados?.length ?? 0 }),
      fecha,
      persona: a?.usuario_nombre ?? null,
      motivo: esMotivoFuera(m?.motivo) ? m.motivo : null,
      nota: m?.nota ?? "",
    });
  }
  altas.sort((x, y) => y.fecha.localeCompare(x.fecha) || (y.numero ?? 0) - (x.numero ?? 0));
  return { altas, paises };
}
