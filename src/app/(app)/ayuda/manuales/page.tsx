import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { GUIAS } from "@/lib/ayuda/contenido";
import { formatearFecha } from "@/lib/formato";
import { cargarManuales, puedeEditarManuales, requireSesion } from "../datos-ayuda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manuales de proceso" };

const NOMBRE_MODULO: Record<string, string> = Object.fromEntries(GUIAS.map((g) => [g.modulo, g.titulo]));

/** Los manuales de proceso que la persona puede ver (los de sus módulos y los de todos). La administración los crea y edita. */
export default async function ManualesPage() {
  const usuario = await requireSesion();
  const manuales = await cargarManuales(usuario);
  const editor = puedeEditarManuales(usuario);
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Manuales de proceso" oculto />
      {manuales === null ? (
        <p className="rounded-[10px] border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Próximamente: los manuales de cómo trabajamos.</p>
      ) : (
        <>
          {editor && (
            <Link href="/ayuda/manuales/nuevo" className={`boton-neon inline-flex w-fit items-center rounded-lg px-3 py-1.5 text-sm font-medium text-white ${anilloFoco}`}>
              Nuevo manual
            </Link>
          )}
          {manuales.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay manuales para tus módulos.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {manuales.map((m) => (
                <li key={m.id}>
                  <Link href={`/ayuda/manuales/${m.id}`} className={`flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-card p-4 transition-colors hover:bg-muted ${anilloFoco}`}>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-semibold">{m.titulo}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.modulos.length ? m.modulos.map((x) => NOMBRE_MODULO[x] ?? x).join(", ") : "Para todos"} · actualizado el {formatearFecha(m.actualizadoEn)}
                        {m.actualizadoPor ? ` por ${m.actualizadoPor}` : ""}
                      </span>
                    </span>
                    {m.borrador && <Badge tone="warning">Borrador</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Pagina>
  );
}
