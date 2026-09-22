import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { CrearUsuarioPanel } from "./crear-usuario-panel";
import type { FilaUsuario, Rol } from "./def-usuarios";
import { UsuariosYRoles } from "./usuarios-y-roles";

export const metadata = { title: "Usuarios y roles" };

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const supabase = createServiceClient();
  const [{ count: totalPerfiles }, usuario] = await Promise.all([
    supabase.from("perfiles").select("id", { count: "exact", head: true }),
    getUsuarioActual(),
  ]);

  if (!usuario) {
    if ((totalPerfiles ?? 0) > 0) redirect("/login");

    // Bootstrap: todavía no existe ningún usuario, se permite crear el primero.
    const { data: roles } = await supabase.from("roles").select("id, nombre, descripcion").order("nombre");
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-10">
        <h1 className="text-xl font-semibold tracking-tight">Configuración inicial</h1>
        <p className="text-sm text-muted-foreground">
          Todavía no hay ningún usuario. Crea la primera cuenta (normalmente con rol Administrador)
          para empezar a usar el sistema con login.
        </p>
        <CrearUsuarioPanel roles={(roles ?? []) as Rol[]} />
      </main>
    );
  }

  if (!usuario.modulos.includes("usuarios")) redirect("/sin-acceso");

  const [{ data: roles }, { data: perfiles }, { data: permisos }, { data: listaAuth }] = await Promise.all([
    supabase.from("roles").select("id, nombre, descripcion").order("nombre"),
    supabase
      .from("perfiles")
      .select(
        "id, email, nombre, avatar_url, activo, rol_id, creado_en, primer_ingreso_en, foto_recordada_en, ultima_actividad_en"
      )
      .order("email"),
    supabase.from("permisos_rol").select("rol_id, modulo, solo_lectura"),
    // El último ingreso vive en auth.users, no en `perfiles` — se trae una sola vez para toda la lista.
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const ultimoIngresoPorId = new Map<string, string | null>();
  for (const u of listaAuth?.users ?? []) ultimoIngresoPorId.set(u.id, u.last_sign_in_at ?? null);

  const modulosPorRol = new Map<string, Set<string>>();
  const soloLecturaPorRol = new Map<string, Set<string>>();
  for (const p of permisos ?? []) {
    if (!modulosPorRol.has(p.rol_id)) modulosPorRol.set(p.rol_id, new Set());
    modulosPorRol.get(p.rol_id)!.add(p.modulo);
    if (p.solo_lectura) {
      if (!soloLecturaPorRol.has(p.rol_id)) soloLecturaPorRol.set(p.rol_id, new Set());
      soloLecturaPorRol.get(p.rol_id)!.add(p.modulo);
    }
  }

  const rolesTipados = (roles ?? []) as Rol[];
  const personas: FilaUsuario[] = (perfiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    nombre: p.nombre,
    avatarUrl: p.avatar_url,
    rolId: p.rol_id,
    rolNombre: rolesTipados.find((r) => r.id === p.rol_id)?.nombre ?? null,
    activo: p.activo,
    creadoEn: p.creado_en,
    primerIngresoEn: p.primer_ingreso_en,
    ultimoIngresoEn: ultimoIngresoPorId.get(p.id) ?? null,
    ultimaActividadEn: p.ultima_actividad_en,
    fotoRecordadaEn: p.foto_recordada_en,
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Usuarios y roles" oculto>
        Quién trabaja en la app, qué páginas ve cada rol y si la persona ya está lista para empezar.
      </EncabezadoPagina>

      <UsuariosYRoles
        personas={personas}
        roles={rolesTipados}
        modulosPorRol={modulosPorRol}
        soloLecturaPorRol={soloLecturaPorRol}
        miId={usuario.id}
      />
    </Pagina>
  );
}
