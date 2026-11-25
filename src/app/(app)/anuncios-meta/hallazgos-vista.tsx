"use client";

import { useState, type ReactNode } from "react";
import { seccionDeHallazgo, tieneHistorialSuficiente, UMBRALES_HISTORICO, type AnalisisHistorico, type BandasMetrica, type FilaMes, type FilaTendencia, type SeccionHallazgo } from "@/lib/meta-ads/historico";
import type { InterpretacionGuardada } from "@/lib/meta-ads/interpretacion-guardada";
import { dolares } from "@/lib/meta-ads/metricas";
import { enLaVista, estadoDeTendencia, hallazgosEnVista, productoEnMarcha, type EnMarcha, type VistaActividad } from "@/lib/meta-ads/en-marcha";
import { ChatHallazgos } from "./chat-hallazgos";
import { SelectorActividad } from "./selector-actividad";
import { Anillo, Columnas, Tendencia, Variacion } from "./graficas";
import { ListaHallazgos, NOMBRE_SECCION } from "./hallazgos-tarjetas";
import { InterpretacionVista } from "./interpretacion-vista";
import { entero } from "./piezas";
import { SeccionPlegable } from "./plegable";
import { VigilanciasVista } from "./vigilancias-vista";
import { SenalesCreativasVista } from "./senales-vista";
import { RasgosDeGanadoresVista } from "./rasgos-vista";
import type { RasgosDeGanadores } from "@/lib/meta-ads/rasgos-ganadores";
import { ActualizarAnalisis } from "./actualizar-analisis";
import type { SenalesCreativas } from "@/lib/meta-ads/senales-creativas";
import type { ResultadoVigilancia } from "@/lib/meta-ads/analisis-pedido";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const colorDeTasa = (t: number | null) => (t === null ? "var(--muted-foreground)" : t >= 0.7 ? "var(--success)" : t >= 0.55 ? "var(--warning)" : "var(--destructive)");

const NOMBRE_MES = (mes: string, corto = false) => {
  const [a, m] = mes.split("-");
  const f = new Date(Date.UTC(Number(a), Number(m) - 1, 1));
  return corto ? f.toLocaleDateString("es-PA", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "") : f.toLocaleDateString("es-PA", { month: "long", year: "numeric", timeZone: "UTC" });
};

// ───────────────────────── Cifras de arriba ─────────────────────────

/** Una cifra grande con su color, su ícono y, a la derecha, un dibujo (una tendencia o un anillo): se lee de un vistazo, sin leer la frase. */
function KpiHallazgo({ titulo, valor, apoyo, color, icono, viz }: { titulo: string; valor: ReactNode; apoyo: ReactNode; color: string; icono: ReactNode; viz?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="min-w-0">
        <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-md text-white" style={{ background: color }}>
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {icono}
            </svg>
          </span>
          {titulo}
        </p>
        <p className="m-0 mt-1 text-2xl font-semibold leading-tight tabular-nums">{valor}</p>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">{apoyo}</p>
      </div>
      {viz}
    </div>
  );
}

