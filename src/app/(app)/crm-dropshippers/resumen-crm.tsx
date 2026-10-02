"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { anilloFoco } from "@/components/ui/field";
import { formatearMoneda } from "@/lib/formato";
import {
  etiquetaAntiguedad,
  etiquetaCanal,
  montoCorto,
  type FilaCaso,
  type FilaDropshipper,
  type ResumenCrm,
} from "./def-crm";
import { FichaDropshipper } from "./ficha-dropshipper";

type Orden = "ventas" | "pedidos";
const LIMITE_RANKING = 8;
const LIMITE_CASOS = 5;

/** «+12,4 % vs mes anterior»; sin dato del mes anterior no se dibuja nada. */
function Delta({ valor, sufijo, inverso = false }: { valor: number | null; sufijo: string; inverso?: boolean }) {
  if (valor === null) return null;
  const mejora = inverso ? valor < 0 : valor > 0;
  const texto = `${valor > 0 ? "+" : valor < 0 ? "−" : ""}${Math.abs(valor).toLocaleString("es-CR", { maximumFractionDigits: 1 })}${sufijo}`;
  return <span className={mejora ? "text-success" : valor === 0 ? "" : "text-destructive"}>{texto}</span>;
}

/**
 * Resumen del CRM: tarjetas de indicadores, ranking de quién vende más y los casos que piden atención. Pulsar a un
 * dropshipper del ranking abre su ficha lateral (con las flechas en el orden del ranking).
 */
