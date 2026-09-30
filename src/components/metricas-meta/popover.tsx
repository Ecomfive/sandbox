"use client";

import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { claseMetrica, dolar, nivelCpa, nivelCpm, nivelCtr, nivelCvr, nivelEfectividad, nivelGasto, nivelHookRate, porcentaje } from "@/lib/metricas-meta-ads";
import { InteligenciaIcon } from "@/lib/nav-icons";

export interface MetricasMetaAds {
  landingUrl?: string | null;
  metricaOferta: number | null;
  metricaCpm: number | null;
  metricaEfectividad: number | null;
  metricaHookRate: number | null;
  metricaCtr: number | null;
  metricaCpa: number | null;
  metricaGasto: number | null;
  metricaCompras: number | null;
  metricaCvr: number | null;
}

function Fila({ etiqueta, valor, clase }: { etiqueta: string; valor: string; clase?: string }) {
  return (
    <p className="flex items-baseline justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className={`font-semibold tabular-nums ${clase ?? "text-foreground"}`}>{valor}</span>
    </p>
  );
}

function hayMetricas(m: MetricasMetaAds): boolean {
  return (
    !!m.landingUrl ||
    m.metricaOferta !== null ||
    m.metricaCpm !== null ||
    m.metricaEfectividad !== null ||
    m.metricaHookRate !== null ||
    m.metricaCtr !== null ||
    m.metricaCpa !== null ||
    m.metricaGasto !== null ||
    m.metricaCompras !== null ||
    m.metricaCvr !== null
  );
}

function ContenidoMetricas({ m }: { m: MetricasMetaAds }) {
  return (
    <div className="flex w-56 flex-col gap-1.5">
      <p className="border-b border-border pb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Métricas de Meta Ads
      </p>
      {m.landingUrl && (
        <a
          href={m.landingUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="block truncate text-xs text-accent-foreground underline underline-offset-2 hover:no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          {m.landingUrl}
        </a>
      )}
      {m.metricaOferta !== null && <Fila etiqueta="Oferta" valor={dolar(m.metricaOferta)} />}
      {m.metricaCpm !== null && <Fila etiqueta="CPM" valor={dolar(m.metricaCpm)} clase={claseMetrica(nivelCpm(m.metricaCpm))} />}
      {m.metricaEfectividad !== null && (
        <Fila etiqueta="% Efectividad" valor={porcentaje(m.metricaEfectividad)} clase={claseMetrica(nivelEfectividad(m.metricaEfectividad))} />
      )}
      {m.metricaHookRate !== null && (
        <Fila etiqueta="Hook Rate" valor={porcentaje(m.metricaHookRate)} clase={claseMetrica(nivelHookRate(m.metricaHookRate))} />
      )}
      {m.metricaCtr !== null && <Fila etiqueta="CTR" valor={porcentaje(m.metricaCtr)} clase={claseMetrica(nivelCtr(m.metricaCtr))} />}
      {m.metricaCpa !== null && <Fila etiqueta="CPA" valor={dolar(m.metricaCpa)} clase={claseMetrica(nivelCpa(m.metricaCpa))} />}
      {m.metricaGasto !== null && <Fila etiqueta="Gasto" valor={dolar(m.metricaGasto)} clase={claseMetrica(nivelGasto(m.metricaGasto))} />}
      {m.metricaCompras !== null && <Fila etiqueta="Compras" valor={String(m.metricaCompras)} />}
      {m.metricaCvr !== null && <Fila etiqueta="CVR" valor={porcentaje(m.metricaCvr)} clase={claseMetrica(nivelCvr(m.metricaCvr))} />}
    </div>
  );
}

/** El icono de barras frente al nombre de un producto (igual que en ClickUp): al pasar el cursor muestra
 * las métricas del test en Meta Ads en una tarjeta flotante. Lo comparten Filtros y Productos Test. */
export function IconoMetricasMeta({ metricas }: { metricas: MetricasMetaAds }) {
  if (!hayMetricas(metricas)) return null;
  return (
    <TarjetaEmergente contenido={<ContenidoMetricas m={metricas} />}>
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Ver métricas de Meta Ads"
      >
        <InteligenciaIcon className="h-3.5 w-3.5" />
      </span>
    </TarjetaEmergente>
  );
}
