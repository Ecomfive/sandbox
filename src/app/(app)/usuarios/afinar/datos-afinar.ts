import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth";
import { nivelesDeRol, nivelesEfectivos, type PermisoPropio, type PermisoRol } from "@/lib/permisos/acceso";
import { claveAfinado, resolverAfinado, valorDe, valorPorDefecto, type FilaAfinada, type TipoAfinado } from "@/lib/permisos/afinado";
import { catalogoDe, type CatalogoModulo, type Nivel } from "@/lib/permisos/catalogo";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { consultaSegura } from "../datos-usuarios";

export interface DatosAfinar {
  catalogo: CatalogoModulo;
  destino: { tipo: "rol" | "persona"; id: string };
  /** Cómo se llama a quien se afina (el rol o la persona) y, de una persona, su rol. */
  nombre: string;
  rolNombre: string | null;
  color: string | null;
  /** Por dónde se vuelve. */
  volverA: string;
  /** El nivel que tiene en el módulo (lo que de verdad ve y puede). */
  nivel: Nivel;
  /** Lo que tiene hoy cada clave, juntando lo del rol y lo propio. */
  valores: Record<string, string>;
  /** A lo que vuelve cada clave con «Restablecer»: lo normal (rol) o lo que ya le da su rol (persona). */
  base: Record<string, string>;
  puedeEscribir: boolean;
}

function todasLasClaves(catalogo: CatalogoModulo): { tipo: TipoAfinado; clave: string }[] {
  return [
    ...catalogo.pestanas.map((p) => ({ tipo: "pestana" as const, clave: p.clave })),
    ...catalogo.acciones.map((a) => ({ tipo: "accion" as const, clave: a.clave })),
    ...catalogo.grupos.flatMap((g) => g.campos.map((c) => ({ tipo: "campo" as const, clave: c.clave }))),
    ...(catalogo.alcance ? [{ tipo: "alcance" as const, clave: "alcance" }] : []),
  ];
}

/** Lo que necesita la pantalla de afinar un módulo para un rol o una persona. 404 si el módulo no se puede afinar o el destino no existe. */
export async function cargarDatosAfinar(tipo: "rol" | "persona", id: string, modulo: string): Promise<DatosAfinar> {
  const usuario = await requireModulo("usuarios");
  const catalogo = catalogoDe(modulo);
  if (!catalogo || !esUuid(id)) notFound();
  const supabase = createServiceClient();
  const puedeEscribir = !usuario.modulosSoloLectura.includes("usuarios");

  if (tipo === "rol") {
    const { data: rol } = await supabase.from("roles").select("id, nombre, color").eq("id", id).maybeSingle();
    if (!rol) notFound();
    const [permisos, filas] = await Promise.all([
      consultaSegura<PermisoRol>(supabase.from("permisos_rol").select("modulo, solo_lectura").eq("rol_id", id)),
      consultaSegura<FilaAfinada>(supabase.from("permisos_afinados").select("modulo, tipo, clave, valor").eq("rol_id", id).eq("modulo", modulo)),
    ]);
    const nivel = nivelesDeRol(permisos)[modulo] ?? "n";
    if (nivel === "n") notFound();
    const resuelto = resolverAfinado(catalogo, filas);
    const valores: Record<string, string> = {};
    const base: Record<string, string> = {};
    for (const c of todasLasClaves(catalogo)) {
      valores[claveAfinado(c.tipo, c.clave)] = valorDe(catalogo, resuelto, c.tipo, c.clave);
      base[claveAfinado(c.tipo, c.clave)] = valorPorDefecto(catalogo, c.tipo, c.clave);
    }
    return { catalogo, destino: { tipo, id }, nombre: rol.nombre, rolNombre: null, color: (rol.color as string | null) ?? null, volverA: `/usuarios/roles?rol=${id}`, nivel, valores, base, puedeEscribir };
  }

  const { data: perfil } = await supabase.from("perfiles").select("id, nombre, email, rol_id").eq("id", id).maybeSingle();
  if (!perfil) notFound();
  const [rol, permisosRol, propios, filasRol, filasPersona] = await Promise.all([
    perfil.rol_id ? supabase.from("roles").select("nombre, color").eq("id", perfil.rol_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    perfil.rol_id ? consultaSegura<PermisoRol>(supabase.from("permisos_rol").select("modulo, solo_lectura").eq("rol_id", perfil.rol_id)) : Promise.resolve([] as PermisoRol[]),
    consultaSegura<PermisoPropio>(supabase.from("permisos_persona").select("modulo, nivel").eq("perfil_id", id)),
    perfil.rol_id ? consultaSegura<FilaAfinada>(supabase.from("permisos_afinados").select("modulo, tipo, clave, valor").eq("rol_id", perfil.rol_id).eq("modulo", modulo)) : Promise.resolve([] as FilaAfinada[]),
    consultaSegura<FilaAfinada>(supabase.from("permisos_persona_afinados").select("modulo, tipo, clave, valor").eq("perfil_id", id).eq("modulo", modulo)),
  ]);
  const nivel = nivelesEfectivos(permisosRol, propios)[modulo] ?? "n";
  if (nivel === "n") notFound();
  const delRol = resolverAfinado(catalogo, filasRol);
  const total = resolverAfinado(catalogo, [...filasRol, ...filasPersona]);
  const valores: Record<string, string> = {};
  const base: Record<string, string> = {};
  for (const c of todasLasClaves(catalogo)) {
    valores[claveAfinado(c.tipo, c.clave)] = valorDe(catalogo, total, c.tipo, c.clave);
    base[claveAfinado(c.tipo, c.clave)] = valorDe(catalogo, delRol, c.tipo, c.clave);
  }
  return {
    catalogo,
    destino: { tipo, id },
    nombre: perfil.nombre ?? perfil.email,
    rolNombre: (rol?.nombre as string | undefined) ?? null,
    color: (rol?.color as string | null | undefined) ?? null,
    volverA: `/usuarios/personas/${id}`,
    nivel,
    valores,
    base,
    puedeEscribir,
  };
}
