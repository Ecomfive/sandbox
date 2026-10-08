import { redirect } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { claseTd, claseTh } from "@/components/panel/piezas-panel";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { CURSOS } from "@/lib/ayuda/cursos";
import { formatearFecha } from "@/lib/formato";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSesion } from "../../datos-ayuda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progreso del equipo" };

/**
 * Quién completó qué curso (para el onboarding de la gente nueva). Solo para quien administra Usuarios y roles. Un curso que
 * la persona no puede tomar (no tiene su módulo) sale como «—».
 */
export default async function ProgresoEquipoPage() {
  const usuario = await requireSesion();
  if (!usuario.modulos.includes("usuarios")) redirect("/sin-acceso");
  const supabase = createServiceClient();
  const [perfiles, permisos, progreso] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, email, rol_id, activo").eq("activo", true).order("nombre"),
    supabase.from("permisos_rol").select("rol_id, modulo"),
    supabase.from("cursos_progreso").select("usuario_id, curso_id, puntaje, completado_en"),
  ]);
  const modulosPorRol = new Map<string, Set<string>>();
  for (const p of permisos.data ?? []) modulosPorRol.set(p.rol_id, (modulosPorRol.get(p.rol_id) ?? new Set()).add(p.modulo));
  const nota = new Map((progreso.data ?? []).map((p) => [`${p.usuario_id}:${p.curso_id}`, p]));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EtiquetaMiga texto="Progreso del equipo" />
      <EncabezadoPagina titulo="Progreso del equipo" oculto />
      {progreso.error ? (
        <p role="alert" className="text-sm text-destructive">
          Falta correr la migración 0088 en Supabase.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-border bg-card">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={claseTh}>Persona</th>
                {CURSOS.map((c) => (
                  <th key={c.id} className={claseTh}>
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(perfiles.data ?? []).map((p) => {
                const modulos = modulosPorRol.get(p.rol_id as string) ?? new Set<string>();
                return (
                  <tr key={p.id}>
                    <th scope="row" className={`${claseTd} text-left font-medium`}>
                      {p.nombre || p.email}
                    </th>
                    {CURSOS.map((c) => {
                      if (c.modulo && !modulos.has(c.modulo)) return <td key={c.id} className={`${claseTd} text-muted-foreground`}>—</td>;
                      const n = nota.get(`${p.id}:${c.id}`);
                      return (
                        <td key={c.id} className={claseTd}>
                          {n?.completado_en ? (
                            <span className="text-success">✓ {formatearFecha(n.completado_en)}</span>
                          ) : n ? (
                            <span className="text-warning">{n.puntaje} %</span>
                          ) : (
                            <span className="text-muted-foreground">Pendiente</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Pagina>
  );
}
