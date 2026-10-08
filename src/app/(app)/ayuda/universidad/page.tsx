import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { cursosPara } from "@/lib/ayuda/cursos";
import { formatearFecha } from "@/lib/formato";
import { cargarProgreso, requireSesion } from "../datos-ayuda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Universidad" };

/** Los cursos que la persona puede tomar (los de sus módulos y los generales) con su avance. */
export default async function UniversidadPage() {
  const usuario = await requireSesion();
  const cursos = cursosPara(usuario.modulos);
  const progreso = await cargarProgreso(usuario.id);
  const completados = cursos.filter((c) => progreso?.get(c.id)?.completadoEn).length;
  const verProgreso = usuario.modulos.includes("usuarios");

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Universidad" oculto />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <p className="m-0 text-sm text-muted-foreground">
            {completados} de {cursos.length} cursos completados
          </p>
          <span className="block h-2 rounded-full bg-muted">
            <span className="barra-neon block h-2 rounded-full" style={{ width: `${cursos.length ? (completados / cursos.length) * 100 : 0}%` }} />
          </span>
        </div>
        {verProgreso && (
          <Link href="/ayuda/universidad/progreso" className={`rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
            Progreso del equipo
          </Link>
        )}
      </div>
      {progreso === null && (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-warning">
          Puedes ver los cursos, pero el progreso no se guarda hasta correr la migración 0088.
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {cursos.map((c) => {
          const p = progreso?.get(c.id);
          return (
            <li key={c.id}>
              <Link href={`/ayuda/universidad/${c.id}`} className={`flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-card p-4 transition-colors hover:bg-muted ${anilloFoco}`}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold">{c.titulo}</span>
                  <span className="text-sm text-muted-foreground">
                    {c.descripcion} · {c.lecciones.length} lecciones · {c.minutos} min
                  </span>
                </span>
                {p?.completadoEn ? (
                  <Badge tone="success">Completado el {formatearFecha(p.completadoEn)}</Badge>
                ) : p ? (
                  <Badge tone="warning">Mejor nota {p.puntaje} %</Badge>
                ) : (
                  <Badge tone="neutral">Sin empezar</Badge>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Pagina>
  );
}
