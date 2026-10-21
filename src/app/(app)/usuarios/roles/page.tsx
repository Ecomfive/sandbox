import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { nivelesDeRol, type PermisoRol } from "@/lib/permisos/acceso";
import { contarAjustes, resolverAfinado, type FilaAfinada } from "@/lib/permisos/afinado";
import { MODULOS_AFINABLES, catalogoDe } from "@/lib/permisos/catalogo";
import { createServiceClient } from "@/lib/supabase/server";
import { consultarRoles, consultaSegura } from "../datos-usuarios";
import { EditorRol } from "./editor-rol";
import { ListaRoles, type FilaRol } from "./lista-roles";

export const metadata = { title: "Roles · Usuarios y roles" };

export const dynamic = "force-dynamic";

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("usuarios");
  const { rol: rolPedido } = await searchParams;
  const supabase = createServiceClient();

  const [roles, permisos, { data: perfiles }, afinados] = await Promise.all([
    consultarRoles(supabase),
    supabase.from("permisos_rol").select("rol_id, modulo, solo_lectura"),
    supabase.from("perfiles").select("id, nombre, email, avatar_url, rol_id").order("nombre"),
    consultaSegura<FilaAfinada & { rol_id: string }>(supabase.from("permisos_afinados").select("rol_id, modulo, tipo, clave, valor")),
  ]);

  const permisosPorRol = new Map<string, PermisoRol[]>();
  for (const p of permisos.data ?? []) permisosPorRol.set(p.rol_id, [...(permisosPorRol.get(p.rol_id) ?? []), { modulo: p.modulo, solo_lectura: p.solo_lectura }]);
  const personasPorRol = new Map<string, { id: string; nombre: string | null; email: string; avatarUrl: string | null }[]>();
  for (const p of perfiles ?? []) {
    if (!p.rol_id) continue;
    personasPorRol.set(p.rol_id, [...(personasPorRol.get(p.rol_id) ?? []), { id: p.id, nombre: p.nombre, email: p.email, avatarUrl: p.avatar_url }]);
  }

  const filas: FilaRol[] = roles.map((r) => {
    const niveles = nivelesDeRol(permisosPorRol.get(r.id) ?? []);
    return { id: r.id, nombre: r.nombre, color: r.color ?? null, personas: personasPorRol.get(r.id)?.length ?? 0, modulos: Object.keys(niveles).length };
  });

  const elegido = roles.find((r) => r.id === (typeof rolPedido === "string" ? rolPedido : "")) ?? roles[0];

  let editor: React.ReactNode = <EstadoVacio mensaje="Todavía no hay roles." />;
  if (elegido) {
    const niveles = nivelesDeRol(permisosPorRol.get(elegido.id) ?? []);
    // Cuántos ajustes tiene el rol en cada módulo que ya se puede afinar.
    const ajustes: Record<string, number> = {};
    for (const modulo of MODULOS_AFINABLES) {
      ajustes[modulo] = contarAjustes(resolverAfinado(catalogoDe(modulo), afinados.filter((f) => f.rol_id === elegido.id && f.modulo === modulo)));
    }
    editor = (
      <EditorRol
        key={elegido.id}
        rol={{ id: elegido.id, nombre: elegido.nombre, descripcion: elegido.descripcion, color: elegido.color ?? null }}
        niveles={niveles}
        ajustes={ajustes}
        personas={personasPorRol.get(elegido.id) ?? []}
        otrosRoles={roles.filter((r) => r.id !== elegido.id).map((r) => ({ id: r.id, nombre: r.nombre }))}
        puedeEscribir={!usuario.modulosSoloLectura.includes("usuarios")}
      />
    );
  }

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Roles" oculto />
      <div className="grid items-start gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        <ListaRoles roles={filas} elegidoId={elegido?.id ?? null} otrosRoles={roles.map((r) => ({ id: r.id, nombre: r.nombre }))} puedeEscribir={!usuario.modulosSoloLectura.includes("usuarios")} />
        {editor}
      </div>
    </Pagina>
  );
}
