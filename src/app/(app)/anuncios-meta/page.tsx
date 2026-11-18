import Link from "next/link";
import { conSigno, confiable, cpa, ctr, dolares, hookRate, nivelDeCtr, nivelDeHook, resultado, type Resultados } from "@/lib/meta-ads/metricas";
import { NOMBRE_ETAPA } from "@/lib/meta-ads/nombre";
import { cargarPaginaMeta, type ParametrosMeta } from "./datos-pagina";
import { ListaSugerencias } from "./lista-sugerencias";
import { MarcoMeta } from "./marco-meta";
import { BarraSimple, Cifra, entero, InsigniaEtapa, porcentaje, Resultado, valorCpa } from "./piezas";

export const metadata = { title: "Anuncios Meta" };

export const dynamic = "force-dynamic";

const variacion = (ahora: number, antes: number): string | null => (antes > 0 ? `${ahora >= antes ? "+" : "−"}${Math.abs(((ahora - antes) / antes) * 100).toFixed(0)} % frente al periodo anterior` : null);

/**
 * Marketing › Anuncios Meta › Resumen (18 nov 2026, pedido de Alcides; boceto aprobado https://claude.ai/artifact/WebDAX2JDydNkzNhpSk4LC): lo que se gastó y se compró en las cuentas
 * publicitarias de Meta, qué campañas se montaron por día, el embudo y lo que el sistema sugiere decidir hoy. Solo lee Meta: no crea, pausa ni cambia nada allá.
 */
