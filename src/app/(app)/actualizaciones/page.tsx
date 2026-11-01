import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { armarPersonasConAcceso, type PerfilConRol, type PermisoDeRol, type PermisoPropioDeModulo } from "@/lib/acceso-seccion";
import { getUsuarioActual, irAlInicio } from "@/lib/auth";
import { claveNovedad } from "@/lib/ayuda/actualizaciones";
import { NOVEDADES } from "@/lib/ayuda/contenido";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { etiquetaDeModulo } from "@/lib/permisos/catalogo";
import { esAdministrador } from "@/lib/permisos/acceso";
import { redirect } from "next/navigation";
import { ListaActualizaciones, type LecturaNovedad } from "./lista-actualizaciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Actualizaciones del sistema" };

/**
 * Actualizaciones del sistema (31 oct 2026, pedido de Alcides): todo lo que cambió, día por día, para los administradores (botón «Cambios» del
 * riel). Sale de las novedades del Centro de ayuda, todas, sin filtrar por módulo. Quien no es administrador vuelve a su inicio. De cada una dice
 * quiénes de su módulo ya la vieron en el Centro de notificaciones (`novedades_vistas`, migración 0218) y quiénes faltan.
 */
export default async function ActualizacionesPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (!esAdministrador(usuario)) irAlInicio(usuario);

  const modulos = [...new Set(NOVEDADES.map((n) => n.modulo).filter((m): m is string => !!m))]
    .map((clave) => ({ clave, etiqueta: etiquetaDeModulo(clave) }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));

  // Quién tiene cada módulo (por su rol o por permisos propios) y qué vio cada persona: se pide todo una vez y se cruza aquí.
  const supabase = createServiceClient();
  const [perfiles, permisos, propios, roles, vistas] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, email, avatar_url, rol_id, activo"),
    supabase.from("permisos_rol").select("rol_id, modulo, solo_lectura"),
    supabase.from("permisos_persona").select("perfil_id, modulo, nivel"),
    supabase.from("roles").select("id, nombre"),
    traerTodasLasFilas<{ usuario_id: string; clave: string }>((d, h) => supabase.from("novedades_vistas").select("usuario_id, clave").order("usuario_id").range(d, h)).catch(() => []),
  ]);
  const activos = ((perfiles.data ?? []) as PerfilConRol[]).filter((p) => p.activo !== false);
  const nombre = new Map(activos.map((p) => [p.id, p.nombre || p.email]));
  const nombresRol = new Map((roles.data ?? []).map((r) => [r.id as string, r.nombre as string]));
  const deModulo = new Map<string, string[]>();
  const personasDe = (modulo: string | undefined): string[] => {
    if (!modulo) return activos.map((p) => p.id);
    const ya = deModulo.get(modulo);
    if (ya) return ya;
    const deRol: PermisoDeRol[] = (permisos.data ?? []).filter((p) => p.modulo === modulo).map((p) => ({ rol_id: p.rol_id as string, solo_lectura: !!p.solo_lectura, rol: nombresRol.get(p.rol_id as string) ?? "" }));
    const propiosDe = (propios.error ? [] : (propios.data ?? []).filter((p) => p.modulo === modulo)) as PermisoPropioDeModulo[];
    const ids = armarPersonasConAcceso(activos, deRol, propiosDe, nombresRol).map((p) => p.id);
    deModulo.set(modulo, ids);
    return ids;
  };
  const vieronPor = new Map<string, Set<string>>();
  for (const v of vistas) vieronPor.set(v.clave, (vieronPor.get(v.clave) ?? new Set()).add(v.usuario_id));
  const lecturas: Record<string, LecturaNovedad> = {};
  for (const n of NOVEDADES) {
    const clave = claveNovedad(n);
    const vieron = vieronPor.get(clave) ?? new Set<string>();
    const deEsta = personasDe(n.modulo);
    lecturas[clave] = {
      vieron: deEsta.filter((id) => vieron.has(id)).map((id) => nombre.get(id) ?? "?"),
      faltan: deEsta.filter((id) => !vieron.has(id)).map((id) => nombre.get(id) ?? "?"),
    };
  }
  const mias = vistas.filter((v) => v.usuario_id === usuario.id).map((v) => v.clave);

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Actualizaciones del sistema" oculto />
      <ListaActualizaciones novedades={NOVEDADES} modulos={modulos} vistas={mias} lecturas={lecturas} />
    </Pagina>
  );
}
