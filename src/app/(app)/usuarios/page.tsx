import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { MODULOS } from "@/lib/modulos";
import { InvitarForm } from "./invitar-form";
import { RolSelect } from "./rol-select";
import { ActivoToggle } from "./activo-toggle";
import { PermisoCheckbox } from "./permiso-checkbox";
import { crearRol } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { EstadoVacio } from "@/components/ui/estado-vacio";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const supabase = createServiceClient();
  const { count: totalPerfiles } = await supabase
    .from("perfiles")
    .select("id", { count: "exact", head: true });

  const usuario = await getUsuarioActual();

  if (!usuario) {
    if ((totalPerfiles ?? 0) > 0) redirect("/login");

    // Bootstrap: todavía no existe ningún usuario, se permite crear el primero.
    const { data: roles } = await supabase.from("roles").select("id, nombre").order("nombre");
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-10">
        <h1 className="text-lg font-semibold tracking-tight">Configuración inicial</h1>
        <p className="text-sm text-muted-foreground">
          Todavía no hay ningún usuario. Invita a la primera cuenta (normalmente con rol Admin)
          para empezar a usar el sistema con login.
        </p>
        <InvitarForm roles={roles ?? []} />
      </main>
    );
  }

  if (!usuario.modulos.includes("usuarios")) redirect("/sin-acceso");

  const [{ data: roles }, { data: perfiles }, { data: permisos }] = await Promise.all([
    supabase.from("roles").select("id, nombre").order("nombre"),
    supabase.from("perfiles").select("id, email, nombre, activo, rol_id").order("email"),
    supabase.from("permisos_rol").select("rol_id, modulo"),
  ]);

  const permisosPorRol = new Map<string, Set<string>>();
  for (const p of permisos ?? []) {
    if (!permisosPorRol.has(p.rol_id)) permisosPorRol.set(p.rol_id, new Set());
    permisosPorRol.get(p.rol_id)!.add(p.modulo);
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Usuarios y roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invita personas al sistema y define qué módulos puede ver cada rol.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Invitar usuario</h2>
        <div className="mt-3">
          <InvitarForm roles={roles ?? []} />
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Usuarios</h2>
        <div className="mt-3 min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="py-2 pr-3 pl-4 font-medium">Correo</th>
                <th className="py-2 pr-3 font-medium">Nombre</th>
                <th className="py-2 pr-3 font-medium">Rol</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(perfiles ?? []).map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 pl-4 font-medium">{p.email}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{p.nombre ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <RolSelect perfilId={p.id} rolIdActual={p.rol_id} roles={roles ?? []} />
                  </td>
                  <td className="py-2 pr-3">
                    <ActivoToggle perfilId={p.id} activo={p.activo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(perfiles ?? []).length === 0 && <EstadoVacio mensaje="Todavía no hay usuarios invitados." />}
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Roles y permisos</h2>
        <form action={crearRol} className="mt-3 flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Nuevo rol</label>
            <input type="text" name="nombre" required className={fieldClass} placeholder="Ej. Finanzas" />
          </div>
          <Button type="submit" variant="secondary">
            Crear rol
          </Button>
        </form>

        <div className="mt-4 min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="py-2 pr-3 pl-4 font-medium">Rol</th>
                {MODULOS.map((m) => (
                  <th key={m.clave} className="py-2 pr-3 text-center font-medium whitespace-nowrap">
                    {m.etiqueta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(roles ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 pl-4 font-medium">{r.nombre}</td>
                  {MODULOS.map((m) => (
                    <td key={m.clave} className="py-2 pr-3 text-center">
                      <PermisoCheckbox
                        rolId={r.id}
                        modulo={m.clave}
                        activo={permisosPorRol.get(r.id)?.has(m.clave) ?? false}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {(roles ?? []).length === 0 && <EstadoVacio mensaje="Todavía no hay roles creados." />}
        </div>
      </div>
    </main>
  );
}
