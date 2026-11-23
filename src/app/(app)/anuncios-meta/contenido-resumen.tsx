import Link from "next/link";
import { conSigno, confiable, CPA_TOPE_PREDETERMINADO, cpa, ctr, dolares, dolaresEnteros, hookRate, nivelDeCtr, nivelDeHook, resultado } from "@/lib/meta-ads/metricas";
import { NOMBRE_ETAPA } from "@/lib/meta-ads/nombre";
import type { CampanaVista } from "@/lib/meta-ads/vistas";
import type { DatosMeta } from "@/lib/meta-ads/datos";
import { NOMBRE_VEREDICTO, veredictoDe, type Veredicto } from "./def-campanas";
import { Anillo, BarraProgreso, ColumnasApiladas, Columnas, Leyenda, partesConColor, TarjetaMeta, Tendencia, Variacion } from "./graficas";
import { ListaSugerencias } from "./lista-sugerencias";
import { Cifra, entero, InsigniaEtapa, porcentaje, Resultado, valorCpa } from "./piezas";

const COLOR_VEREDICTO: Record<Veredicto, string> = { deja: "var(--success)", pierde: "var(--destructive)", poca_data: "var(--warning)", sin_gasto: "var(--grafica-5)" };

/** El contenido de la pestaña Resumen (separado de la página para poder armarlo con datos de ejemplo). */
export function ContenidoResumen({ datos, escribe }: { datos: DatosMeta; escribe: boolean }) {
  const t = datos.totales;
  const ant = datos.anteriores;
  const activas = datos.campanas.filter((c) => c.activa).length;
  const resultadoTotal = datos.campanas.reduce((s, c) => s + resultado(c.r, c.tope), 0);
  const conGasto = datos.campanas.filter((c) => c.r.gasto > 0);
  const confiables = conGasto.filter((c) => confiable(c.r)).sort((a, b) => resultado(b.r, b.tope) - resultado(a.r, a.tope));
  const mejores = confiables.filter((c) => resultado(c.r, c.tope) > 0).slice(0, 5);
  const peores = [...confiables].reverse().filter((c) => resultado(c.r, c.tope) < 0).slice(0, 5);
  const sinTope = [...new Set(conGasto.filter((c) => !c.topeDefinido).map((c) => c.producto ?? "sin producto"))];
  const pasos: { nombre: string; valor: number }[] = [
    { nombre: "Impresiones", valor: t.impresiones },
    { nombre: "Clics en el enlace", valor: t.clics },
    { nombre: "Vieron la landing", valor: t.vioLanding },
    { nombre: "Agregaron al carrito", valor: t.carrito },
    { nombre: "Llegaron al pago", valor: t.pago },
    { nombre: "Compraron", valor: t.compras },
  ];
  const sinEmbudo = pasos.slice(1).every((p) => p.valor === 0);
  const veredictos: Record<Veredicto, number> = { deja: 0, pierde: 0, poca_data: 0, sin_gasto: 0 };
  for (const c of datos.campanas.filter((x) => x.r.gasto > 0 || x.activa)) veredictos[veredictoDe(c)]++;
  const totalVeredictos = Object.values(veredictos).reduce((s, n) => s + n, 0);
  const etapaDia = [
    { nombre: NOMBRE_ETAPA.testing, color: "var(--azul)" },
    { nombre: NOMBRE_ETAPA.venta, color: "var(--primario)" },
    { nombre: NOMBRE_ETAPA.escala, color: "var(--success)" },
    { nombre: NOMBRE_ETAPA.retargeting, color: "var(--warning)" },
    { nombre: "Sin etapa en el nombre", color: "var(--grafica-5)" },
  ];
  const gastoPorAngulo = partesConColor(datos.gruposVideo.grupos["Ángulo"].map((g) => ({ nombre: g.nombre, valor: g.r.gasto })));
  const gastoAngulos = gastoPorAngulo.reduce((s, p) => s + p.valor, 0);
  const cpaPorPunto = datos.serie.map((p) => (p.compras > 0 ? p.gasto / p.compras : 0));
  const porSemana = datos.periodo === "180" || datos.periodo === "365";
  const rangoFechas = datos.desde === datos.hasta ? datos.hasta : `${datos.desde} → ${datos.hasta}`;
  return (
    <>
      <section aria-label="Cifras del periodo" className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
        <Hero titulo="Gasto" valor={dolaresEnteros(t.gasto)} extra={<Variacion actual={t.gasto} anterior={ant.gasto} />} apoyo={ant.gasto > 0 ? `Antes ${dolaresEnteros(ant.gasto)}` : "Sin periodo anterior para comparar"} tendencia={datos.serie.map((p) => p.gasto)} color="var(--meta-1)" etiqueta="Gasto por día" />
        <Hero titulo="Compras" valor={entero(t.compras)} extra={<Variacion actual={t.compras} anterior={ant.compras} sentido="arriba-bueno" />} apoyo={t.valor > 0 ? `Valor vendido ${dolaresEnteros(t.valor)}` : ant.compras > 0 ? `Antes ${entero(ant.compras)}` : undefined} tendencia={datos.serie.map((p) => p.compras)} color="var(--success)" etiqueta="Compras por día" />
        <Hero titulo="CPA (costo por compra)" valor={valorCpa(t)} extra={cpa(t) !== null && cpa(ant) !== null ? <Variacion actual={cpa(t) as number} anterior={cpa(ant) as number} sentido="arriba-malo" /> : undefined} apoyo={ant.compras > 0 ? `Antes ${valorCpa(ant)}` : undefined} tendencia={cpaPorPunto} color="var(--meta-3)" etiqueta="CPA por día" />
        <Hero
          titulo="Resultado estimado"
          valor={<span className={resultadoTotal >= 0 ? "text-success" : "text-destructive"}>{conSigno(resultadoTotal)}</span>}
          apoyo={`${veredictos.deja} dejan ganancia · ${veredictos.pierde} pierden`}
          extra={<span className="text-xs text-muted-foreground">Compras × CPA tope − gasto</span>}
        />
      </section>
      <section aria-label="Más cifras" className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
        <Cifra titulo="CTR del enlace" valor={porcentaje(ctr(t), 2)} nivel={nivelDeCtr(ctr(t))} />
        <Cifra titulo="Hook (3 s de video)" valor={porcentaje(hookRate(t), 0)} nivel={nivelDeHook(hookRate(t))} />
        <Cifra titulo="Campañas activas" valor={entero(activas)} apoyo={`${entero(conGasto.length)} gastaron en el periodo`} />
        <Cifra titulo="Montadas hoy" valor={entero(datos.creadasHoy)} apoyo={datos.actividadDisponible ? undefined : "Por la fecha de creación"} />
      </section>
      {sinTope.length > 0 && (
        <p className="-mt-3 text-xs text-muted-foreground">
          <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warning" />
          {sinTope.length === 1 ? "1 producto usa" : `${sinTope.length} productos usan`} el CPA tope de {dolares(CPA_TOPE_PREDETERMINADO)} por defecto ({sinTope.slice(0, 4).join(", ")}
          {sinTope.length > 4 ? "…" : ""}): defínelo en <Link href="/anuncios-meta/cuentas" className="underline underline-offset-2">Cuentas</Link> para que el resultado sea real.
        </p>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <TarjetaMeta titulo={porSemana ? "Gasto por semana" : "Gasto por día"} derecha={rangoFechas} id="gasto-dia">
          {t.gasto === 0 ? <p className="m-0 text-sm text-muted-foreground">No hubo gasto en este periodo.</p> : <Columnas datos={datos.serie.map((p) => ({ etiqueta: p.etiqueta, valor: Math.round(p.gasto) }))} formato={(n) => `$${n}`} color="var(--meta-1)" etiquetaGrafica="Gasto por día" alto={140} />}
        </TarjetaMeta>
        <TarjetaMeta titulo={porSemana ? "Compras por semana" : "Compras por día"} derecha={`${entero(t.compras)} en total`} id="compras-dia">
          {t.compras === 0 ? <p className="m-0 text-sm text-muted-foreground">Todavía no hay compras en este periodo.</p> : <Columnas datos={datos.serie.map((p) => ({ etiqueta: p.etiqueta, valor: p.compras }))} color="var(--success)" etiquetaGrafica="Compras por día" alto={140} />}
        </TarjetaMeta>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <TarjetaMeta titulo="Cómo van las campañas" derecha={`${totalVeredictos} con gasto o encendidas`} id="veredictos">
          {totalVeredictos === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Todavía no hay campañas con gasto en este periodo.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <Anillo
                etiqueta={`Campañas: ${(Object.keys(veredictos) as Veredicto[]).map((v) => `${veredictos[v]} ${NOMBRE_VEREDICTO[v].toLowerCase()}`).join(", ")}`}
                partes={(Object.keys(veredictos) as Veredicto[]).map((v) => ({ nombre: NOMBRE_VEREDICTO[v], valor: veredictos[v], color: COLOR_VEREDICTO[v] }))}
                centro={
                  <>
                    <span className="text-2xl font-semibold tabular-nums">{totalVeredictos}</span>
                    <span className="text-xs text-muted-foreground">campañas</span>
                  </>
                }
              />
              <ul role="list" className="m-0 flex min-w-[10rem] flex-1 list-none flex-col gap-2 p-0 text-sm">
                {(Object.keys(veredictos) as Veredicto[]).map((v) => (
                  <li key={v} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COLOR_VEREDICTO[v] }} />
                      {NOMBRE_VEREDICTO[v]}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {veredictos[v]} <span className="text-xs font-normal text-muted-foreground">{Math.round((veredictos[v] / totalVeredictos) * 100)} %</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TarjetaMeta>

        <TarjetaMeta titulo="Embudo del periodo" derecha="Cuántos pasan de cada paso al siguiente" id="embudo">
          {sinEmbudo ? (
            <p className="m-0 text-sm text-muted-foreground">Todavía no hay clics ni compras en este periodo.</p>
          ) : (
            <ol role="list" className="m-0 flex list-none flex-col gap-2.5 p-0">
              {pasos.map((p, i) => {
                const paso = i > 0 && pasos[i - 1].valor > 0 ? (p.valor / pasos[i - 1].valor) * 100 : null;
                return (
                  <li key={p.nombre} className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3 text-xs">
                    <span className="truncate">{p.nombre}</span>
                    <BarraProgreso valor={i === 0 ? 100 : (paso ?? 0)} maximo={100} color={i === pasos.length - 1 ? "var(--success)" : "var(--meta-1)"} alto={10} />
                    <span className="min-w-[8rem] text-right tabular-nums">
                      <span className="font-semibold">{entero(p.valor)}</span>
                      {paso !== null && <span className="ml-1.5 text-muted-foreground">{paso.toFixed(i === 1 ? 2 : 1)} %</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </TarjetaMeta>
      </div>

      <ListaSugerencias sugerencias={datos.sugerencias} decididas={datos.decididas} escribe={escribe} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <TarjetaMeta titulo="Campañas montadas por día" derecha="Últimos 14 días, todas las cuentas" id="por-dia">
          <ColumnasApiladas
            etiquetaGrafica="Campañas montadas por día"
            series={etapaDia}
            datos={datos.creadasPorDia.map((d) => ({ etiqueta: d.fecha.slice(8), valores: [d.testing, d.venta, d.escala, d.retargeting, d.otras] }))}
          />
          <div className="mt-3">
            <Leyenda partes={etapaDia} />
          </div>
        </TarjetaMeta>

        <TarjetaMeta titulo="En qué ángulos se gasta" derecha="Por el ángulo de cada video" id="gasto-angulos">
          {gastoAngulos === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">
              Todavía no hay videos con ángulo. <Link href="/anuncios-meta/videos" className="font-medium text-foreground underline underline-offset-2">Analízalos en Videos</Link>.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <Anillo
                etiqueta="Gasto por ángulo de video"
                partes={gastoPorAngulo}
                centro={
                  <>
                    <span className="text-lg font-semibold tabular-nums">{dolaresEnteros(gastoAngulos)}</span>
                    <span className="text-xs text-muted-foreground">en videos</span>
                  </>
                }
              />
              <ul role="list" className="m-0 flex min-w-[10rem] flex-1 list-none flex-col gap-1.5 p-0 text-sm">
                {gastoPorAngulo.map((p) => (
                  <li key={p.nombre} className="flex items-center justify-between gap-3">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
                      <span className="truncate">{p.nombre}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {dolaresEnteros(p.valor)} <span className="text-xs text-muted-foreground">{Math.round((p.valor / gastoAngulos) * 100)} %</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TarjetaMeta>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <ListaCampanas titulo="Las que más dejan" vacio="Ninguna campaña con más de $100 gastados deja ganancia todavía." campanas={mejores} color="var(--success)" />
        <ListaCampanas titulo="Las que más pierden" vacio="Ninguna campaña con más de $100 gastados está perdiendo." campanas={peores} color="var(--destructive)" />
      </div>
    </>
  );
}

/** Una cifra grande del periodo: el número, cómo cambió frente al periodo anterior y su tendencia. */
function Hero({ titulo, valor, extra, apoyo, tendencia, color, etiqueta }: { titulo: string; valor: React.ReactNode; extra?: React.ReactNode; apoyo?: React.ReactNode; tendencia?: number[]; color?: string; etiqueta?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5">
      <p className="m-0 text-xs font-medium text-muted-foreground">{titulo}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="m-0 text-3xl font-semibold leading-tight tabular-nums">{valor}</p>
        {tendencia && tendencia.some((n) => n > 0) && <Tendencia valores={tendencia} color={color} etiqueta={etiqueta ?? titulo} ancho={88} alto={32} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {extra}
        {apoyo && <span className="text-xs text-muted-foreground">{apoyo}</span>}
      </div>
    </div>
  );
}

function ListaCampanas({ titulo, vacio, campanas, color }: { titulo: string; vacio: string; campanas: CampanaVista[]; color: string }) {
  const maximo = Math.max(1, ...campanas.map((c) => Math.abs(resultado(c.r, c.tope))));
  return (
    <TarjetaMeta titulo={titulo}>
      {campanas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ul role="list" className="m-0 flex list-none flex-col gap-3 p-0">
          {campanas.map((c) => (
            <li key={c.id} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Link href={`/anuncios-meta/campanas?abrir=${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                  {c.nombre}
                </Link>
                <InsigniaEtapa etapa={c.etapa} />
                <Resultado r={c.r} tope={c.tope} />
              </div>
              <BarraProgreso valor={Math.abs(resultado(c.r, c.tope))} maximo={maximo} color={color} />
              <p className="m-0 text-xs text-muted-foreground tabular-nums">
                {dolares(c.r.gasto)} · {c.r.compras} compras · CPA {cpa(c.r) === null ? "—" : dolares(cpa(c.r) as number)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </TarjetaMeta>
  );
}

