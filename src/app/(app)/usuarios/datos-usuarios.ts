import { createServiceClient } from "@/lib/supabase/server";
import type { Rol } from "./def-usuarios";
import type { PuestosDeUsuarios } from "./puestos-persona";

type Cliente = ReturnType<typeof createServiceClient>;

/** Una consulta que puede fallar porque falta una migración: devuelve `[]` en vez de romper la página. */
export async function consultaSegura<T>(consulta: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const r = await consulta;
    return r.error ? [] : (r.data ?? []);
  } catch {
    return [];
  }
}

/** Los roles con su color; sin la migración 0116 no existe la columna y se piden sin ella. */
export async function consultarRoles(supabase: Cliente): Promise<Rol[]> {
  const conColor = await supabase.from("roles").select("id, nombre, descripcion, color").order("nombre");
  if (!conColor.error) return (conColor.data ?? []) as Rol[];
  const { data } = await supabase.from("roles").select("id, nombre, descripcion").order("nombre");
  return (data ?? []) as Rol[];
}

/** Los puestos de cada persona, para el bloque «Puestos» de su ficha: solo con el módulo Puestos y con la migración 0112. */
export async function cargarPuestosDeUsuarios(modulos: string[], soloLectura: string[]): Promise<PuestosDeUsuarios | null> {
  if (!modulos.includes("puestos")) return null;
  const supabase = createServiceClient();
  const [puestos, ocupantes] = await Promise.all([
    supabase.from("puestos").select("id, nombre, activo").order("nombre"),
    supabase.from("puesto_personas").select("puesto_id, usuario_id, principal"),
  ]);
  if (puestos.error || ocupantes.error) return null;
  const nombre = new Map((puestos.data ?? []).map((p) => [p.id as string, p.nombre as string]));
  const porPersona: PuestosDeUsuarios["porPersona"] = {};
  for (const o of ocupantes.data ?? []) {
    const id = o.usuario_id as string;
    (porPersona[id] ??= []).push({ id: o.puesto_id as string, nombre: nombre.get(o.puesto_id as string) ?? "—", principal: o.principal === true });
  }
  return {
    puestos: (puestos.data ?? []).filter((p) => p.activo !== false).map((p) => ({ id: p.id as string, nombre: p.nombre as string })),
    porPersona,
    puedeAsignar: !soloLectura.includes("puestos"),
  };
}
