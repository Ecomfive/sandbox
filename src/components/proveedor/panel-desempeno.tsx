"use client";

import { useMemo, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { MESES_GRAFICO, resumenDesempeno, SEMANAS_GRAFICO, serieEnvios, type DesempenoProveedor, type Periodo } from "@/lib/proveedor/desempeno";
import { paisesDe } from "@/lib/proveedor/filtro";
import { fechaCorta } from "@/lib/proveedor/textos";
import { useIdioma } from "./idioma-contexto";

// «Tu desempeño con Ecomfive» (reunión con Alcides del 11 nov 2026; prototipo aprobado por Hernán): arriba del portal del proveedor y de su
// Tablero en Compras, igual en los dos. Unidades y órdenes enviadas por semana (o por mes), por país, y los indicadores reales de los
// últimos 90 días: días promedio para cotizar, producción en 15 días y tránsito dentro del plazo del país.

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const chip = (activo: boolean) =>
  `min-h-8 rounded-full border px-3 text-xs font-semibold tabular-nums ${activo ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"} ${anilloFoco}`;

function Indicador({ titulo, valor, detalle, tono = "normal" }: { titulo: string; valor: string; detalle: string; tono?: "normal" | "bien" | "aviso" | "mal" }) {
  const color = { normal: "text-foreground", bien: "text-success", aviso: "text-warning", mal: "text-destructive" }[tono];
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <span className={`text-xl leading-tight font-semibold tabular-nums ${color}`}>{valor}</span>
      <span className="text-[11.5px] text-muted-foreground">{detalle}</span>
    </div>
  );
}