function CifrasDeArriba({ a }: { a: AnalisisHistorico }) {
  const r = a.resumen;
  const gastoPorMes = a.meses.map((m) => m.gasto);
  const comprasPorMes = a.meses.map((m) => m.compras);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiHallazgo
        titulo="Historial analizado"
        valor={`${entero(r.campanas)} campañas`}
        apoyo={`${a.meses.length} meses · ${r.desde ?? "—"} al ${r.hasta ?? "—"}`}
        color="var(--meta-3)"
        icono={<path d="M2.5 13.5h11M4 11V8m4 3V4m4 7V6.5" />}
        viz={<Tendencia valores={gastoPorMes} color="var(--meta-3)" etiqueta="Gasto mes a mes" ancho={72} alto={30} />}
      />
      <KpiHallazgo
        titulo="Gastado y vendido"
        valor={dolares(r.gasto)}
        apoyo={`${entero(r.compras)} compras`}
        color="var(--meta-2)"
        icono={<path d="M8 2v12M10.5 5H7a1.8 1.8 0 0 0 0 3.6h2A1.8 1.8 0 0 1 9 12.2H5.5" />}
        viz={<Tendencia valores={comprasPorMes} color="var(--meta-2)" etiqueta="Compras mes a mes" ancho={72} alto={30} />}
      />
      <KpiHallazgo
        titulo="Campañas que funcionaron"
        valor={pct(r.tasaFuncionaron)}
        apoyo={`de ${entero(r.campanasMedibles)} con gasto suficiente`}
        color={colorDeTasa(r.tasaFuncionaron === null ? null : r.tasaFuncionaron >= 0.35 ? 0.7 : r.tasaFuncionaron >= 0.2 ? 0.6 : 0.3)}
        icono={<path d="m3.5 8.5 3 3 6-6.5" />}
        viz={
          r.tasaFuncionaron === null ? undefined : (
            <Anillo etiqueta={`Funcionaron ${pct(r.tasaFuncionaron)}`} tamano={58} grosor={9} partes={[{ nombre: "Funcionaron", valor: r.tasaFuncionaron, color: "var(--success)" }, { nombre: "No llegaron", valor: 1 - r.tasaFuncionaron, color: "var(--muted)" }]} />
          )
        }
      />
      <KpiHallazgo
        titulo="Tasa de entrega"
        valor={pct(r.tasaEntrega)}
        apoyo={r.tasaEntrega === null ? "sin pedidos suficientes" : "de lo que se resolvió"}
        color={colorDeTasa(r.tasaEntrega)}
        icono={<path d="M1.5 4.5h8v6h-8zM9.5 7h2.8l1.7 2v1.5h-4.5M4 12a1 1 0 1 0 0 .1M11.5 12a1 1 0 1 0 0 .1" />}
        viz={
          r.tasaEntrega === null ? undefined : (
            <Anillo etiqueta={`Entregado ${pct(r.tasaEntrega)}`} tamano={58} grosor={9} partes={[{ nombre: "Entregado", valor: r.tasaEntrega, color: colorDeTasa(r.tasaEntrega) }, { nombre: "Devuelto", valor: 1 - r.tasaEntrega, color: "var(--muted)" }]} />
          )
        }
      />
    </div>
  );
}

// ───────────────────────── Hallazgos ─────────────────────────

type Filtro = "atender" | "buenas" | "todo";
const FILTROS: { id: Filtro; texto: string; punto: string }[] = [
  { id: "atender", texto: "Para atender", punto: "bg-destructive" },
  { id: "buenas", texto: "Buenas noticias", punto: "bg-success" },
  { id: "todo", texto: "Todo", punto: "bg-muted-foreground" },
];
const SECCIONES: SeccionHallazgo[] = ["productos", "campanas", "videos", "general"];

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={activo} onClick={onClick} className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${activo ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`}>
      {children}
    </button>
  );
}

function SeccionHallazgos({ a }: { a: AnalisisHistorico }) {
  const [filtro, setFiltro] = useState<Filtro>("atender");
  const [seccion, setSeccion] = useState<SeccionHallazgo | "todas">("todas");
  const [soloFirmes, setSoloFirmes] = useState(false);
  const coincide = (h: AnalisisHistorico["hallazgos"][number], f: Filtro) => (f === "todo" ? true : f === "atender" ? h.tono === "alerta" : h.tono === "bueno");
  const base = a.hallazgos.filter((h) => (seccion === "todas" || seccionDeHallazgo(h) === seccion) && (!soloFirmes || h.certeza === "firme"));
  const visibles = base.filter((h) => coincide(h, filtro));
  const porSeccion = (s: SeccionHallazgo) => a.hallazgos.filter((h) => seccionDeHallazgo(h) === s).length;
  const atender = a.hallazgos.filter((h) => h.tono === "alerta").length;
  return (
    <SeccionPlegable titulo="Lo que dicen los datos" resumen={`${atender} para atender de ${a.hallazgos.length} hallazgos`} derecha={`${entero(a.hallazgos.length)} hallazgos`}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Qué mostrar" className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <Chip key={f.id} activo={filtro === f.id} onClick={() => setFiltro(f.id)}>
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${f.punto}`} />
                {f.texto}
                <span className="tabular-nums opacity-80">{base.filter((h) => coincide(h, f.id)).length}</span>
              </Chip>
            ))}
          </div>
          <label className="ml-auto inline-flex min-h-8 cursor-pointer items-center gap-2 text-xs font-medium">
            <input type="checkbox" role="switch" checked={soloFirmes} onChange={(e) => setSoloFirmes(e.target.checked)} className="h-4 w-4 accent-[var(--success)]" />
            Solo los firmes
          </label>
        </div>
        <div role="group" aria-label="De qué pantalla" className="flex flex-wrap gap-1.5">
          <Chip activo={seccion === "todas"} onClick={() => setSeccion("todas")}>
            Todas las pantallas
          </Chip>
          {SECCIONES.map((s) => (
            <Chip key={s} activo={seccion === s} onClick={() => setSeccion(s)}>
              {NOMBRE_SECCION[s]}
              <span className="tabular-nums opacity-80">{porSeccion(s)}</span>
            </Chip>
          ))}
        </div>
        <ListaHallazgos hallazgos={visibles} vistos={6} conSeccion vacio={filtro === "atender" ? "Nada que atender con estos filtros." : "No hay hallazgos con estos filtros."} />
        <p className="m-0 text-xs text-muted-foreground">
          «Funcionó» = al menos {dolares(100)} gastados y un CPA dentro del tope de su producto. Cada pantalla (Productos, Campañas, Videos) muestra además los suyos.
        </p>
      </div>
    </SeccionPlegable>
  );
}

