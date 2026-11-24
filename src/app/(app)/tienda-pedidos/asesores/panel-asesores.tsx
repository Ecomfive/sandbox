"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { ETIQUETA_FIN, RANGOS_ATENCION, textoMinutos, type AsesorConPuntaje, type CuentaPedidos, type FinPedido, type ResultadoAtencion, type ResumenBot } from "@/lib/tienda/asesores";

/** Lo que la página le pasa al panel (todo ya calculado en el servidor). */
export interface DatosPanelAsesores {
  periodo: string;
  /** Las metas del puesto del manual ATC (24 nov 2026): valor del periodo y si se cumple. */
  metas?: { id: string; nombre: string; meta: number; unidad: string; valor: number | null; cumple: boolean | null }[];
  totales: {
    confirmadosSistema: number;
    confirmadosAntes: number;
    enShopify: number;
    atendidos: number;
    confirmados: number;
    cancelados: number;
    enGestion: number;
    tasa: number | null;
    mediana: number | null;
  };
  asesores: AsesorConPuntaje[];
  rangos: number[];
  porDia: { desde: string; sistema: number; shopify: number }[];
  pasos: {
    clave: string;
    ordenId: string;
    numero: string;
    tiendaId: string;
    tienda: string;
    cliente: string | null;
    producto: string | null;
    entra: string | null;
    resultado: ResultadoAtencion;
    minutos: number | null;
    pasos: { t: string; agregadas: string[]; quitadas: string[]; tipo: ResultadoAtencion }[];
  }[];
  cola: { tiendaId: string; tienda: string; porConfirmar: number; esperando: number; masViejo: string | null; escribe: boolean }[];
  multiTienda: boolean;
  /** Las ventas del bot de iComfly frente a los demás pedidos (23 nov 2026). */
  bot: ResumenBot;
}

// Un solo tono (el morado del sistema) en distintas fuerzas; gris para lo que no tiene asesor.
const tono = (pct: number) => `color-mix(in oklab, var(--primario) ${pct}%, var(--card))`;
const TONOS_ASESOR = [100, 78, 60, 46, 34, 24].map(tono);
const GRIS = "color-mix(in oklab, var(--muted-foreground) 40%, var(--card))";
const TONOS_RANGO = [tono(100), tono(78), tono(56), tono(36), GRIS, "color-mix(in oklab, var(--muted-foreground) 65%, var(--card))"];
const CORONA = ["#c99a1d", "#8f97a6", "#b06e3c"];
const NOMBRE_CORONA = ["de oro", "de plata", "de bronce"];

const num = (n: number) => n.toLocaleString("es-PA");
const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });
const dia = (iso: string) => new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });
const diaCorto = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "UTC" });

function Tarjeta({ titulo, extra, children, id }: { titulo: string; extra?: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="m-0 text-sm font-semibold">
          {titulo}
        </h2>
        {extra && <span className="text-xs text-muted-foreground">{extra}</span>}
      </div>
      {children}
    </section>
  );
}

