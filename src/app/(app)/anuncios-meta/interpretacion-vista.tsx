import Link from "next/link";
import type { InterpretacionGuardada, OpinionIA } from "@/lib/meta-ads/interpretacion-guardada";
import { TarjetaMeta } from "./graficas";

const fecha = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

function ListaPuntos({ titulo, puntos }: { titulo: string; puntos: { titulo: string; detalle: string }[] }) {
  if (puntos.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {puntos.map((p) => (
          <li key={p.titulo} className="text-sm">
            <span className="font-medium">{p.titulo}. </span>
            <span className="text-muted-foreground">{p.detalle}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Opinion({ o }: { o: OpinionIA }) {
  const i = o.interpretacion;
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm">{i.resumen}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ListaPuntos titulo="Patrones que se ven" puntos={i.patrones} />
        <ListaPuntos titulo="Riesgos" puntos={i.riesgos} />
        <ListaPuntos titulo="Qué conviene hacer" puntos={i.recomendaciones} />
        {i.limites.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lo que todavía no se puede concluir</h3>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              {i.limites.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * La interpretación con IA del historial (24 nov 2026): la hace el sistema solo, una vez al día, con todas las IA que tengan clave. La principal se ve de entrada; si hay otra, queda como «segunda opinión» desplegable.
 * `enlace` lleva a Hallazgos (desde el Resumen). Sin interpretación todavía, dice que se está preparando.
 */
export function InterpretacionVista({ guardada, preparando, enlace = false }: { guardada: InterpretacionGuardada | null; preparando: boolean; enlace?: boolean }) {
  const [principal, ...otras] = guardada?.opiniones ?? [];
  return (
    <TarjetaMeta
      titulo="Lo que dicen los datos del historial"
      id="interpretacion"
      derecha={
        enlace ? (
          <Link href="/anuncios-meta/hallazgos" className="text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
            Ver el detalle y preguntar
          </Link>
        ) : undefined
      }
    >
      {!principal ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          {preparando ? "El sistema está analizando el historial y la entrega de los productos: aparece aquí solo, en unos minutos." : "Todavía no hay una interpretación del historial. El sistema la prepara solo cada día, con las IA conectadas."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <Opinion o={principal} />
          {otras.map((o) => (
            <details key={o.proveedor} className="rounded-lg border border-border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">Segunda opinión ({o.proveedor})</summary>
              <div className="mt-3">
                <Opinion o={o} />
              </div>
            </details>
          ))}
          <p className="m-0 text-xs text-muted-foreground">
            Hecho solo por el sistema con {guardada!.opiniones.map((o) => o.proveedor).join(" y ")} el {fecha(guardada!.generadaEn)} y renovado cada día. Es una lectura de las estadísticas del historial, no una cifra nueva: si algo no cuadra, mandan las tablas.
          </p>
        </div>
      )}
    </TarjetaMeta>
  );
}