// ───────────────────────── Mes a mes ─────────────────────────

interface MetricaMes {
  id: string;
  texto: string;
  valor: (f: FilaMes) => number | null;
  formato: (n: number) => string;
  /** Qué significa que suba. */
  sube: "arriba-bueno" | "arriba-malo" | "neutral";
  /** Se suma mes a mes (el mes en curso queda incompleto) o es una tasa. */
  suma: boolean;
}

const METRICAS_MES: MetricaMes[] = [
  { id: "compras", texto: "Compras", valor: (f) => f.compras, formato: entero, sube: "arriba-bueno", suma: true },
  { id: "gasto", texto: "Gasto", valor: (f) => f.gasto, formato: (n) => dolares(n), sube: "neutral", suma: true },
  { id: "cpa", texto: "CPA", valor: (f) => f.cpa, formato: (n) => dolares(n), sube: "arriba-malo", suma: false },
  { id: "ctr", texto: "CTR", valor: (f) => f.ctr, formato: (n) => `${n.toFixed(2)} %`, sube: "arriba-bueno", suma: false },
  { id: "hook", texto: "Hook", valor: (f) => f.hook, formato: (n) => `${n.toFixed(1)} %`, sube: "arriba-bueno", suma: false },
  { id: "cpm", texto: "CPM", valor: (f) => f.cpm, formato: (n) => dolares(n), sube: "arriba-malo", suma: false },
  { id: "efectividad", texto: "Clic a visita", valor: (f) => f.efectividad, formato: (n) => `${n.toFixed(1)} %`, sube: "arriba-bueno", suma: false },
  { id: "cvr", texto: "CVR", valor: (f) => f.cvr, formato: (n) => `${n.toFixed(2)} %`, sube: "arriba-bueno", suma: false },
];

