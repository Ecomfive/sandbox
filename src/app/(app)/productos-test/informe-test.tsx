"use client";

import { useMemo, useState } from "react";
import { CabeceraTarjeta, Delta, Indicador, Pastilla, BotonBarra, Segmentado } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { etiquetaEstado, type FilaProductoTest } from "./def-productos-test";
import {
  CPA_OBJETIVO,
  agrupar,
  diaMes,
  estadisticas,
  etiquetaCorta,
  etiquetaPeriodo,
  finDe,
  limpiarCategoria,
  paraRevisar,
  porCategoria,
  porcentaje,
  promedio,
  resultadoDe,
  textoInforme,
  usd,
  type Granularidad,
} from "./informe";

const OPCIONES_GRANULARIDAD: { valor: Granularidad; etiqueta: string }[] = [
  { valor: "dia", etiqueta: "Día" },
  { valor: "semana", etiqueta: "Semana" },
  { valor: "mes", etiqueta: "Mes" },
];
/** Cuántas barras caben en la gráfica según cómo se agrupe. */
const BARRAS: Record<Granularidad, number> = { dia: 24, semana: 8, mes: 12 };
const TITULO_GRAFICA: Record<Granularidad, string> = {
  dia: "Productos testeados por día",
  semana: "Productos testeados por semana",
  mes: "Productos testeados por mes",
};
const TITULO_INFORME: Record<Granularidad, string> = { dia: "Informe diario", semana: "Informe semanal", mes: "Informe mensual" };

const celda = "border-b border-border px-3.5 py-2 text-[13px] last:border-b-0";
const th = "border-b border-border bg-muted px-3.5 py-2 text-left text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase";

/**
 * Informe de Productos Test por día, semana o mes: indicadores, gráfica de lo testeado (pulsar una barra elige ese
 * periodo), cómo se diferencian winners y fallidos, categorías, winners y lo que está cerca del objetivo. El texto del
 * informe se copia listo para enviarlo. Todo se calcula con los productos que ya cargó la página.
 */