export default async function AnunciosMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  const t = datos.totales;
  const ant = datos.anteriores;
  const activas = datos.campanas.filter((c) => c.activa).length;
  const resultadoTotal = datos.campanas.reduce((s, c) => s + resultado(c.r, c.tope), 0);
  const conGasto = datos.campanas.filter((c) => c.r.gasto > 0);
  const confiables = conGasto.filter((c) => confiable(c.r)).sort((a, b) => resultado(b.r, b.tope) - resultado(a.r, a.tope));
  const mejores = confiables.filter((c) => resultado(c.r, c.tope) > 0).slice(0, 5);
  const peores = [...confiables].reverse().filter((c) => resultado(c.r, c.tope) < 0).slice(0, 5);
  const sinTope = [...new Set(conGasto.filter((c) => !c.topeDefinido).map((c) => c.producto ?? "sin producto"))];
  const maxDia = Math.max(1, ...datos.creadasPorDia.map((d) => d.testing + d.escala + d.retargeting + d.otras));
  const pasos: { nombre: string; valor: number }[] = [
    { nombre: "Impresiones", valor: t.impresiones },
    { nombre: "Clics en el enlace", valor: t.clics },
    { nombre: "Vieron la landing", valor: t.vioLanding },
    { nombre: "Agregaron al carrito", valor: t.carrito },
    { nombre: "Llegaron al pago", valor: t.pago },
    { nombre: "Compraron", valor: t.compras },
  ];
  const sinEmbudo = pasos.slice(1).every((p) => p.valor === 0);
  return (
    <MarcoMeta titulo="Anuncios Meta" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais}>
      <section aria-label="Cifras del periodo" className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
        <Cifra titulo="Gasto" valor={dolares(t.gasto)} apoyo={variacion(t.gasto, ant.gasto) ?? "Sin periodo anterior para comparar"} />
        <Cifra titulo="Compras" valor={entero(t.compras)} apoyo={variacion(t.compras, ant.compras) ?? undefined} />
        <Cifra titulo="CPA (costo por compra)" valor={valorCpa(t)} apoyo={ant.compras > 0 ? `Antes: ${valorCpa(ant)}` : undefined} />
        <Cifra titulo="Resultado estimado" valor={<ResultadoLinea valor={resultadoTotal} />} apoyo="Compras × CPA tope − gasto" />
        <Cifra titulo="CTR del enlace" valor={porcentaje(ctr(t), 2)} nivel={nivelDeCtr(ctr(t))} />
        <Cifra titulo="Hook (3 s de video)" valor={porcentaje(hookRate(t), 0)} nivel={nivelDeHook(hookRate(t))} />
        <Cifra titulo="Campañas activas" valor={entero(activas)} apoyo={`${entero(conGasto.length)} gastaron en el periodo`} />
        <Cifra titulo="Montadas hoy" valor={entero(datos.creadasHoy)} apoyo={datos.actividadDisponible ? undefined : "Por la fecha de creación"} />
      </section>
      {sinTope.length > 0 && (
        <p className="-mt-3 text-xs text-muted-foreground">
          <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warning" />
          {sinTope.length === 1 ? "1 producto usa" : `${sinTope.length} productos usan`} el CPA tope de $3 por defecto ({sinTope.slice(0, 4).join(", ")}
          {sinTope.length > 4 ? "…" : ""}): defínelo en <Link href="/anuncios-meta/cuentas" className="underline underline-offset-2">Cuentas</Link> para que el resultado sea real.
        </p>
      )}

      <ListaSugerencias sugerencias={datos.sugerencias} decididas={datos.decididas} escribe={escribe} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <section aria-labelledby="por-dia" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex min-h-8 items-center justify-between border-b border-border bg-muted px-4 py-1 text-xs font-medium text-muted-foreground">
            <h2 id="por-dia" className="m-0 text-xs font-medium">
              Campañas montadas por día
            </h2>
            <span>Últimos 14 días</span>
          </div>
          <div className="p-4">
            <ul role="list" className="m-0 flex list-none flex-col gap-1.5 p-0">
              {datos.creadasPorDia.map((d) => {
                const total = d.testing + d.escala + d.retargeting + d.otras;
                return (
                  <li key={d.fecha} className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-2 text-xs">
                    <span className="tabular-nums text-muted-foreground">{d.fecha.slice(5).replace("-", "/")}</span>
                    <span aria-hidden="true" className="flex h-3 overflow-hidden rounded-sm bg-muted">
                      {d.testing > 0 && <span className="bg-azul" style={{ width: `${(d.testing / maxDia) * 100}%` }} />}
                      {d.escala > 0 && <span className="bg-success" style={{ width: `${(d.escala / maxDia) * 100}%` }} />}
                      {d.retargeting > 0 && <span className="bg-warning" style={{ width: `${(d.retargeting / maxDia) * 100}%` }} />}
                      {d.otras > 0 && <span className="bg-muted-foreground" style={{ width: `${(d.otras / maxDia) * 100}%` }} />}
                    </span>
                    <span className="text-right font-medium tabular-nums">
                      {total}
                      <span className="sr-only">
                        {" "}
                        campañas: {d.testing} testing, {d.escala} escala, {d.retargeting} retargeting, {d.otras} sin etapa
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="m-0 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <LeyendaColor clase="bg-azul" nombre={NOMBRE_ETAPA.testing} />
              <LeyendaColor clase="bg-success" nombre={NOMBRE_ETAPA.escala} />
              <LeyendaColor clase="bg-warning" nombre={NOMBRE_ETAPA.retargeting} />
              <LeyendaColor clase="bg-muted-foreground" nombre="Sin etapa en el nombre" />
            </p>
          </div>
        </section>

        <section aria-labelledby="embudo" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex min-h-8 items-center justify-between border-b border-border bg-muted px-4 py-1 text-xs font-medium text-muted-foreground">
            <h2 id="embudo" className="m-0 text-xs font-medium">
              Embudo del periodo
            </h2>
            <span>Todas las campañas</span>
          </div>
          <div className="p-4">
            {sinEmbudo ? (
              <p className="m-0 text-sm text-muted-foreground">Todavía no hay clics ni compras en este periodo.</p>
            ) : (
              <ol role="list" className="m-0 flex list-none flex-col gap-2 p-0">
                {pasos.map((p, i) => (
                  <li key={p.nombre} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-2 text-xs">
                    <span className="truncate">{p.nombre}</span>
                    <BarraSimple valor={p.valor} maximo={pasos[0].valor} clase={i === pasos.length - 1 ? "bg-success" : "bg-foreground"} />
                    <span className="text-right tabular-nums">
                      <span className="font-medium">{entero(p.valor)}</span>
                      {i > 0 && pasos[i - 1].valor > 0 && <span className="ml-1 text-muted-foreground">{((p.valor / pasos[i - 1].valor) * 100).toFixed(i === 1 ? 2 : 1)} %</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <ListaCampanas titulo="Las que más dejan" vacio="Ninguna campaña con más de $100 gastados deja ganancia todavía." campanas={mejores} />
        <ListaCampanas titulo="Las que más pierden" vacio="Ninguna campaña con más de $100 gastados está perdiendo." campanas={peores} />
      </div>
    </MarcoMeta>
  );
}

function ResultadoLinea({ valor }: { valor: number }) {
  return <span className={`font-semibold tabular-nums ${valor >= 0 ? "text-success" : "text-destructive"}`}>{conSigno(valor)}</span>;
}

function LeyendaColor({ clase, nombre }: { clase: string; nombre: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 rounded-sm ${clase}`} />
      {nombre}
    </span>
  );
}

function ListaCampanas({ titulo, vacio, campanas }: { titulo: string; vacio: string; campanas: { id: string; nombre: string; etapa: Parameters<typeof InsigniaEtapa>[0]["etapa"]; r: Resultados; tope: number }[] }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-h-8 items-center border-b border-border bg-muted px-4 py-1">
        <h2 className="m-0 text-xs font-medium text-muted-foreground">{titulo}</h2>
      </div>
      {campanas.length === 0 ? (
        <p className="m-0 px-4 py-4 text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ul role="list" className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {campanas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
              <Link href={`/anuncios-meta/campanas?abrir=${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                {c.nombre}
              </Link>
              <InsigniaEtapa etapa={c.etapa} />
              <span className="text-xs text-muted-foreground tabular-nums">
                {dolares(c.r.gasto)} · {c.r.compras} compras · CPA {cpa(c.r) === null ? "—" : dolares(cpa(c.r) as number)}
              </span>
              <Resultado r={c.r} tope={c.tope} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