export function PanelDesempeno({ datos, hoy }: { datos: DesempenoProveedor; hoy: string }) {
  const { t, idioma, numero } = useIdioma();
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [pais, setPais] = useState<string | null>(null);
  const paises = useMemo(() => paisesDe(datos.envios.map((e) => e.pais)), [datos.envios]);
  const serie = useMemo(() => serieEnvios(datos.envios, periodo, pais, hoy), [datos.envios, periodo, pais, hoy]);
  const r = useMemo(() => resumenDesempeno(datos, pais), [datos, pais]);
  const unidades = serie.reduce((s, x) => s + x.unidades, 0);
  const ordenes = serie.reduce((s, x) => s + x.ordenes, 0);
  const rango = `${periodo === "semana" ? t.ultimasSemanas(SEMANAS_GRAFICO) : t.ultimosMeses(MESES_GRAFICO)}${pais ? ` · ${pais}` : ""}`;
  const etiqueta = (clave: string) => {
    if (periodo === "semana") return fechaCorta(clave, idioma);
    const mes = Number(clave.slice(5, 7));
    return idioma === "zh" ? `${mes}月` : MESES_ES[mes - 1];
  };
  const pct = (v: number | null) => (v == null ? t.sinDatos : `${v} %`);
  const tonoPct = (v: number | null) => (v == null ? "normal" : v >= 90 ? "bien" : v >= 70 ? "aviso" : "mal");

  // El gráfico: barras de unidades (eje izquierdo) y de órdenes (eje derecho), juntas por período.
  const W = 1000;
  const H = 250;
  const L = 56;
  const R = 44;
  const T = 14;
  const B = 32;
  const alto = H - T - B;
  const ancho = W - L - R;
  const maxU = Math.max(10, ...serie.map((x) => x.unidades));
  const potencia = Math.pow(10, Math.floor(Math.log10(maxU)));
  const pasoU = potencia * (maxU / potencia > 5 ? 2 : 1);
  const topeU = Math.ceil(maxU / pasoU) * pasoU;
  const topeO = Math.max(4, Math.ceil(Math.max(1, ...serie.map((x) => x.ordenes)) / 4) * 4);
  const grupo = ancho / Math.max(1, serie.length);
  const barra = Math.min(26, grupo * 0.32);

  return (
    <section aria-labelledby="titulo-desempeno" className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-border bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titulo-desempeno" className="m-0 mr-auto text-[15px] font-semibold">
          {t.desempenoTitulo}
        </h2>
        {paises.length > 1 && (
          <span role="group" aria-label={t.pais} className="flex flex-wrap gap-1.5">
            {[null, ...paises].map((p) => (
              <button key={p ?? "todos"} type="button" aria-pressed={pais === p} onClick={() => setPais(p)} className={chip(pais === p)}>
                {p ?? t.todosPaises}
              </button>
            ))}
          </span>
        )}
        <span role="group" aria-label={t.agruparPor} className="flex gap-0.5 rounded-lg border border-border bg-muted p-0.5">
          {(["semana", "mes"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={periodo === p}
              onClick={() => setPeriodo(p)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${anilloFoco} ${periodo === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {p === "semana" ? t.semana : t.mes}
            </button>
          ))}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Indicador titulo={t.kUnidades} valor={numero(unidades)} detalle={rango} />
        <Indicador titulo={t.kOrdenes} valor={numero(ordenes)} detalle={rango} />
        <Indicador
          titulo={t.kCotizar}
          valor={r.promedioCotizar == null ? t.sinDatos : t.dias(numero(r.promedioCotizar, 1))}
          detalle={`${t.metaCotizar} · ${t.ultimos90(r.cotizacionesMedidas)}`}
          tono={r.promedioCotizar == null ? "normal" : r.promedioCotizar <= 2 ? "bien" : r.promedioCotizar <= 5 ? "aviso" : "mal"}
        />
        <Indicador titulo={t.kProduccion} valor={pct(r.produccionATiempo)} detalle={`${t.metaProduccion} · ${t.ultimos90(r.produccionesMedidas)}`} tono={tonoPct(r.produccionATiempo)} />
        <Indicador titulo={t.kTransito} valor={pct(r.transitoATiempo)} detalle={`${t.metaTransito} · ${t.ultimos90(r.transitosMedidos)}`} tono={tonoPct(r.transitoATiempo)} />
      </div>

      <figure className="m-0 flex flex-col gap-1.5">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t.graficoEtiqueta} (${rango})`} className="h-auto w-full">
          {[0, 1, 2, 3, 4].map((i) => {
            const y = T + alto - (alto * i) / 4;
            return (
              <g key={i}>
                <line x1={L} x2={W - R} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
                <text x={L - 8} y={y + 4} textAnchor="end" fontSize={12} className="fill-muted-foreground">
                  {numero(Math.round((topeU * i) / 4))}
                </text>
                <text x={W - R + 8} y={y + 4} fontSize={12} className="fill-muted-foreground">
                  {Math.round((topeO * i) / 4)}
                </text>
              </g>
            );
          })}
          {serie.map((x, i) => {
            const cx = L + grupo * i + grupo / 2;
            const hu = (x.unidades / topeU) * alto;
            const ho = (x.ordenes / topeO) * alto;
            return (
              <g key={x.clave}>
                <rect x={cx - barra - 1} y={T + alto - hu} width={barra} height={hu} rx={3} className="fill-primario">
                  <title>{`${etiqueta(x.clave)}: ${numero(x.unidades)} ${t.leyendaUnidades.toLowerCase()}`}</title>
                </rect>
                <rect x={cx + 1} y={T + alto - ho} width={barra} height={ho} rx={3} className="fill-muted-foreground" opacity={0.55}>
                  <title>{`${etiqueta(x.clave)}: ${x.ordenes} ${t.leyendaOrdenes.toLowerCase()}`}</title>
                </rect>
                <text x={cx} y={H - 10} textAnchor="middle" fontSize={12} className="fill-muted-foreground">
                  {etiqueta(x.clave)}
                </text>
              </g>
            );
          })}
        </svg>
        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-primario" />
            {t.leyendaUnidades}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground opacity-55" />
            {t.leyendaOrdenes}
          </span>
          <span>{t.leyendaFuente}</span>
        </figcaption>
      </figure>
    </section>
  );
}
