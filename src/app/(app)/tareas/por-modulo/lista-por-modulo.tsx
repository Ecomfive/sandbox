import Link from "next/link";
import { formatearFecha } from "@/lib/formato";
import { cuando, MODULO_EQUIPO, type Cuando, type GrupoModulo } from "@/lib/tareas/por-modulo";

const CUANDO: Record<
  Cuando,
  { texto: (plazo: string) => string; clase: string }
> = {
  atrasada: {
    texto: (p) => `Atrasada · ${formatearFecha(p)}`,
    clase: "font-semibold text-destructive",
  },
  hoy: { texto: () => "Hoy", clase: "font-semibold text-primary" },
  manana: { texto: () => "Mañana", clase: "text-foreground" },
  despues: { texto: (p) => formatearFecha(p), clase: "text-muted-foreground" },
  sin_fecha: { texto: () => "Sin fecha", clase: "text-muted-foreground" },
};

/** Los módulos con las tareas abiertas de la persona: cada uno se pliega y lleva a su módulo («Ir a …»); cada tarea abre en su módulo o en su ficha. */
export function ListaPorModulo({
  grupos,
  hoy,
}: {
  grupos: GrupoModulo[];
  hoy: string;
}) {
  return (
    <>
      {grupos.map((g) => (
        <details
          key={g.modulo}
          open
          className="group rounded-xl border border-border bg-card"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            <h2 className="m-0 text-sm font-semibold">{g.etiqueta}</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
              {g.tareas.length}
            </span>
            {g.atrasadas > 0 && (
              <span className="text-xs font-semibold text-destructive">
                {g.atrasadas} {g.atrasadas === 1 ? "atrasada" : "atrasadas"}
              </span>
            )}
            {g.paraHoy > 0 && (
              <span className="text-xs font-semibold text-primary">
                {g.paraHoy} para hoy
              </span>
            )}
            {g.modulo !== MODULO_EQUIPO && (
              <Link
                href={`/${g.modulo}`}
                className="ml-auto rounded px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                Ir a {g.etiqueta} →
              </Link>
            )}
          </summary>
          <ul className="m-0 list-none divide-y divide-border border-t border-border p-0">
            {g.tareas.map((t) => {
              const c = cuando(t.plazo, hoy);
              return (
                <li key={`${t.origen}-${t.id}`}>
                  <Link
                    href={t.href}
                    className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2 text-sm hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_10rem_9rem]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {t.titulo}
                      </span>
                      {(t.detalle || t.pais) && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {[t.detalle, t.pais].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">
                      {t.estado}
                    </span>
                    <span className={`text-right text-xs ${CUANDO[c].clase}`}>
                      {CUANDO[c].texto(t.plazo ?? "")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </>
  );
}
