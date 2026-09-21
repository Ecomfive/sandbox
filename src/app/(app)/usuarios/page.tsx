import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { MODULOS } from "@/lib/modulos";
import { Pagina } from "@/components/ui/pagina";
import { InvitarForm } from "./invitar-form";
import { TablaUsuarios } from "./tabla-usuarios";
import { PermisoCheckbox } from "./permiso-checkbox";
import { crearRol } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { EstadoVacio } from "@/components/ui/estado-vacio";

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
    const { data: roles } = await supabase.from("roles").select("id, nombre").order("nombre");
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-10">
        <h1 className="text-xl font-semibold tracking-tight">Configuración inicial</h1>
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
    supabase.from("permisos_rol").select("rol_id, modulo, solo_lectura"),
  ]);

  const permisosPorRol = new Map<string, Set<string>>();
  const soloLecturaPorRol = new Map<string, Set<string>>();
  for (const p of permisos ?? []) {
    if (!permisosPorRol.has(p.rol_id)) permisosPorRol.set(p.rol_id, new Set());
    permisosPorRol.get(p.rol_id)!.add(p.modulo);
    if (p.solo_lectura) {
      if (!soloLecturaPorRol.has(p.rol_id)) soloLecturaPorRol.set(p.rol_id, new Set());
      soloLecturaPorRol.get(p.rol_id)!.add(p.modulo);
    }
  }

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Usuarios y roles" oculto>
        Invita personas al sistema y define qué módulos puede ver cada rol — y si puede solo
        verlos o también crear y modificar cosas ahí.
      </EncabezadoPagina>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Invitar usuario</h2>
        <div className="mt-3">
          <InvitarForm roles={roles ?? []} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Usuarios</h2>
        <div className="mt-3">
          <TablaUsuarios
            usuarios={(perfiles ?? []).map((p) => ({
              id: p.id,
              email: p.email,
              nombre: p.nombre,
              rolId: p.rol_id,
              rolNombre: (roles ?? []).find((r) => r.id === p.rol_id)?.nombre ?? null,
              activo: p.activo,
            }))}
            roles={roles ?? []}
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Roles y permisos</h2>
        <form action={crearRol} className="mt-3 flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Nuevo rol</span>
            <input type="text" name="nombre" required className={fieldClass} placeholder="Ej. Finanzas" />
          </label>
          <Button type="submit" variant="secondary">
            Crear rol
          </Button>
        </form>

        <div className="mt-4 min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
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
                        etiqueta={m.etiqueta}
                        activo={permisosPorRol.get(r.id)?.has(m.clave) ?? false}
                        soloLectura={soloLecturaPorRol.get(r.id)?.has(m.clave) ?? false}
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
    </Pagina>
  );
}