export function InformeTest({ productos, codigoPais }: { productos: FilaProductoTest[]; codigoPais: string }) {
  const { mostrarToast } = useToast();
  const [granularidad, setGranularidad] = useState<Granularidad>("semana");
  const [elegida, setElegida] = useState<string | null>(null);

  const periodos = useMemo(() => agrupar(productos, granularidad), [productos, granularidad]);
  const ultimaFecha = useMemo(() => productos.reduce((m, p) => (p.fechaTest && p.fechaTest > m ? p.fechaTest : m), ""), [productos]);
  const sinFecha = productos.filter((p) => !p.fechaTest).length;

  if (periodos.length === 0) {
    return (
      <p className="rounded-[10px] border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Todavía no hay tests con fecha para armar el informe. Agrega productos desde la pestaña Productos y llena su «Fecha Test».
      </p>
    );
  }

  const enCurso = (clave: string) => finDe(clave, granularidad) > ultimaFecha;
  // Por defecto, el último periodo completo: la semana o el mes a medias haría ver caídas que no existen.
  const ultimo = periodos[periodos.length - 1];
  const porDefecto = periodos.length > 1 && enCurso(ultimo.clave) ? periodos[periodos.length - 2] : ultimo;
  const indice = Math.max(0, periodos.findIndex((p) => p.clave === (elegida ?? porDefecto.clave)));
  const actual = periodos[indice];
  const anterior = indice > 0 ? periodos[indice - 1] : null;

  const s = estadisticas(actual.filas);
  const sa = anterior ? estadisticas(anterior.filas) : null;
  const visibles = periodos.slice(-BARRAS[granularidad]);
  const maximo = Math.max(...visibles.map((p) => p.filas.length));
  const ganadores = actual.filas.filter((f) => resultadoDe(f.estado) === "ganador");
  const fallidos = actual.filas.filter((f) => resultadoDe(f.estado) === "fallido");
  const categorias = porCategoria(actual.filas);
  const revisar = paraRevisar(actual.filas);
  const ganadoresOrdenados = [...ganadores].sort((a, b) => (a.metricaCpa ?? Infinity) - (b.metricaCpa ?? Infinity));

  async function copiar() {
    const texto = textoInforme(actual, granularidad, codigoPais);
    try {
      await navigator.clipboard.writeText(texto);
      mostrarToast("Informe copiado");
    } catch {
      mostrarToast("No se pudo copiar. Tu navegador bloqueó el acceso al portapapeles.", "destructive");
    }
  }

  const metricas: { nombre: string; valor: (f: FilaProductoTest) => number | null; formato: (n: number) => string }[] = [
    { nombre: "CPA", valor: (f) => f.metricaCpa, formato: (n) => usd(n) },
    { nombre: "CTR", valor: (f) => f.metricaCtr, formato: (n) => porcentaje(n) },
    { nombre: "Hook rate", valor: (f) => f.metricaHookRate, formato: (n) => porcentaje(n) },
    { nombre: "CVR", valor: (f) => f.metricaCvr, formato: (n) => porcentaje(n) },
    { nombre: "Compras por test", valor: (f) => f.metricaCompras, formato: (n) => n.toLocaleString("es-CR", { maximumFractionDigits: 1 }) },
    { nombre: "Gasto por test", valor: (f) => f.metricaGasto, formato: (n) => usd(n) },
  ];

  function irA(delta: number) {
    const destino = periodos[indice + delta];
    if (destino) setElegida(destino.clave);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          etiqueta="Agrupar por"
          valor={granularidad}
          alCambiar={(g) => {
            setGranularidad(g);
            setElegida(null);
          }}
          opciones={OPCIONES_GRANULARIDAD}
        />
        <BotonBarra aria-label="Periodo anterior" disabled={indice === 0} onClick={() => irA(-1)} className="w-[34px] justify-center px-0 disabled:opacity-40">
          ‹
        </BotonBarra>
        <h2 className="min-w-[11rem] text-[15px] font-semibold tracking-tight">
          {etiquetaPeriodo(actual.clave, granularidad, true)}
          {enCurso(actual.clave) && (
            <span className="ml-2 align-[2px]">
              <Pastilla tono="aviso">en curso</Pastilla>
            </span>
          )}
        </h2>
        <BotonBarra aria-label="Periodo siguiente" disabled={indice === periodos.length - 1} onClick={() => irA(1)} className="w-[34px] justify-center px-0 disabled:opacity-40">
          ›
        </BotonBarra>
        <span className="flex-1" />
        <BotonBarra principal onClick={copiar}>
          Copiar informe
        </BotonBarra>
      </div>

      <section aria-label="Indicadores" className="overflow-hidden rounded-[10px] border border-border bg-card">
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-b border-border bg-muted px-3.5 py-2 text-xs">
          <span className="font-semibold tracking-[0.04em] text-muted-foreground uppercase">{TITULO_INFORME[granularidad]}</span>
          <span className="text-muted-foreground">
            {codigoPais}
            {enCurso(actual.clave) ? ` · periodo incompleto, hay datos hasta el ${diaMes(ultimaFecha)}` : ""}
            {anterior ? ` · comparado con ${etiquetaPeriodo(anterior.clave, granularidad, false)}` : " · sin periodo anterior para comparar"}
          </span>
        </div>
        <div className="flex flex-wrap">
          <Indicador
            titulo="Productos testeados"
            valor={s.testeados.toLocaleString("es-CR")}
            detalle={sa ? <><Delta valor={s.testeados - sa.testeados} sufijo="" decimales={0} /> vs anterior</> : "en el periodo"}
          />
          <Indicador
            titulo="Winners"
            punto={s.ganadores > 0 ? "exito" : undefined}
            valor={s.ganadores.toLocaleString("es-CR")}
            detalle={<>{porcentaje(s.tasa, 0)} de los testeados {sa && <Delta valor={s.tasa - sa.tasa} sufijo=" pts" decimales={0} />}</>}
          />
          <Indicador titulo="Gasto en tests" valor={usd(s.gasto, 0)} detalle={`${usd(s.testeados ? s.gasto / s.testeados : 0)} por producto`} />
          <Indicador
            titulo="Compras"
            valor={s.compras.toLocaleString("es-CR")}
            detalle={sa ? <><Delta valor={s.compras - sa.compras} sufijo="" decimales={0} /> vs anterior</> : "en el periodo"}
          />
          <Indicador
            titulo="CPA global"
            punto={s.cpa === null ? undefined : s.cpa <= CPA_OBJETIVO ? "exito" : "peligro"}
            valor={s.cpa === null ? "—" : usd(s.cpa)}
            detalle={s.cpa === null ? "sin compras" : <><b className={`font-medium ${s.cpa <= CPA_OBJETIVO ? "text-success" : "text-destructive"}`}>{s.cpa <= CPA_OBJETIVO ? "dentro" : "sobre"}</b> del objetivo de {usd(CPA_OBJETIVO)}</>}
          />
          <Indicador
            titulo="Costo por winner"
            valor={s.costoPorGanador === null ? "—" : usd(s.costoPorGanador)}
            detalle={s.costoPorGanador === null ? "sin winners" : <>gasto total ÷ winners {sa?.costoPorGanador != null && <Delta valor={s.costoPorGanador - sa.costoPorGanador} sufijo="" prefijo="$" inverso decimales={2} />}</>}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 min-[960px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="t-grafica" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="t-grafica" titulo={TITULO_GRAFICA[granularidad]}>
            <span className="text-xs text-muted-foreground">pulsa una barra para ver ese periodo</span>
          </CabeceraTarjeta>
          <div className="p-3.5">
            <div className="relative flex h-[170px] items-end gap-1 px-0.5 pt-1.5">
              <span aria-hidden="true" className="absolute inset-x-0 top-1/4 border-t border-dashed border-border" />
              <span aria-hidden="true" className="absolute inset-x-0 top-[62.5%] border-t border-dashed border-border" />
              {visibles.map((p) => {
                const st = estadisticas(p.filas);
                const alto = (st.testeados / maximo) * 100;
                return (
                  <button
                    key={p.clave}
                    type="button"
                    aria-pressed={p.clave === actual.clave}
                    aria-label={`${etiquetaPeriodo(p.clave, granularidad, true)}: ${st.testeados} testeados, ${st.ganadores} winners`}
                    onClick={() => setElegida(p.clave)}
                    className={`relative z-[1] flex h-full min-w-0 flex-1 flex-col justify-end rounded p-0 aria-pressed:bg-muted aria-pressed:outline aria-pressed:outline-1 aria-pressed:outline-offset-1 aria-pressed:outline-border-control hover:bg-muted ${anilloFoco}`}
                  >
                    <span className="flex flex-col justify-end gap-px" style={{ height: `${alto}%` }}>
                      <i className="block rounded-sm bg-success" style={{ flex: st.ganadores }} />
                      <i className="block rounded-sm bg-warning" style={{ flex: st.consulta }} />
                      <i className="block rounded-sm bg-accent-hover" style={{ flex: st.fallidos }} />
                      <i className="block rounded-sm bg-border-control/40" style={{ flex: st.otros }} />
                    </span>
                  </button>
                );
              })}
            </div>
            <div aria-hidden="true" className="flex gap-1 px-0.5 pt-1 text-[11px] text-muted-foreground">
              {visibles.map((p) => (
                <span key={p.clave} className={`min-w-0 flex-1 overflow-hidden text-center whitespace-nowrap ${p.clave === actual.clave ? "font-semibold text-foreground" : ""}`}>
                  {etiquetaCorta(p.clave, granularidad)}
                </span>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-success align-[-1px]" />Winner</span>
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-warning align-[-1px]" />En consulta</span>
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-accent-hover align-[-1px]" />Fallido</span>
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-border-control/40 align-[-1px]" />Otros estados</span>
            </div>
            <p className="mt-2.5 flex flex-wrap gap-x-4.5 gap-y-1 border-t border-border pt-2.5 text-[13px]">
              <span><b className="tabular-nums">{s.testeados}</b> testeados</span>
              <span><b className="text-success tabular-nums">{s.ganadores}</b> winners</span>
              <span><b className="tabular-nums">{s.consulta}</b> en consulta</span>
              <span><b className="tabular-nums">{s.fallidos}</b> fallidos</span>
              {s.otros > 0 && <span><b className="tabular-nums">{s.otros}</b> otros</span>}
            </p>
          </div>
        </section>

        <section aria-labelledby="t-comparacion" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="t-comparacion" titulo="Winners vs fallidos">
            <span className="text-xs text-muted-foreground">promedio del periodo</span>
          </CabeceraTarjeta>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Métrica</th>
                <th className={`${th} text-right`}>Winners</th>
                <th className={`${th} text-right`}>Fallidos</th>
                <th className={`${th} text-right`}>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {metricas.map((m) => {
                const a = promedio(ganadores, m.valor);
                const b = promedio(fallidos, m.valor);
                const dif = a !== null && b !== null && b !== 0 ? ((a - b) / b) * 100 : null;
                return (
                  <tr key={m.nombre}>
                    <td className={celda}>{m.nombre}</td>
                    <td className={`${celda} text-right tabular-nums`}>{a === null ? "—" : m.formato(a)}</td>
                    <td className={`${celda} text-right tabular-nums`}>{b === null ? "—" : m.formato(b)}</td>
                    <td className={`${celda} text-right text-xs text-muted-foreground tabular-nums`}>{dif === null ? "—" : `${dif > 0 ? "+" : "−"}${Math.abs(dif).toFixed(0)} %`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[960px]:grid-cols-2">
        <section aria-labelledby="t-categorias" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="t-categorias" titulo="Por categoría">
            <span className="text-xs text-muted-foreground">% de winners</span>
          </CabeceraTarjeta>
          <ul className="m-0 flex list-none flex-col p-1.5 pb-2.5">
            {categorias.map((c) => (
              <li key={c.categoria} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 px-1.5 py-[7px]">
                <span className="flex min-w-0 justify-between gap-2 text-[13px]">
                  <span className="truncate">{c.categoria}</span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{c.ganadores} de {c.testeados}</span>
                </span>
                <span className="min-w-12 text-right text-[13px] font-semibold tabular-nums">{c.ganadores ? porcentaje((c.ganadores / c.testeados) * 100, 0) : "0 %"}</span>
                <span role="img" aria-label={`${c.categoria}: ${c.ganadores} winners de ${c.testeados}`} className="col-span-full flex h-1.5 overflow-hidden rounded-[3px] bg-accent-hover">
                  <i className="block h-full bg-success" style={{ width: `${(c.ganadores / c.testeados) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="t-winners" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="t-winners" titulo="Winners del periodo">
            <span className="text-xs text-muted-foreground">{ganadores.length} de {s.testeados}</span>
          </CabeceraTarjeta>
          <div className="max-h-[25rem] overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Producto</th>
                  <th className={`${th} text-right`}>Gasto</th>
                  <th className={`${th} text-right`}>Compras</th>
                  <th className={`${th} text-right`}>CPA</th>
                </tr>
              </thead>
              <tbody>
                {ganadoresOrdenados.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3.5 py-5 text-center text-xs text-muted-foreground">Ningún producto ganó en este periodo.</td>
                  </tr>
                ) : (
                  ganadoresOrdenados.map((f) => (
                    <tr key={f.id}>
                      <td className={celda}>
                        <span className="block max-w-[20rem] truncate" title={f.nombre}>{f.nombre}</span>
                        <span className="block text-xs text-muted-foreground">{limpiarCategoria(f.categoria)}</span>
                      </td>
                      <td className={`${celda} text-right tabular-nums`}>{f.metricaGasto === null ? "—" : usd(f.metricaGasto)}</td>
                      <td className={`${celda} text-right tabular-nums`}>{f.metricaCompras ?? "—"}</td>
                      <td className={`${celda} text-right font-semibold tabular-nums`}>{f.metricaCpa === null ? "—" : usd(f.metricaCpa)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section aria-labelledby="t-revisar" className="min-w-0 rounded-[10px] border border-border bg-card">
        <CabeceraTarjeta id="t-revisar" titulo="Para revisar">
          <span className="text-xs text-muted-foreground">fallidos a menos de $1 del objetivo o en consulta: candidatos a un segundo test</span>
        </CabeceraTarjeta>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead>
              <tr>
                <th className={th}>Producto</th>
                <th className={th}>Estado</th>
                <th className={`${th} text-right`}>Gasto</th>
                <th className={`${th} text-right`}>Compras</th>
                <th className={`${th} text-right`}>CPA</th>
                <th className={`${th} text-right`}>Sobre el objetivo</th>
              </tr>
            </thead>
            <tbody>
              {revisar.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-5 text-center text-xs text-muted-foreground">Nada cerca del objetivo en este periodo.</td>
                </tr>
              ) : (
                revisar.map((f) => (
                  <tr key={f.id}>
                    <td className={celda}><span className="block max-w-[24rem] truncate" title={f.nombre}>{f.nombre}</span></td>
                    <td className={celda}><Pastilla tono={resultadoDe(f.estado) === "consulta" ? "aviso" : "neutro"}>{etiquetaEstado(f.estado)}</Pastilla></td>
                    <td className={`${celda} text-right tabular-nums`}>{f.metricaGasto === null ? "—" : usd(f.metricaGasto)}</td>
                    <td className={`${celda} text-right tabular-nums`}>{f.metricaCompras ?? "—"}</td>
                    <td className={`${celda} text-right font-semibold tabular-nums`}>{f.metricaCpa === null ? "—" : usd(f.metricaCpa)}</td>
                    <td className={`${celda} text-right text-xs text-muted-foreground tabular-nums`}>{f.metricaCpa === null ? "—" : `+${usd(Math.max(0, f.metricaCpa - CPA_OBJETIVO))}`}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {sinFecha > 0 && (
        <p className="text-xs text-muted-foreground">
          {sinFecha} {sinFecha === 1 ? "producto no tiene" : "productos no tienen"} «Fecha Test» y no cuentan en el informe.
        </p>
      )}
    </div>
  );
}