export function ResumenCrm({
  resumen,
  dropshippers,
  casos,
  codigoPais,
  hoy,
  demo,
}: {
  resumen: ResumenCrm;
  dropshippers: FilaDropshipper[];
  casos: FilaCaso[];
  codigoPais: string;
  hoy: string;
  demo: boolean;
}) {
  const [orden, setOrden] = useState<Orden>("ventas");
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const ranking = useMemo(
    () =>
      dropshippers
        .filter((d) => d.estado === "activo")
        .sort((a, b) => (orden === "ventas" ? b.ventasMes - a.ventasMes : b.pedidosMes - a.pedidosMes))
        .slice(0, LIMITE_RANKING),
    [dropshippers, orden],
  );
  const maximo = ranking.length ? Math.max(1, orden === "ventas" ? ranking[0].ventasMes : ranking[0].pedidosMes) : 1;
  const casosAtencion = useMemo(
    () =>
      casos
        .filter((c) => c.estado !== "resuelto")
        .sort((a, b) => Number(b.prioridad === "alta") - Number(a.prioridad === "alta") || b.horasAbierto - a.horasAbierto)
        .slice(0, LIMITE_CASOS),
    [casos],
  );

  return (
    <div className="flex flex-col gap-6">
      <KpiGroup titulo={`Dashboard · ${resumen.mes}`} accion={demo ? <span className="font-normal">Datos de ejemplo</span> : undefined}>
        <KpiGrid compacta>
          <KpiCard
            compacta
            href="/crm-dropshippers/directorio"
            titulo="Dropshippers activos"
            valor={resumen.activos.toLocaleString("es-CR")}
            subtexto={
              <>
                <Delta valor={resumen.activosDeltaMes} sufijo="" /> {resumen.activosDeltaMes !== null && "vs mes anterior · "}de {resumen.totalDropshippers}
              </>
            }
          />
          <KpiCard
            compacta
            titulo="Pedidos del mes"
            valor={resumen.pedidosMes.toLocaleString("es-CR")}
            subtexto={resumen.pedidosDeltaPct !== null ? <><Delta valor={resumen.pedidosDeltaPct} sufijo=" %" /> vs mes anterior</> : undefined}
          />
          <KpiCard
            compacta
            titulo="Ventas del mes"
            valor={montoCorto(resumen.ventasMes, codigoPais)}
            subtexto={resumen.ventasDeltaPct !== null ? <><Delta valor={resumen.ventasDeltaPct} sufijo=" %" /> vs mes anterior</> : formatearMoneda(resumen.ventasMes, codigoPais)}
          />
          <KpiCard
            compacta
            href="/crm-dropshippers/casos"
            tono={resumen.casosSinResponder > 0 ? "warning" : "neutral"}
            titulo="Casos abiertos"
            valor={resumen.casosAbiertos.toLocaleString("es-CR")}
            subtexto={resumen.casosSinResponder > 0 ? `${resumen.casosSinResponder} sin responder hace más de 24 h` : "Todos con respuesta"}
          />
          <KpiCard
            compacta
            titulo="Primera respuesta"
            valor={resumen.primeraRespuestaMin === null ? "—" : `${resumen.primeraRespuestaMin} min`}
            subtexto={resumen.primeraRespuestaDeltaMin !== null ? <><Delta valor={resumen.primeraRespuestaDeltaMin} sufijo=" min" inverso /> vs mes anterior</> : "Promedio de los casos"}
          />
          <KpiCard
            compacta
            href="/crm-dropshippers/directorio"
            tono="destructive"
            titulo="Sin pedir en 30 días"
            valor={resumen.sinPedir30.toLocaleString("es-CR")}
            subtexto="En riesgo de inactivarse"
          />
        </KpiGrid>
      </KpiGroup>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="titulo-ranking" className="min-w-0 rounded-xl border border-border bg-card">
          <div className="flex min-h-9 items-center justify-between gap-3 rounded-t-xl border-b border-border bg-muted px-4 py-1">
            <h2 id="titulo-ranking" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Quién vende más
            </h2>
            <div role="group" aria-label="Ordenar el ranking" className="flex gap-0.5 rounded-md border border-border bg-card p-0.5">
              {(["ventas", "pedidos"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={orden === o}
                  onClick={() => setOrden(o)}
                  className={`rounded px-2.5 py-0.5 text-xs ${anilloFoco} ${orden === o ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {o === "ventas" ? "Ventas" : "Pedidos"}
                </button>
              ))}
            </div>
          </div>
          {ranking.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Todavía no hay pedidos este mes para armar el ranking.</p>
          ) : (
            <ol className="m-0 flex list-none flex-col p-1.5">
              {ranking.map((d, i) => {
                const valor = orden === "ventas" ? d.ventasMes : d.pedidosMes;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => setAbiertoId(d.id)}
                      className={`grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted ${anilloFoco}`}
                    >
                      <span className="text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="flex justify-between gap-2 text-sm">
                          <span className="truncate">{d.nombre}</span>
                          <span className="truncate text-xs text-muted-foreground">{d.tienda}</span>
                        </span>
                        <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-accent">
                          <span className="block h-full rounded-full bg-foreground-soft" style={{ width: `${(valor / maximo) * 100}%` }} />
                        </span>
                      </span>
                      <span className="min-w-[5.5rem] text-right text-sm font-medium tabular-nums">
                        {orden === "ventas" ? montoCorto(d.ventasMes, codigoPais) : `${d.pedidosMes} pedidos`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section aria-labelledby="titulo-atencion" className="min-w-0 rounded-xl border border-border bg-card">
          <div className="flex min-h-9 items-center justify-between gap-3 rounded-t-xl border-b border-border bg-muted px-4 py-1">
            <h2 id="titulo-atencion" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Casos que piden atención
            </h2>
            <Link href="/crm-dropshippers/casos" className={`rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ${anilloFoco}`}>
              Ver todos
            </Link>
          </div>
          {casosAtencion.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No hay casos abiertos.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {casosAtencion.map((c) => (
                <li key={c.id} className="flex items-start gap-2.5 border-b border-border px-4 py-2.5 last:border-0">
                  <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${c.prioridad === "alta" ? "bg-destructive" : "bg-warning"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {c.titulo}
                      {c.prioridad === "alta" && <span className="sr-only"> (prioridad alta)</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.dropshipper} · {etiquetaCanal(c.canal)} · {c.responsable ?? "Sin responsable"}
                    </p>
                  </div>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{etiquetaAntiguedad(c.horasAbierto)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <FichaDropshipper
        dropshipper={dropshippers.find((d) => d.id === abiertoId) ?? null}
        casos={casos}
        orden={ranking.map((d) => d.id)}
        alIr={setAbiertoId}
        alCerrar={() => setAbiertoId(null)}
        codigoPais={codigoPais}
        hoy={hoy}
        demo={demo}
      />
    </div>
  );
}