function TablaMeses({ filas }: { filas: FilaMes[] }) {
  const celda = (n: number | null, f: (x: number) => string) => (n === null ? "—" : f(n));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">Mes</th>
            {["Gasto", "Compras", "CPA", "CTR", "Hook", "CPM", "Clic a visita", "CVR"].map((t) => (
              <th key={t} scope="col" className="px-2 py-1.5 text-right font-medium">{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...filas].reverse().map((f) => (
            <tr key={f.mes} className="border-b border-border last:border-b-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-medium capitalize">{NOMBRE_MES(f.mes)}</th>
              <td className="px-2 py-1.5 text-right tabular-nums">{dolares(f.gasto)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{entero(f.compras)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.cpa, dolares)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.ctr, (n) => `${n.toFixed(2)} %`)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.hook, (n) => `${n.toFixed(1)} %`)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.cpm, dolares)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.efectividad, (n) => `${n.toFixed(1)} %`)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.cvr, (n) => `${n.toFixed(2)} %`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeccionMeses({ a }: { a: AnalisisHistorico }) {
  const [producto, setProducto] = useState("");
  const [metricaId, setMetricaId] = useState("cpa");
  if (a.meses.length === 0) return null;
  const filas = producto ? (a.mesesPorProducto.find((p) => p.nombre === producto)?.filas ?? []) : a.meses;
  const m = METRICAS_MES.find((x) => x.id === metricaId) ?? METRICAS_MES[0];
  // El mes en curso solo cuenta como incompleto si el historial termina antes de que acabe ese mes.
  const hasta = a.resumen.hasta;
  const incompleto = (mes: string) => Boolean(hasta) && hasta!.slice(0, 7) === mes && Number(hasta!.slice(8, 10)) < 28;
  const completos = filas.filter((f) => !incompleto(f.mes) && m.valor(f) !== null);
  const mejor = completos.length ? completos.reduce((x, y) => ((m.valor(y)! > m.valor(x)!) === (m.sube !== "arriba-malo") ? y : x)) : null;
  const peor = completos.length ? completos.reduce((x, y) => ((m.valor(y)! > m.valor(x)!) === (m.sube !== "arriba-malo") ? x : y)) : null;
  const ultimo = completos.at(-1);
  const anterior = completos.at(-2);
  const hayIncompleto = filas.some((f) => incompleto(f.mes));
  const resumen = ultimo ? `${m.texto} de ${NOMBRE_MES(ultimo.mes)}: ${m.formato(m.valor(ultimo)!)}` : undefined;
  return (
    <SeccionPlegable
      titulo="Mes a mes"
      resumen={resumen}
      derecha={
        a.mesesPorProducto.length > 0 ? (
          <label className="flex items-center gap-2">
            Ver
            <select value={producto} onChange={(e) => setProducto(e.target.value)} className="min-h-8 max-w-[14rem] rounded-md border border-border-control bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              <option value="">Todas las campañas</option>
              {a.mesesPorProducto.map((p) => (
                <option key={p.nombre} value={p.nombre}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Qué medir" className="flex flex-wrap gap-1.5">
          {METRICAS_MES.map((x) => (
            <Chip key={x.id} activo={metricaId === x.id} onClick={() => setMetricaId(x.id)}>
              {x.texto}
            </Chip>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {ultimo && (
            <div className="rounded-lg bg-muted px-3 py-2">
              <p className="m-0 text-xs text-muted-foreground">Último mes completo ({NOMBRE_MES(ultimo.mes, true)})</p>
              <p className="m-0 flex flex-wrap items-center gap-2 text-lg font-semibold tabular-nums">
                {m.formato(m.valor(ultimo)!)}
                {anterior && m.valor(anterior) !== null && <Variacion actual={m.valor(ultimo)!} anterior={m.valor(anterior)!} sentido={m.sube} />}
              </p>
            </div>
          )}
          {mejor && (
            <div className="rounded-lg bg-success-soft px-3 py-2">
              <p className="m-0 text-xs text-success">{m.suma ? "El más alto" : m.sube === "arriba-malo" ? "El más barato" : "El mejor"}</p>
              <p className="m-0 text-lg font-semibold tabular-nums">
                {m.formato(m.valor(mejor)!)} <span className="text-xs font-normal capitalize text-muted-foreground">{NOMBRE_MES(mejor.mes, true)}</span>
              </p>
            </div>
          )}
          {peor && peor !== mejor && (
            <div className="rounded-lg bg-destructive-soft px-3 py-2">
              <p className="m-0 text-xs text-destructive">{m.suma ? "El más bajo" : m.sube === "arriba-malo" ? "El más caro" : "El peor"}</p>
              <p className="m-0 text-lg font-semibold tabular-nums">
                {m.formato(m.valor(peor)!)} <span className="text-xs font-normal capitalize text-muted-foreground">{NOMBRE_MES(peor.mes, true)}</span>
              </p>
            </div>
          )}
        </div>
        <Columnas
          etiquetaGrafica={`${m.texto} mes a mes`}
          alto={150}
          color={m.sube === "arriba-malo" ? "var(--meta-2)" : "var(--meta-1)"}
          formato={m.formato}
          datos={filas.map((f) => ({ etiqueta: `${NOMBRE_MES(f.mes, true)}${incompleto(f.mes) ? "*" : ""}`, valor: m.valor(f) ?? 0 }))}
        />
        {hayIncompleto && <p className="m-0 text-xs text-muted-foreground">* El mes en curso está incompleto{m.suma ? ": se ve más bajo porque todavía no termina" : ": compáralo con cuidado"}.</p>}
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">Ver la tabla mes a mes</summary>
          <div className="mt-2">
            <TablaMeses filas={filas} />
          </div>
        </details>
      </div>
    </SeccionPlegable>
  );
}

// ───────────────────────── Cómo va frente a antes ─────────────────────────

function TarjetaTendencia({ f }: { f: FilaTendencia }) {
  const { cpaPrev, cpaRec } = f.cambio;
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 min-w-0 text-sm font-medium leading-snug">
          <span className="line-clamp-2">{f.nombre}</span>
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{f.nivel}</span>
        </p>
        {cpaPrev !== null && cpaRec !== null && <Variacion actual={cpaRec} anterior={cpaPrev} sentido="arriba-malo" />}
      </div>
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
        <span>CPA {cpaPrev === null ? "—" : dolares(cpaPrev)} → <span className="font-semibold text-foreground">{cpaRec === null ? "—" : dolares(cpaRec)}</span></span>
        <span>Compras {entero(f.comprasPrev)} → <span className="font-semibold text-foreground">{entero(f.comprasRec)}</span></span>
      </p>
      {f.cambio.motivo && <p className="m-0 rounded-md bg-muted px-2 py-1 text-xs">{f.cambio.motivo}</p>}
    </li>
  );
}

function ColumnaTendencias({ titulo, filas, tono }: { titulo: string; filas: FilaTendencia[]; tono: "baja" | "mejora" }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? filas : filas.slice(0, 5);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className={`m-0 flex items-center gap-2 text-xs font-semibold ${tono === "baja" ? "text-destructive" : "text-success"}`}>
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {tono === "baja" ? <path d="M2.5 5 6 8.5l2.5-2.5 5 5.5M10.5 11.5h3v-3" /> : <path d="M2.5 11 6 7.5 8.5 10l5-5.500M10.5 4.500h3v3" />}
        </svg>
        {titulo} ({filas.length})
      </h3>
      {filas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Nada en este grupo.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lista.map((f) => (
            <TarjetaTendencia key={`${f.nivel}:${f.nombre}`} f={f} />
          ))}
        </ul>
      )}
      {filas.length > 5 && (
        <button type="button" aria-expanded={todos} onClick={() => setTodos((v) => !v)} className="min-h-9 self-start rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
          {todos ? "Ver menos" : `Ver los ${filas.length - 5} restantes`}
        </button>
      )}
    </div>
  );
}

function SeccionTendencias({ filas }: { filas: FilaTendencia[] }) {
  const [ventana, setVentana] = useState<"mes" | "semana">("mes");
  const delPeriodo = filas.filter((f) => f.ventana === ventana);
  const empeoran = delPeriodo.filter((f) => f.cambio.sentido === "baja").sort((a, b) => b.gastoRec - a.gastoRec);
  const mejoran = delPeriodo.filter((f) => f.cambio.sentido === "mejora").sort((a, b) => b.gastoRec - a.gastoRec);
  return (
    <SeccionPlegable
      titulo="Cómo va frente a antes"
      abierta={false}
      resumen={`${empeoran.length} empeoran · ${mejoran.length} mejoran`}
      derecha={
        <div role="group" aria-label="Comparar" className="flex overflow-hidden rounded-md border border-border-control">
          {(["mes", "semana"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={ventana === v} onClick={() => setVentana(v)} className={`min-h-8 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${ventana === v ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted"}`}>
              {v === "mes" ? "Último mes" : "Última semana"}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs text-muted-foreground">
          {ventana === "mes" ? "Último mes contra el anterior" : "Última semana contra las tres anteriores"} · desde {dolares(ventana === "mes" ? UMBRALES_HISTORICO.gastoMes : UMBRALES_HISTORICO.gastoSemana)} gastados en cada periodo.
        </p>
        <div className="grid gap-5 lg:grid-cols-2">
          <ColumnaTendencias titulo="Empeoran" filas={empeoran} tono="baja" />
          <ColumnaTendencias titulo="Mejoran" filas={mejoran} tono="mejora" />
        </div>
      </div>
    </SeccionPlegable>
  );
}

// ───────────────────────── Desde qué valor funciona ─────────────────────────

function BandaMetrica({ b }: { b: BandasMetrica }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="m-0 text-sm font-semibold">{b.titulo}</h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {b.filas.map((f) => {
          const color = f.campanas === 0 ? "var(--muted)" : f.funcionaron === 0 ? "var(--destructive)" : f.tasa >= b.tasaBase * 1.5 ? "var(--success)" : "var(--meta-1)";
          return (
            <li key={f.etiqueta} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs">
              <span className="truncate font-medium" title={f.etiqueta}>
                {f.etiqueta}
              </span>
              <span className="relative block h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(f.campanas ? 3 : 0, Math.round(f.tasa * 100))}%`, background: color }} />
              </span>
              <span className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                {f.campanas ? (
                  <>
                    <span className="font-semibold text-foreground">{pct(f.tasa)}</span> · {entero(f.funcionaron)}/{entero(f.campanas)}
                  </>
                ) : (
                  "—"
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-[11px] text-muted-foreground">En promedio funciona {pct(b.tasaBase)}.</p>
    </div>
  );
}

function SeccionBandas({ a }: { a: AnalisisHistorico }) {
  return (
    <SeccionPlegable titulo="Desde qué valor funciona" abierta={false} resumen={`${a.bandas.length} métricas · funcionó ${pct(a.resumen.tasaFuncionaron)} de las campañas`} derecha={`${entero(a.resumen.campanasMedibles)} campañas con gasto suficiente`}>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs text-muted-foreground">
          En cada banda de una métrica: de las campañas con al menos {dolares(100)} gastados, cuántas llegaron a su CPA tope. La barra es el porcentaje que funcionó; en verde, lo que funciona mucho más que el promedio; en rojo, lo que nunca funcionó.
        </p>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {a.bandas.map((b) => (
            <BandaMetrica key={b.id} b={b} />
          ))}
        </div>
      </div>
    </SeccionPlegable>
  );
}

/**
 * Anuncios Meta › Hallazgos (24 nov 2026; rediseñada el mismo día a pedido de Alcides: «más visual, más profesional, menos texto»): lo que dicen los datos de todo el historial, sin necesidad de la calculadora. Arriba las cifras con su color y su
 * tendencia, la interpretación con IA y los hallazgos como tarjetas; abajo el chat, el mes a mes con su gráfica, cómo va frente a antes y desde qué valor funciona. Todo se pliega y se despliega. La entrega por producto y «qué genera más ventas»
 * viven ahora en Productos, Campañas y Videos, junto a los hallazgos de cada una.
 */
export function HallazgosVista({ analisis, interpretacion, iaConectada, preparando, vigilancias, senales, rasgos, enMarcha, generadoEn, escribe }: { analisis: AnalisisHistorico; interpretacion: InterpretacionGuardada | null; iaConectada: boolean; preparando: boolean; vigilancias: ResultadoVigilancia[]; senales: SenalesCreativas[]; rasgos: RasgosDeGanadores[]; enMarcha: EnMarcha; generadoEn: string | null; escribe: boolean }) {
  const a = analisis;
  // Arranca en lo que está en marcha: lo apagado se consulta aparte.
  const [vista, setVista] = useState<VistaActividad>("activos");
  const hallazgos = hallazgosEnVista(a.hallazgos, enMarcha, vista);
  const cuentas = { activos: hallazgosEnVista(a.hallazgos, enMarcha, "activos").length, apagados: hallazgosEnVista(a.hallazgos, enMarcha, "apagados").length, todos: a.hallazgos.length };
  if (!tieneHistorialSuficiente(a)) {
    return <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">Todavía hay muy poco historial (menos de {UMBRALES_HISTORICO.minUnidades} campañas con gasto suficiente) para sacar conclusiones. Cuando haya más, este análisis aparece solo.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <ActualizarAnalisis generadoEn={generadoEn} escribe={escribe} />
      <CifrasDeArriba a={a} />
      <VigilanciasVista vigilancias={vigilancias} escribe={escribe} />
      <InterpretacionVista guardada={interpretacion} preparando={preparando} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SelectorActividad etiqueta="Qué productos y campañas ver" vista={vista} alCambiar={setVista} cuentas={cuentas} textos={{ activos: "En marcha", apagados: "Apagados", todos: "Todos" }} />
        <p className="m-0 min-w-0 flex-1 basis-64 text-xs text-muted-foreground">
          Recorta los hallazgos, las señales y cómo va frente a antes. {vista === "activos" ? "Lo de ángulos y métricas, que sirve para todo, también sale." : "Estos datos son de todo el historial."}
        </p>
      </div>
      <SenalesCreativasVista senales={senales.filter((s) => enLaVista(productoEnMarcha(enMarcha, s.producto) ? "activo" : "apagado", vista))} />
      <RasgosDeGanadoresVista rasgos={rasgos} />
      <SeccionHallazgos key={vista} a={{ ...a, hallazgos }} />
      <ChatHallazgos iaConectada={iaConectada} />
      <SeccionMeses a={a} />
      <SeccionTendencias filas={a.tendencias.filter((t) => enLaVista(estadoDeTendencia(t, enMarcha), vista))} />
      <SeccionBandas a={a} />
    </div>
  );
}
