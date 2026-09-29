"use client";

import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { InteligenciaIcon } from "@/lib/nav-icons";
import {
  claseMetrica,
  nivelCpa,
  nivelCpm,
  nivelCtr,
  nivelCvr,
  nivelEfectividad,
  nivelGasto,
  nivelHookRate,
  type FilaFiltro,
} from "./def-filtros";

/** Las métricas de Meta Ads siempre vienen en dólares (así las reporta Meta), sin importar la moneda del país. */
const dolar = (valor: number) => `$${valor.toFixed(2)}`;
const porcentaje = (valor: number) => `${valor.toFixed(2)}%`;

function Fila({ etiqueta, valor, clase }: { etiqueta: string; valor: string; clase?: string }) {
  return (
    <p className="flex items-baseline justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className={`font-semibold tabular-nums ${clase ?? "text-foreground"}`}>{valor}</span>
    </p>
  );
}

function hayMetricas(filtro: FilaFiltro): boolean {
  return (
    !!filtro.landingUrl ||
    filtro.metricaOferta !== null ||
    filtro.metricaCpm !== null ||
    filtro.metricaEfectividad !== null ||
    filtro.metricaHookRate !== null ||
    filtro.metricaCtr !== null ||
    filtro.metricaCpa !== null ||
    filtro.metricaGasto !== null ||
    filtro.metricaCompras !== null ||
    filtro.metricaCvr !== null
  );
}

function ContenidoMetricas({ filtro }: { filtro: FilaFiltro }) {
  return (
    <div className="flex w-56 flex-col gap-1.5">
      <p className="border-b border-border pb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Métricas de Meta Ads
      </p>
      {filtro.landingUrl && (
        <a
          href={filtro.landingUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="block truncate text-xs text-accent-foreground underline underline-offset-2 hover:no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          {filtro.landingUrl}
        </a>
      )}
      {filtro.metricaOferta !== null && <Fila etiqueta="Oferta" valor={dolar(filtro.metricaOferta)} />}
      {filtro.metricaCpm !== null && <Fila etiqueta="CPM" valor={dolar(filtro.metricaCpm)} clase={claseMetrica(nivelCpm(filtro.metricaCpm))} />}
      {filtro.metricaEfectividad !== null && (
        <Fila etiqueta="% Efectividad" valor={porcentaje(filtro.metricaEfectividad)} clase={claseMetrica(nivelEfectividad(filtro.metricaEfectividad))} />
      )}
      {filtro.metricaHookRate !== null && (
        <Fila etiqueta="Hook Rate" valor={porcentaje(filtro.metricaHookRate)} clase={claseMetrica(nivelHookRate(filtro.metricaHookRate))} />
      )}
      {filtro.metricaCtr !== null && <Fila etiqueta="CTR" valor={porcentaje(filtro.metricaCtr)} clase={claseMetrica(nivelCtr(filtro.metricaCtr))} />}
      {filtro.metricaCpa !== null && <Fila etiqueta="CPA" valor={dolar(filtro.metricaCpa)} clase={claseMetrica(nivelCpa(filtro.metricaCpa))} />}
      {filtro.metricaGasto !== null && <Fila etiqueta="Gasto" valor={dolar(filtro.metricaGasto)} clase={claseMetrica(nivelGasto(filtro.metricaGasto))} />}
      {filtro.metricaCompras !== null && <Fila etiqueta="Compras" valor={String(filtro.metricaCompras)} />}
      {filtro.metricaCvr !== null && <Fila etiqueta="CVR" valor={porcentaje(filtro.metricaCvr)} clase={claseMetrica(nivelCvr(filtro.metricaCvr))} />}
    </div>
  );
}

/** El icono de barras frente al nombre del producto (igual que en ClickUp): al pasar el cursor muestra
 * las métricas del test en Meta Ads en una tarjeta flotante, sin ocupar espacio en la ficha ni en la tabla. */
export function IconoMetricasMeta({ filtro }: { filtro: FilaFiltro }) {
  if (!hayMetricas(filtro)) return null;
  return (
    <TarjetaEmergente contenido={<ContenidoMetricas filtro={filtro} />}>
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Ver métricas de Meta Ads"
      >
        <InteligenciaIcon className="h-3.5 w-3.5" />
      </span>
    </TarjetaEmergente>
  );
}
