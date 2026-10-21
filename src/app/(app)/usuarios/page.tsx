import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { cobertura, nivelesEfectivos, type PermisoPropio, type PermisoRol } from "@/lib/permisos/acceso";
import { CrearUsuarioPanel } from "./crear-usuario-panel";
import { consultarRoles, consultaSegura } from "./datos-usuarios";
import { ListaPersonas, type FilaPersonaLista } from "./lista-personas";

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
    const roles = await consultarRoles(supabase);
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-10">
        <h1 className="text-xl font-semibold tracking-tight">Configuración inicial</h1>
        <p className="text-sm text-muted-foreground">
          Todavía no hay ningún usuario. Crea la primera cuenta (normalmente con rol Administrador)
          para empezar a usar el sistema con login.
        </p>
        <CrearUsuarioPanel roles={roles} />
      </main>
    );
  }

  if (!usuario.modulos.includes("usuarios")) redirect("/sin-acceso");

  const [roles, { data: perfiles }, permisos, { data: listaAuth }, paisesPersonas, propios, afinadosPersona, { data: paises }] = await Promise.all([
    consultarRoles(supabase),
    supabase
      .from("perfiles")
      .select(
        "id, email, nombre, avatar_url, activo, rol_id, creado_en, primer_ingreso_en, foto_recordada_en, ultima_actividad_en"
      )
      .order("email"),
    supabase.from("permisos_rol").select("rol_id, modulo, solo_lectura"),
    // El último ingreso vive en auth.users, no en `perfiles` — se trae una sola vez para toda la lista.
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    // Aparte: sin la migración 0087 la columna no existe y la lista se carga igual.
    supabase.from("perfiles").select("id, paises_permitidos"),
    // Lo propio de cada persona (migración 0116): sin ella, nadie tiene nada propio.
    consultaSegura<PermisoPropio & { perfil_id: string }>(supabase.from("permisos_persona").select("perfil_id, modulo, nivel")),
    consultaSegura<{ perfil_id: string }>(supabase.from("permisos_persona_afinados").select("perfil_id")),
    supabase.from("paises").select("codigo, nombre").order("nombre"),
  ]);
  const paisesPorPersona = paisesPersonas.error
    ? null
    : new Map(((paisesPersonas.data ?? []) as { id: string; paises_permitidos: string[] | null }[]).map((p) => [p.id, p.paises_permitidos]));

  const ultimoIngresoPorId = new Map<string, string | null>();
  for (const u of listaAuth?.users ?? []) ultimoIngresoPorId.set(u.id, u.last_sign_in_at ?? null);

  const permisosPorRol = new Map<string, PermisoRol[]>();
  for (const p of permisos.data ?? []) {
    const lista = permisosPorRol.get(p.rol_id) ?? [];
    lista.push({ modulo: p.modulo, solo_lectura: p.solo_lectura });
    permisosPorRol.set(p.rol_id, lista);
  }
  const propiosPorPersona = new Map<string, PermisoPropio[]>();
  for (const p of propios) propiosPorPersona.set(p.perfil_id, [...(propiosPorPersona.get(p.perfil_id) ?? []), { modulo: p.modulo, nivel: p.nivel }]);
  const conAfinado = new Set(afinadosPersona.map((a) => a.perfil_id));

  const personas: FilaPersonaLista[] = (perfiles ?? []).map((p) => {
    const propiosDe = propiosPorPersona.get(p.id) ?? [];
    return {
      id: p.id,
      email: p.email,
      nombre: p.nombre,
      avatarUrl: p.avatar_url,
      rolId: p.rol_id,
      rolNombre: roles.find((r) => r.id === p.rol_id)?.nombre ?? null,
      rolColor: roles.find((r) => r.id === p.rol_id)?.color ?? null,
      activo: p.activo,
      creadoEn: p.creado_en,
      primerIngresoEn: p.primer_ingreso_en,
      ultimoIngresoEn: ultimoIngresoPorId.get(p.id) ?? null,
      ultimaActividadEn: p.ultima_actividad_en,
      fotoRecordadaEn: p.foto_recordada_en,
      paisesPermitidos: paisesPorPersona ? (paisesPorPersona.get(p.id) ?? null) : undefined,
      acceso: cobertura(nivelesEfectivos(permisosPorRol.get(p.rol_id ?? "") ?? [], propiosDe)),
      personalizado: propiosDe.length > 0 || conAfinado.has(p.id),
    };
  });

  const personasPorRol = new Set(personas.map((p) => p.rolId).filter(Boolean));
  const rolesSinPersonas = roles.filter((r) => !personasPorRol.has(r.id)).length;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Usuarios y roles" oculto />
      <ListaPersonas
        personas={personas}
        roles={roles}
        paises={(paises ?? []) as { codigo: string; nombre: string }[]}
        miId={usuario.id}
        rolesSinPersonas={rolesSinPersonas}
      />
    </Pagina>
  );
}
