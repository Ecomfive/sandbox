"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { formatearMoneda } from "@/lib/formato";
import type { Resumen } from "@/lib/tienda/resumen";
import { variacion, type AlertaTienda, type ResumenTienda, type TonoAlerta } from "@/lib/tienda/tablero-tiendas";

// «Todas las tiendas» en Pedidos de tienda (13 nov 2026, pedido de Hernán; prototipo aprobado): el tablero que compara las tiendas del país. Las cuentas están en
// `src/lib/tienda/tablero-tiendas.ts`; aquí solo se dibuja (gráficas en SVG, con su cuadro al pasar el cursor y la tabla para leerlo todo).

const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const uno = (n: number) => n.toLocaleString("es-PA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctTxt = (n: number | null) => (n === null ? "—" : `${uno(n)} %`);

/** «▲ 12.3 %» en verde o «▼ 4.0 %» en rojo; nada sin con qué comparar. */
function Cambio({ actual, antes, sufijo }: { actual: number; antes: number; sufijo?: string }) {
  const v = variacion(actual, antes);
  if (v === null) return <span className="text-muted-foreground">sin periodo anterior</span>;
  return (
    <span>
      <span className={v >= 0 ? "text-success" : "text-destructive"}>
        {v >= 0 ? "▲" : "▼"} {uno(Math.abs(v))} %
      </span>
      {sufijo && <span className="text-muted-foreground"> {sufijo}</span>}
    </span>
  );
}

function Indicador({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-card px-3 py-2.5">
      <span className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">{titulo}</span>
      <span className="text-[22px] leading-tight font-bold tabular-nums">{valor}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{detalle}</span>
    </div>
  );
}

const TONO_ALERTA: Record<TonoAlerta, { clase: string; icono: string; nombre: string }> = {
  critico: { clase: "bg-destructive", icono: "!", nombre: "Grave" },
  serio: { clase: "bg-warning", icono: "!", nombre: "Revisar" },
  aviso: { clase: "bg-warning", icono: "!", nombre: "Atención" },
  info: { clase: "bg-primario", icono: "i", nombre: "Pendiente" },
  bien: { clase: "bg-success", icono: "✓", nombre: "Bien" },
};

function Alertas({ alertas, nombres, hrefs }: { alertas: AlertaTienda[]; nombres: Record<string, string>; hrefs: Record<string, string> }) {
  const [todas, setTodas] = useState(false);
  const vistas = todas ? alertas : alertas.slice(0, 5);
  return (
    <section aria-labelledby="titulo-decidir" className="rounded-xl border border-border bg-card p-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-1.5">
        <h2 id="titulo-decidir" className="m-0 text-sm font-semibold">
          Para decidir hoy
        </h2>
        <span className="text-xs text-muted-foreground">Lo que se salió de lo normal en cada tienda, de lo más grave a lo menos</span>
      </div>
      {alertas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Nada fuera de lo normal en el periodo.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {vistas.map((a, i) => {
            const t = TONO_ALERTA[a.tono];
            return (
              <li key={i} className="grid grid-cols-[22px_1fr_auto] items-start gap-2 rounded-lg bg-muted px-2.5 py-2 text-[13px]">
                <span aria-hidden="true" className={`mt-px grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white ${t.clase}`}>
                  {t.icono}
                </span>
                <span className="min-w-0">
                  <span className="sr-only">{t.nombre}: </span>
                  <span className="block font-semibold">{a.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{a.detalle}</span>
                </span>
                <Link href={hrefs[a.tiendaId] ?? "#"} className={`rounded text-xs font-semibold whitespace-nowrap text-primario hover:underline ${anilloFoco}`}>
                  Ver {nombres[a.tiendaId]} →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {alertas.length > 5 && (
        <button type="button" onClick={() => setTodas((v) => !v)} className={`mt-1.5 rounded px-0 py-1 text-[13px] font-semibold text-primario ${anilloFoco}`}>
          {todas ? "Ver menos" : `Ver ${alertas.length - 5} más`}
        </button>
      )}
    </section>
  );
}

/** La tendencia de 30 días de una tienda, en una línea chica de su color. */
function Tendencia({ t }: { t: ResumenTienda }) {
  const W = 220;
  const H = 30;
  const mx = Math.max(1, ...t.dias.map((d) => d.pedidos));
  const puntos = t.dias.map((d, i) => `${(i / Math.max(1, t.dias.length - 1)) * W},${H - 2 - (d.pedidos / mx) * (H - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="h-[30px] min-w-0 flex-1">
      <polyline points={puntos} fill="none" stroke={t.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Tasa({ nombre, valor, mala }: { nombre: string; valor: number | null; mala: boolean }) {
  return (
    <div className="grid grid-cols-[82px_1fr_48px] items-center gap-1.5 text-xs">
      <span>{nombre}</span>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded bg-muted">
        <span className={`block h-full rounded ${mala ? "bg-destructive" : "bg-primario"}`} style={{ width: `${Math.min(100, valor ?? 0)}%` }} />
      </span>
      <span className={`text-right tabular-nums ${mala ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{pctTxt(valor)}</span>
    </div>
  );
}

function TarjetaTienda({ t, href, moneda }: { t: ResumenTienda; href: string; moneda: string }) {
  const a = t.actual;
  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-3" style={{ borderTop: `3px solid ${t.color}` }}>
      <div className="flex items-center justify-between gap-1.5">
        <h3 className="m-0 inline-flex items-center gap-1.5 text-sm font-semibold">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px]" style={{ background: t.color }} />
          {t.nombre}
        </h3>
        <span className="text-[11px] text-muted-foreground">{t.fuente}</span>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-2.5 gap-y-1">
        <div className="flex flex-col">
          <dt className="text-[11px] text-muted-foreground">Pedidos</dt>
          <dd className="m-0 text-[17px] font-bold tabular-nums">{entero(a.pedidos)}</dd>
          <dd className="m-0 text-[11.5px] tabular-nums">
            <Cambio actual={a.pedidos} antes={t.anterior.pedidos} />
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-[11px] text-muted-foreground">Facturado</dt>
          <dd className="m-0 text-[17px] font-bold tabular-nums">{formatearMoneda(a.facturado, moneda)}</dd>
          <dd className="m-0 text-[11.5px] tabular-nums">
            <Cambio actual={a.facturado} antes={t.anterior.facturado} />
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-1">
        <Tasa nombre="Confirmación" valor={a.confirmacion} mala={a.confirmacion !== null && a.confirmacion < 55} />
        <Tasa nombre="Entrega" valor={a.entrega} mala={a.entrega !== null && a.entrega < 60} />
        <Tasa nombre="Cancelación" valor={a.cancelacion} mala={a.cancelacion !== null && a.cancelacion >= 25} />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>Tendencia</span>
        <Tendencia t={t} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate tabular-nums">
          Ticket {a.ticketPromedio === null ? "—" : formatearMoneda(a.ticketPromedio, moneda)} · {entero(t.porConfirmar)} por confirmar
        </span>
        <Link href={href} className={`shrink-0 rounded font-semibold whitespace-nowrap text-primario hover:underline ${anilloFoco}`}>
          Ver pedidos →
        </Link>
      </div>
    </article>
  );
}

/** El cuadro que sigue al cursor sobre las gráficas. */
function useCuadro() {
  const [cuadro, setCuadro] = useState<{ x: number; y: number; contenido: ReactNode } | null>(null);
  const nodo = cuadro ? (
    <div
      role="status"
      className="pointer-events-none fixed z-50 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-lg tabular-nums"
      style={{ left: Math.min(cuadro.x + 14, (typeof window === "undefined" ? 1200 : window.innerWidth) - 220), top: cuadro.y + 12 }}
    >
      {cuadro.contenido}
    </div>
  ) : null;
  return { mostrar: (e: { clientX: number; clientY: number }, contenido: ReactNode) => setCuadro({ x: e.clientX, y: e.clientY, contenido }), ocultar: () => setCuadro(null), nodo };
}

function Punto({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-2 w-2 rounded-[2px]" style={{ background: color }} />;
}

/** Pedidos por día de cada tienda: una línea por tienda, un solo eje, el nombre al final de cada línea y una línea vertical con los números del día. */
function GraficaDias({ tiendas }: { tiendas: ResumenTienda[] }) {
  const { mostrar, ocultar, nodo } = useCuadro();
  const [dia, setDia] = useState<number | null>(null);
  const W = 640;
  const H = 260;
  const L = 40;
  const R = 74;
  const T = 10;
  const B = 26;
  const n = Math.max(...tiendas.map((t) => t.dias.length), 2);
  const maximo = Math.max(1, ...tiendas.flatMap((t) => t.dias.map((d) => d.pedidos)));
  // Cuatro rayas en números redondos (0, 10, 20, 30, 40), no 8 o 23.
  const cuarto = Math.ceil(maximo / 4);
  const base = Math.pow(10, Math.floor(Math.log10(cuarto)));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * base).find((m) => m >= cuarto) ?? cuarto;
  const tope = paso * 4;
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / tope) * (H - T - B);
  const referencia = [...tiendas].sort((a, b) => b.dias.length - a.dias.length)[0];
  const etiquetaDia = (i: number) => {
    const d = referencia?.dias[i]?.dia;
    return d ? `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}` : `día ${i + 1}`;
  };
  // Los nombres al final de cada línea, separados para que no se encimen.
  const finales = tiendas.map((t) => ({ t, y: y(t.dias.at(-1)?.pedidos ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < finales.length; i++) if (finales[i].y - finales[i - 1].y < 13) finales[i].y = finales[i - 1].y + 13;
  const marcas = [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1];
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pedidos por día de cada tienda" className="h-auto w-full">
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (tope * k) / 4;
          return (
            <g key={k}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-border" />
              <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} className="fill-muted-foreground">
                {entero(v)}
              </text>
            </g>
          );
        })}
        {[...new Set(marcas)].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} className="fill-muted-foreground">
            {etiquetaDia(i)}
          </text>
        ))}
        {tiendas.map((t) => (
          <polyline key={t.id} points={t.dias.map((d, i) => `${x(i)},${y(d.pedidos)}`).join(" ")} fill="none" stroke={t.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {finales.map((f) => (
          <text key={f.t.id} x={W - R + 6} y={f.y + 4} fontSize={11.5} fontWeight={600} className="fill-foreground">
            {f.t.nombre}
          </text>
        ))}
        {dia !== null && <line x1={x(dia)} x2={x(dia)} y1={T} y2={H - B} className="stroke-muted-foreground" strokeDasharray="3 3" />}
        <rect
          x={L}
          y={T}
          width={W - L - R}
          height={H - T - B}
          fill="transparent"
          onMouseMove={(e) => {
            const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
            setDia(i);
            mostrar(
              e,
              <>
                <b className="mb-0.5 block">{etiquetaDia(i)}</b>
                {[...tiendas]
                  .sort((a, b) => (b.dias[i]?.pedidos ?? 0) - (a.dias[i]?.pedidos ?? 0))
                  .map((t) => (
                    <span key={t.id} className="flex items-center gap-1.5">
                      <Punto color={t.color} />
                      {t.nombre}: {entero(t.dias[i]?.pedidos ?? 0)}
                    </span>
                  ))}
              </>,
            );
          }}
          onMouseLeave={() => {
            setDia(null);
            ocultar();
          }}
        />
      </svg>
      {nodo}
    </>
  );
}

/** Facturado por tienda, de mayor a menor, con su monto al lado. */
function GraficaFacturado({ tiendas, moneda, total }: { tiendas: ResumenTienda[]; moneda: string; total: number }) {
  const { mostrar, ocultar, nodo } = useCuadro();
  const orden = [...tiendas].sort((a, b) => b.actual.facturado - a.actual.facturado);
  const W = 420;
  const L = 78;
  const R = 84;
  const fila = 40;
  const H = Math.max(60, 14 + orden.length * fila);
  const mx = Math.max(1, orden[0]?.actual.facturado ?? 1);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Facturado por tienda" className="h-auto w-full">
        {orden.map((t, i) => {
          const yy = 10 + i * fila;
          const w = (t.actual.facturado / mx) * (W - L - R);
          return (
            <g
              key={t.id}
              onMouseMove={(e) =>
                mostrar(
                  e,
                  <>
                    <b className="mb-0.5 block">{t.nombre}</b>
                    <span className="block">Facturado: {formatearMoneda(t.actual.facturado, moneda)}</span>
                    <span className="block">Periodo anterior: {formatearMoneda(t.anterior.facturado, moneda)}</span>
                    <span className="block">{total > 0 ? `${uno((t.actual.facturado / total) * 100)} % del total` : ""}</span>
                  </>,
                )
              }
              onMouseLeave={ocultar}
            >
              <text x={L - 8} y={yy + 15} textAnchor="end" fontSize={12} className="fill-foreground">
                {t.nombre}
              </text>
              <rect x={L} y={yy + 2} width={Math.max(4, w)} height={20} rx={4} fill={t.color} />
              <text x={L + Math.max(4, w) + 6} y={yy + 16} fontSize={12} fontWeight={600} className="fill-foreground">
                {formatearMoneda(t.actual.facturado, moneda)}
              </text>
              <rect x={0} y={yy} width={W} height={fila - 4} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {nodo}
    </>
  );
}

const ESTADOS_GRAFICA: { id: string; nombre: string; color: string; de: (r: Resumen) => number }[] = [
  { id: "entregado", nombre: "Entregado", color: "var(--success)", de: (r) => r.porEstado.entregado },
  { id: "camino", nombre: "En camino", color: "var(--muted-foreground)", de: (r) => r.porEstado.en_camino },
  { id: "confirmar", nombre: "Por confirmar o confirmado", color: "var(--warning)", de: (r) => r.porEstado.nuevo + r.porEstado.confirmado },
  { id: "devuelto", nombre: "Devuelto", color: "#e07a2e", de: (r) => r.porEstado.devuelto },
  { id: "cancelado", nombre: "Cancelado", color: "var(--destructive)", de: (r) => r.porEstado.cancelado },
];

/** Cómo terminan los pedidos de cada tienda, de cada 100. */
function GraficaEstados({ tiendas }: { tiendas: ResumenTienda[] }) {
  const { mostrar, ocultar, nodo } = useCuadro();
  return (
    <>
      <div className="flex flex-col gap-2">
        {tiendas.map((t) => (
          <div key={t.id} className="grid grid-cols-[80px_1fr] items-center gap-2 text-[12.5px]">
            <span className="truncate">{t.nombre}</span>
            <div className="flex h-[18px] gap-[2px] overflow-hidden rounded" role="img" aria-label={`${t.nombre}: ${ESTADOS_GRAFICA.map((e) => `${e.nombre} ${entero(e.de(t.actual))}`).join(", ")}`}>
              {ESTADOS_GRAFICA.map((e) => {
                const v = t.actual.pedidos ? (e.de(t.actual) / t.actual.pedidos) * 100 : 0;
                return v > 0 ? (
                  <span
                    key={e.id}
                    className="block h-full"
                    style={{ width: `${v}%`, background: e.color }}
                    onMouseMove={(ev) =>
                      mostrar(
                        ev,
                        <>
                          <b className="mb-0.5 block">{t.nombre}</b>
                          <span className="flex items-center gap-1.5">
                            <Punto color={e.color} />
                            {e.nombre}: {entero(e.de(t.actual))} ({uno(v)} %)
                          </span>
                        </>,
                      )
                    }
                    onMouseLeave={ocultar}
                  />
                ) : null;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
        {ESTADOS_GRAFICA.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1.5">
            <Punto color={e.color} />
            {e.nombre}
          </span>
        ))}
      </div>
      {nodo}
    </>
  );
}

function Marco({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-1.5">
        <h2 className="m-0 text-sm font-semibold">{titulo}</h2>
        {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

export function TableroTiendas({
  tiendas,
  todas,
  alertas,
  hrefs,
  moneda,
  dias,
}: {
  tiendas: ResumenTienda[];
  todas: { actual: Resumen; anterior: Resumen; porConfirmar: number };
  alertas: AlertaTienda[];
  /** La lista de pedidos de cada tienda, con el periodo elegido. */
  hrefs: Record<string, string>;
  moneda: string;
  /** Los días del periodo («30»), para los textos. */
  dias: number;
}) {
  const a = todas.actual;
  const nombres = Object.fromEntries(tiendas.map((t) => [t.id, t.nombre]));
  const conPedidos = tiendas.filter((t) => t.actual.pedidos > 0 || t.anterior.pedidos > 0);
  const antes = `vs ${dias} días antes`;
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Todas las tiendas" className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        <Indicador titulo="Pedidos" valor={entero(a.pedidos)} detalle={<Cambio actual={a.pedidos} antes={todas.anterior.pedidos} sufijo={antes} />} />
        <Indicador titulo="Facturado" valor={formatearMoneda(a.facturado, moneda)} detalle={<Cambio actual={a.facturado} antes={todas.anterior.facturado} sufijo={antes} />} />
        <Indicador titulo="Ticket promedio" valor={a.ticketPromedio === null ? "—" : formatearMoneda(a.ticketPromedio, moneda)} detalle="por pedido no cancelado" />
        <Indicador titulo="Confirmación" valor={pctTxt(a.confirmacion)} detalle="de los pedidos" />
        <Indicador titulo="Entrega" valor={pctTxt(a.entrega)} detalle="de lo que salió" />
        <Indicador titulo="Cancelación" valor={pctTxt(a.cancelacion)} detalle="de los pedidos" />
        <Indicador titulo="Por confirmar" valor={entero(todas.porConfirmar)} detalle="esperan llamada o mensaje" />
      </section>

      <Alertas alertas={alertas} nombres={nombres} hrefs={hrefs} />

      <section aria-labelledby="titulo-cada-tienda">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1.5">
          <h2 id="titulo-cada-tienda" className="m-0 text-sm font-semibold">
            Cada tienda
          </h2>
          <span className="text-xs text-muted-foreground">Una tarjeta por tienda; al agregar otra, aparece sola aquí</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-2.5">
          {[...tiendas]
            .sort((x, y) => y.actual.facturado - x.actual.facturado)
            .map((t) => (
              <TarjetaTienda key={t.id} t={t} href={hrefs[t.id] ?? "#"} moneda={moneda} />
            ))}
        </div>
      </section>

      {conPedidos.length > 0 && (
        <>
          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <Marco titulo="Pedidos por día" nota="Del periodo elegido">
              <GraficaDias tiendas={conPedidos} />
              <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
                {conPedidos.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1.5">
                    <Punto color={t.color} />
                    {t.nombre}
                  </span>
                ))}
              </div>
            </Marco>
            <Marco titulo="Facturado por tienda" nota="Sin cancelados">
              <GraficaFacturado tiendas={conPedidos} moneda={moneda} total={a.facturado} />
            </Marco>
          </div>
          <Marco titulo="Cómo terminan los pedidos" nota="De cada 100 pedidos de la tienda">
            <GraficaEstados tiendas={conPedidos} />
          </Marco>
        </>
      )}

      <details className="rounded-xl border border-border bg-card p-3.5">
        <summary className={`cursor-pointer rounded text-[13px] font-semibold text-primario ${anilloFoco}`}>Ver como tabla</summary>
        <div className="mt-2.5 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-[11.5px] text-muted-foreground">
                {["Tienda", "Pedidos", "Antes", "Facturado", "Ticket", "Confirmación", "Entrega", "Cancelación", "Devolución", "Por confirmar"].map((h, i) => (
                  <th key={h} scope="col" className={`border-b border-border px-2 py-1.5 font-semibold whitespace-nowrap ${i ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiendas.map((t) => (
                <tr key={t.id} className="tabular-nums">
                  <th scope="row" className="border-b border-border px-2 py-1.5 text-left font-medium whitespace-nowrap">
                    {t.nombre}
                  </th>
                  {[
                    entero(t.actual.pedidos),
                    entero(t.anterior.pedidos),
                    formatearMoneda(t.actual.facturado, moneda),
                    t.actual.ticketPromedio === null ? "—" : formatearMoneda(t.actual.ticketPromedio, moneda),
                    pctTxt(t.actual.confirmacion),
                    pctTxt(t.actual.entrega),
                    pctTxt(t.actual.cancelacion),
                    pctTxt(t.actual.devolucion),
                    entero(t.porConfirmar),
                  ].map((v, i) => (
                    <td key={i} className="border-b border-border px-2 py-1.5 text-right whitespace-nowrap">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