/** Una dona con su leyenda; el centro dice el total. Al pasar por un trozo (o su fila de la leyenda) se marca el otro. */
function Dona({ partes, centro, sub }: { partes: { nombre: string; n: number; color: string }[]; centro: string; sub: string }) {
  const [marcado, setMarcado] = useState<number | null>(null);
  const total = partes.reduce((s, p) => s + p.n, 0);
  const R = 66, r = 44, c = 75;
  let ang = -Math.PI / 2;
  const P = (a: number, ra: number) => `${(c + ra * Math.cos(a)).toFixed(2)} ${(c + ra * Math.sin(a)).toFixed(2)}`;
  const visibles = partes.filter((p) => p.n > 0).length;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 150 150" className="h-[132px] w-[132px] flex-none" role="img" aria-label={partes.map((p) => `${p.nombre}: ${p.n}`).join(", ")}>
        {total === 0 && <circle cx={c} cy={c} r={(R + r) / 2} fill="none" stroke="var(--border)" strokeWidth={R - r} />}
        {partes.map((p, i) => {
          if (!p.n) return null;
          const a = (p.n / total) * Math.PI * 2;
          const gap = visibles > 1 ? 0.025 : 0;
          const a0 = ang + gap / 2, a1 = ang + a - gap / 2;
          ang += a;
          const g = a > Math.PI ? 1 : 0;
          // Un solo trozo: el anillo completo (un arco de 360° no se dibuja).
          const d = visibles === 1 ? `M ${c - R} ${c} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0 M ${c - r} ${c} a ${r} ${r} 0 1 1 ${2 * r} 0 a ${r} ${r} 0 1 1 ${-2 * r} 0` : `M ${P(a0, R)} A ${R} ${R} 0 ${g} 1 ${P(a1, R)} L ${P(a1, r)} A ${r} ${r} 0 ${g} 0 ${P(a0, r)} Z`;
          return (
            <path key={p.nombre} d={d} fill={p.color} fillRule="evenodd" opacity={marcado === null || marcado === i ? 1 : 0.45} onMouseEnter={() => setMarcado(i)} onMouseLeave={() => setMarcado(null)}>
              <title>{`${p.nombre}: ${num(p.n)} (${pct(p.n, total)} %)`}</title>
            </path>
          );
        })}
        <text x="75" y="74" textAnchor="middle" fontSize="22" fontWeight="700" fill="currentColor">
          {centro}
        </text>
        <text x="75" y="92" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
          {sub}
        </text>
      </svg>
      <ul className="m-0 flex min-w-[12rem] flex-1 list-none flex-col gap-0.5 p-0">
        {partes.map((p, i) => (
          <li
            key={p.nombre}
            onMouseEnter={() => setMarcado(i)}
            onMouseLeave={() => setMarcado(null)}
            className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-sm ${marcado === i ? "bg-primario-suave" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ backgroundColor: p.color }} />
              <span className="truncate">{p.nombre}</span>
            </span>
            <span className="font-semibold whitespace-nowrap tabular-nums">
              {num(p.n)} · {pct(p.n, total)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Corona({ i }: { i: 0 | 1 | 2 }) {
  return (
    <svg viewBox="0 0 20 16" className="h-4 w-5 flex-none" role="img" aria-label={`Corona ${NOMBRE_CORONA[i]}`}>
      <path d="M2 13 1 4l5 4 4-7 4 7 5-4-1 9z" fill={CORONA[i]} />
      <rect x="2" y="13.5" width="16" height="2" rx="1" fill={CORONA[i]} />
    </svg>
  );
}

/** Confirmados por día (o semana): desde el sistema abajo y directo en Shopify arriba, en barras apiladas. */
function PorDia({ datos, nombres = ["desde el sistema", "directo en Shopify"] }: { datos: DatosPanelAsesores["porDia"]; nombres?: [string, string] }) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(640);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const observador = new ResizeObserver(() => setAncho(el.clientWidth || 640));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  const H = 200, m = { l: 34, r: 8, t: 8, b: 22 };
  const max = Math.max(1, ...datos.map((d) => d.sistema + d.shopify));
  const y = (v: number) => m.t + (H - m.t - m.b) * (1 - v / max);
  const bw = (ancho - m.l - m.r) / Math.max(1, datos.length);
  const cada = Math.max(1, Math.ceil(datos.length / (ancho > 520 ? 7 : 4)));
  return (
    <div ref={caja} className="relative h-[200px] w-full">
      <svg width={ancho} height={H} role="img" aria-label={`Por día: ${nombres.filter(Boolean).join(" y ")}`} className="absolute inset-0">
        {[0, Math.round(max / 2), max].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={ancho - m.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
              {t}
            </text>
          </g>
        ))}
        {datos.map((d, i) => {
          const X = m.l + i * bw + 1.5, w = Math.max(2, bw - 3), y1 = y(d.sistema), y2 = y(d.sistema + d.shopify);
          return (
            <g key={d.desde}>
              {d.sistema > 0 && <rect x={X} y={y1} width={w} height={H - m.b - y1} rx={2} fill="var(--primario)" />}
              {d.shopify > 0 && <rect x={X} y={y2} width={w} height={Math.max(0, y1 - y2 - (d.sistema > 0 ? 2 : 0))} rx={2} fill={GRIS} />}
              <rect x={m.l + i * bw} y={m.t} width={bw} height={H - m.t - m.b} fill="transparent">
                <title>{`${diaCorto(d.desde)}: ${d.sistema} ${nombres[0]}${d.shopify ? ` · ${d.shopify} ${nombres[1]}` : ""}`}</title>
              </rect>
              {i % cada === 0 && (
                <text x={X + w / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
                  {diaCorto(d.desde)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const ETIQUETA_RESULTADO: Record<ResultadoAtencion, string> = { confirma: "Confirmados", cancela: "Cancelados", gestion: "En gestión", otro: "Otros cambios" };

/**
 * El panel de asesores (23 nov 2026, prototipo aprobado por Hernán): cifras del periodo, quién confirma y qué pasa con lo atendido (donas), rangos de atención,
 * el ranking con corona a los 3 mejores, confirmados por día y el paso a paso de cada asesor con cada pedido. Un solo tono, como el resto del sistema.
 */
export function PanelAsesores({ datos }: { datos: DatosPanelAsesores }) {
  const { totales: t, asesores } = datos;
  const [elegido, setElegido] = useState<string | null>(asesores[0]?.clave ?? null);
  const [filtro, setFiltro] = useState<ResultadoAtencion | "todos">("todos");
  const paso = useRef<HTMLElement>(null);
  const color = useMemo(() => new Map([...asesores].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((a, i) => [a.clave, TONOS_ASESOR[i % TONOS_ASESOR.length]])), [asesores]);
  const actual = asesores.find((a) => a.clave === elegido) ?? null;
  const lista = datos.pasos.filter((p) => p.clave === elegido && (filtro === "todos" || p.resultado === filtro || (filtro === "gestion" && p.resultado === "otro")));
  const conAsesor = pct(t.confirmadosSistema, t.confirmadosSistema + t.enShopify);
  const cambio = t.confirmadosAntes ? Math.round(((t.confirmadosSistema - t.confirmadosAntes) / t.confirmadosAntes) * 100) : null;
  const totalRangos = datos.rangos.reduce((s, n) => s + n, 0);
  const maxRango = Math.max(1, ...datos.rangos);
  const cola = datos.cola.reduce((s, c) => s + c.porConfirmar, 0);
  const sinEscribir = datos.cola.filter((c) => !c.escribe).map((c) => c.tienda);

  function verPaso(clave: string) {
    setElegido(clave);
    setFiltro("todos");
    paso.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  const cifras: [string, string, string, boolean?][] = [
    ["Confirmados desde el sistema", num(t.confirmadosSistema), cambio === null ? "sin periodo anterior para comparar" : `${cambio >= 0 ? "▲" : "▼"} ${Math.abs(cambio)} % frente al periodo anterior`, true],
    ["% de confirmación", t.tasa === null ? "—" : `${t.tasa.toLocaleString("es-PA")} %`, "confirmados ÷ (confirmados + cancelados)"],
    ["Tarda en confirmar", textoMinutos(t.mediana), "mediana desde que entra el pedido"],
    ["Directo en Shopify", num(t.enShopify), "confirmados sin asesor"],
    ["Cola ahora", num(cola), "por confirmar en las tiendas"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Resumen del periodo" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
        {cifras.map(([titulo, valor, detalle, fuerte]) => (
          <div key={titulo} className="bg-card px-4 py-2.5">
            <div className="text-xs text-muted-foreground">{titulo}</div>
            <div className={`text-2xl leading-tight font-bold tabular-nums ${fuerte ? "text-primario" : ""}`}>{valor}</div>
            <div className="text-xs text-muted-foreground">{detalle}</div>
          </div>
        ))}
      </section>

      {datos.metas && (
        <section aria-label="Metas del puesto" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-[13px]">
          <span className="text-xs font-semibold tracking-wide text-primario uppercase">Metas del puesto</span>
          {datos.metas.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1.5" title={`Meta: ${m.meta} ${m.unidad} o más (manual ATC; base de la bonificación mensual)`}>
              <span className="text-muted-foreground">{m.nombre}</span>
              <b className="tabular-nums">{m.valor === null ? "—" : `${m.valor.toLocaleString("es-PA", { maximumFractionDigits: 2 })} ${m.unidad}`}</b>
              <span className={`text-xs ${m.cumple === null ? "text-muted-foreground" : m.cumple ? "text-success" : "text-destructive"}`}>
                {m.cumple === null ? "sin datos" : m.cumple ? `✓ meta ${m.meta}` : `✗ meta ${m.meta}`}
              </span>
            </span>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Tarjeta id="pa-quien" titulo="Quién confirma" extra={`${conAsesor} % con asesor`}>
          <Dona
            partes={[...asesores.map((a) => ({ nombre: a.nombre, n: a.confirmados, color: color.get(a.clave)! })).sort((a, b) => b.n - a.n), { nombre: "Directo en Shopify", n: t.enShopify, color: GRIS }]}
            centro={num(t.confirmadosSistema + t.enShopify)}
            sub="confirmados"
          />
          <p className="m-0 text-xs text-muted-foreground">«Directo en Shopify» es lo confirmado sin pasar por el sistema: no tiene asesor.</p>
        </Tarjeta>
        <Tarjeta id="pa-que" titulo="Qué pasa con lo atendido" extra={t.tasa === null ? undefined : `${t.tasa.toLocaleString("es-PA")} % confirmación`}>
          <Dona
            partes={[
              { nombre: "Confirmados", n: t.confirmados, color: tono(100) },
              { nombre: "Cancelados", n: t.cancelados, color: tono(52) },
              { nombre: "En gestión", n: t.enGestion, color: GRIS },
            ]}
            centro={num(t.atendidos)}
            sub="atendidos"
          />
          <p className="m-0 text-xs text-muted-foreground">Cada pedido cuenta una vez por asesor, con lo último que hizo.</p>
        </Tarjeta>
        <Tarjeta id="pa-rangos" titulo="Rangos de atención" extra="desde que entra hasta que se confirma">
          <div className="flex flex-col gap-1.5">
            {RANGOS_ATENCION.map((r, i) => (
              <div key={r.etiqueta} className="grid grid-cols-[5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-sm">
                <span>{r.etiqueta}</span>
                <span className="h-4 overflow-hidden rounded bg-primario-suave">
                  <span className="block h-full rounded" style={{ width: `${(datos.rangos[i] / maxRango) * 100}%`, backgroundColor: TONOS_RANGO[i] }} />
                </span>
                <span className="text-right whitespace-nowrap text-muted-foreground tabular-nums">
                  {num(datos.rangos[i])} · {pct(datos.rangos[i], totalRangos)} %
                </span>
              </div>
            ))}
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            {totalRangos ? `${pct(datos.rangos[0] + datos.rangos[1], totalRangos)} % se confirma en menos de 30 minutos.` : "Todavía nadie confirmó desde el sistema en este periodo."}
          </p>
        </Tarjeta>
      </div>

      <Tarjeta id="pa-ranking" titulo="Los mejores en atención" extra="Puntaje: 50 % confirmación, 30 % rapidez, 20 % volumen · corona con 20 resueltos o más">
        {asesores.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2">Asesor</th>
                  {datos.multiTienda && <th className="px-2 py-2">Tiendas</th>}
                  <th className="px-2 py-2 text-right">Puntaje</th>
                  <th className="px-2 py-2 text-right">Atendidos</th>
                  <th className="px-2 py-2 text-right">Confirmados</th>
                  <th className="px-2 py-2 text-right">Cancelados</th>
                  <th className="px-2 py-2 text-right">En gestión</th>
                  <th className="px-2 py-2 text-right">% confirmación</th>
                  <th className="px-2 py-2 text-right">Tarda (mediana)</th>
                  <th className="px-2 py-2">Rangos</th>
                </tr>
              </thead>
              <tbody>
                {asesores.map((a, i) => (
                  <tr key={a.clave} onClick={() => verPaso(a.clave)} className={`cursor-pointer border-t border-border hover:bg-primario-suave ${a.clave === elegido ? "bg-primario-suave shadow-[inset_3px_0_0_var(--primario)]" : ""}`}>
                    <td className="px-2 py-2 text-center font-semibold text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={(e) => (e.stopPropagation(), verPaso(a.clave))} className={`flex items-center gap-2 font-semibold whitespace-nowrap ${anilloFoco}`}>
                        {a.nombre}
                        {a.corona !== null && <Corona i={a.corona} />}
                      </button>
                    </td>
                    {datos.multiTienda && <td className="px-2 py-2 text-muted-foreground">{a.tiendas.join(", ")}</td>}
                    <td className="px-2 py-2 text-right font-bold text-primario tabular-nums">{a.puntos}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(a.atendidos)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(a.confirmados)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(a.cancelados)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(a.enGestion)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {a.tasa === null ? "—" : `${Math.round(a.tasa)} %`}
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-primario-suave">
                          <span className="block h-full bg-primario" style={{ width: `${a.tasa ?? 0}%` }} />
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums" title={a.minutosPromedio === null ? undefined : `Promedio: ${textoMinutos(a.minutosPromedio)}`}>
                      {textoMinutos(a.minutosMediana)}
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex h-2.5 w-32 gap-px overflow-hidden rounded-[3px] bg-primario-suave" title={RANGOS_ATENCION.map((r, j) => `${r.etiqueta}: ${a.rangos[j] ?? 0}`).join(" · ")}>
                        {a.rangos.map((n, j) => (n ? <span key={j} style={{ flex: n, backgroundColor: TONOS_RANGO[j] }} /> : null))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nadie confirmó ni cambió etiquetas desde el sistema en {datos.periodo}. Cada asesor aparece aquí cuando usa «Confirmar pedido» o cambia las etiquetas en la ficha del
            pedido.
          </p>
        )}
        <p className="m-0 text-xs text-muted-foreground">
          Pulsa un asesor para ver su paso a paso. «Tarda» es la mediana desde que entró el pedido en Shopify hasta que lo confirmó (pasa el cursor para ver el promedio).
          {sinEscribir.length ? ` ${sinEscribir.join(", ")} no tiene encendido «Escribir en Shopify»: ahí no se puede confirmar desde el sistema.` : ""}
        </p>
      </Tarjeta>

      <Tarjeta id="pa-dias" titulo={datos.porDia.length > 62 ? "Confirmados por semana" : "Confirmados por día"} extra="desde el sistema y directo en Shopify">
        <PorDia datos={datos.porDia} />
        <ul className="m-0 flex list-none flex-wrap gap-4 p-0 text-sm">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-primario" />
            Desde el sistema (con asesor)
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: GRIS }} />
            Directo en Shopify (sin asesor)
          </li>
        </ul>
      </Tarjeta>

      <SeccionBot bot={datos.bot} multiTienda={datos.multiTienda} />

      <section ref={paso} aria-labelledby="pa-paso" className="flex scroll-mt-20 flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pa-paso" className="m-0 text-sm font-semibold">
            Paso a paso
          </h2>
          {actual && <span className="text-xs text-muted-foreground">{actual.nombre} · lo más reciente arriba</span>}
        </div>
        {!actual ? (
          <p className="m-0 text-sm text-muted-foreground">Aquí sale lo que hizo cada asesor con cada pedido, cuando empiecen a confirmar desde el sistema.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Asesor
                <select value={actual.clave} onChange={(e) => (setElegido(e.target.value), setFiltro("todos"))} className={`min-h-9 rounded-md border border-border-control bg-card px-2 text-sm text-foreground ${anilloFoco}`}>
                  {asesores.map((a) => (
                    <option key={a.clave} value={a.clave}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1.5 text-base font-bold">
                {actual.nombre}
                {actual.corona !== null && <Corona i={actual.corona} />}
              </div>
              <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
                {(
                  [
                    ["Lugar en el ranking", `${asesores.indexOf(actual) + 1} de ${asesores.length}`],
                    ["Puntaje", String(actual.puntos)],
                    ["Atendidos", num(actual.atendidos)],
                    ["Confirmados", num(actual.confirmados)],
                    ["Cancelados", num(actual.cancelados)],
                    ["En gestión", num(actual.enGestion)],
                    ["% confirmación", actual.tasa === null ? "—" : `${Math.round(actual.tasa)} %`],
                    ["Tarda (mediana)", textoMinutos(actual.minutosMediana)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="m-0 text-right font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qué pedidos ver">
                {(["todos", "confirma", "cancela", "gestion"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filtro === f}
                    onClick={() => setFiltro(f)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${anilloFoco} ${filtro === f ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`}
                  >
                    {f === "todos" ? "Todos" : ETIQUETA_RESULTADO[f]}
                  </button>
                ))}
              </div>
              {lista.length ? (
                <ol className="m-0 flex list-none flex-col gap-2 p-0">
                  {lista.map((p) => (
                    <li key={p.ordenId} className="rounded-md border border-border px-3 py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0">
                          <Link href={`/tienda-pedidos?tienda=${p.tiendaId}&pedido=${p.ordenId}`} className={`font-semibold tabular-nums hover:underline ${anilloFoco}`}>
                            {p.numero}
                          </Link>
                          {` · ${p.tienda}${p.cliente ? ` · ${p.cliente}` : ""}${p.producto ? ` · ${p.producto}` : ""}`}
                        </span>
                        <span className="text-xs whitespace-nowrap text-muted-foreground">
                          {p.resultado === "confirma" ? `Confirmó en ${textoMinutos(p.minutos)}` : p.resultado === "cancela" ? "Lo canceló" : "Sigue en gestión"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
                        {p.entra && <span className="rounded-full bg-primario-suave px-2 py-0.5 whitespace-nowrap text-foreground-soft">Entró {dia(p.entra)} {hora(p.entra)}</span>}
                        {p.pasos.map((s, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {(p.entra || i > 0) && <span aria-hidden="true" className="text-muted-foreground">→</span>}
                            <span
                              className={`rounded-full px-2 py-0.5 whitespace-nowrap ${s.tipo === "confirma" ? "bg-primario text-white" : s.tipo === "cancela" ? "border border-border" : "bg-primario-suave text-foreground"}`}
                            >
                              {hora(s.t)} · {s.agregadas.length ? s.agregadas.join(", ") : `quitó ${s.quitadas.join(", ")}`}
                            </span>
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 text-sm text-muted-foreground">Nada así en {datos.periodo}.</p>
              )}
            </div>
          </div>
        )}
      </section>

      <Tarjeta id="pa-cola" titulo="Cola ahora" extra="sin confirmar en cada tienda">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <th className="px-2 py-2">Tienda</th>
                <th className="px-2 py-2 text-right">Por confirmar</th>
                <th className="px-2 py-2 text-right">Esperando respuesta</th>
                <th className="px-2 py-2 text-right">El más viejo lleva</th>
              </tr>
            </thead>
            <tbody>
              {datos.cola.map((c) => (
                <tr key={c.tiendaId} className="border-t border-border">
                  <td className="px-2 py-2 font-medium">
                    <Link href={`/tienda-pedidos/confirmacion?tienda=${c.tiendaId}`} className={`hover:underline ${anilloFoco}`}>
                      {c.tienda}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{num(c.porConfirmar)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{num(c.esperando)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.masViejo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}

const TONO_FIN: Record<FinPedido, string> = {
  entregado: tono(100),
  en_camino: tono(72),
  confirmado: tono(48),
  pendiente: tono(28),
  cancelado: GRIS,
  devuelto: "color-mix(in oklab, var(--muted-foreground) 65%, var(--card))",
};
const ORDEN_FIN: FinPedido[] = ["entregado", "en_camino", "confirmado", "pendiente", "cancelado", "devuelto"];
const porc = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PA")} %`);

/** Una cifra del bot con la de los demás pedidos al lado, para comparar. */
function Comparada({ titulo, bot, resto, detalle }: { titulo: string; bot: string; resto: string; detalle: string }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl leading-tight font-bold text-primario tabular-nums">{bot}</span>
        <span className="text-xs text-muted-foreground">el resto: {resto}</span>
      </div>
      <div className="text-xs text-muted-foreground">{detalle}</div>
    </div>
  );
}

/**
 * Las ventas del bot de iComfly (23 nov 2026, pedido de Hernán): cuántos pedidos toma el bot por WhatsApp (etiqueta «chatbot» o nota «Venta por bot»), cómo
 * terminan y su confirmación y entrega frente a los demás pedidos, por tienda y por día. Quién los confirma después no se sabe todavía (queda en Shopify).
 */
function SeccionBot({ bot, multiTienda }: { bot: ResumenBot; multiTienda: boolean }) {
  const total = bot.bot.total + bot.resto.total;
  const cancelados = (c: CuentaPedidos) => c.fin.cancelado;
  return (
    <section aria-labelledby="pa-bot" className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pa-bot" className="m-0 text-sm font-semibold">
          Bot de iComfly
        </h2>
        <span className="text-xs text-muted-foreground">lo que vende el bot por WhatsApp (etiqueta «chatbot» o nota «Venta por bot»)</span>
      </div>
      {bot.bot.total === 0 ? (
        <p className="m-0 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">El bot no tomó pedidos en este periodo.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
            <Comparada titulo="Pedidos del bot" bot={num(bot.bot.total)} resto={num(bot.resto.total)} detalle={`${pct(bot.bot.total, total)} % de todos los pedidos`} />
            <Comparada titulo="Pasan la confirmación" bot={porc(bot.bot.confirmacion)} resto={porc(bot.resto.confirmacion)} detalle="de los ya resueltos (sin los por confirmar)" />
            <Comparada titulo="Se entregan" bot={porc(bot.bot.entrega)} resto={porc(bot.resto.entrega)} detalle="de los que ya terminaron" />
            <Comparada titulo="Cancelados" bot={num(cancelados(bot.bot))} resto={num(cancelados(bot.resto))} detalle={`${pct(cancelados(bot.bot), bot.bot.total)} % de los del bot`} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-medium text-muted-foreground">Cómo terminan los pedidos del bot</h3>
              <Dona partes={ORDEN_FIN.map((f) => ({ nombre: ETIQUETA_FIN[f], n: bot.bot.fin[f], color: TONO_FIN[f] }))} centro={num(bot.bot.total)} sub="del bot" />
            </div>
            {multiTienda && (
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-xs font-medium text-muted-foreground">Por tienda</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[26rem] border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        <th className="px-2 py-1.5">Tienda</th>
                        <th className="px-2 py-1.5 text-right">Del bot</th>
                        <th className="px-2 py-1.5 text-right">% del total</th>
                        <th className="px-2 py-1.5 text-right">Confirmación</th>
                        <th className="px-2 py-1.5 text-right">Entrega</th>
                        <th className="px-2 py-1.5 text-right">Cancelados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bot.porTienda.map((t) => (
                        <tr key={t.tienda} className="border-t border-border">
                          <td className="px-2 py-1.5 font-medium">{t.tienda}</td>
                          <td className="px-2 py-1.5 text-right font-semibold text-primario tabular-nums">{num(t.bot.total)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{pct(t.bot.total, t.total)} %</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{porc(t.bot.confirmacion)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{porc(t.bot.entrega)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{num(t.bot.fin.cancelado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-xs font-medium text-muted-foreground">{bot.porDia.length > 62 ? "Pedidos del bot por semana" : "Pedidos del bot por día"}</h3>
            <PorDia datos={bot.porDia.map((d) => ({ desde: d.desde, sistema: d.bot, shopify: 0 }))} nombres={["del bot", ""]} />
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            Quién confirma después los pedidos del bot (el propio bot, una persona en Shopify o un asesor desde el sistema) todavía no se mide: cuando los asesores
            confirmen desde el sistema, sus confirmaciones de pedidos del bot salen en su fila.
          </p>
        </>
      )}
    </section>
  );
}
