/* eslint-disable @next/next/no-img-element -- miniaturas de los videos, directo de Meta */
import { cpa, confiable, ctr, hookRate, holdRate, nivelDeCpa, nivelDeCtr, nivelDeHook, dolares } from "@/lib/meta-ads/metricas";
import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { MarcoMeta } from "../marco-meta";
import { AVISO_POCA_DATA, entero, Nivel, porcentaje, Resultado, valorCpa } from "../piezas";

export const metadata = { title: "Videos · Anuncios Meta" };

export const dynamic = "force-dynamic";

const urlSegura = (u: string | null) => (u && /^https:\/\//i.test(u) ? u : null);

/** Anuncios Meta › Videos: cada video una sola vez (aunque esté en varios anuncios), con el hook, cuántos pasan los 3 y los 15 segundos y lo que cuesta cada compra. Los últimos 30 días. */
export default async function VideosMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  const videos = [...datos.videos].sort((a, b) => Number(confiable(b.r)) - Number(confiable(a.r)) || (cpa(a.r) ?? 999) - (cpa(b.r) ?? 999) || b.r.gasto - a.r.gasto);
  const hayPocaData = videos.some((v) => !confiable(v.r));
  return (
    <MarcoMeta titulo="Videos" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais}>
      {videos.length === 0 ? (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">Todavía no hay videos con gasto en los últimos 30 días.</p>
      ) : (
        <>
          <p className="-mb-2 text-xs text-muted-foreground">Últimos 30 días, de mejor a peor CPA. Un video repetido en varios anuncios cuenta una sola vez.</p>
          <ul role="list" className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4 p-0">
            {videos.map((v) => {
              const mini = urlSegura(v.miniatura);
              const ok = confiable(v.r);
              return (
                <li key={v.id} className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card ${ok ? "" : "opacity-80"}`}>
                  <div className="flex gap-3 p-3">
                    {mini ? <img src={mini} alt="" loading="lazy" className="h-24 w-24 shrink-0 rounded-md bg-muted object-cover" /> : <span aria-hidden="true" className="h-24 w-24 shrink-0 rounded-md bg-muted" />}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="m-0 line-clamp-2 text-sm font-medium">{v.nombre}</p>
                      <p className="m-0 truncate text-xs text-muted-foreground">
                        {v.producto ?? "Sin producto"}
                        {v.angulo ? ` · ${v.angulo}` : ""}
                      </p>
                      <p className="m-0 text-xs text-muted-foreground">
                        En {v.anuncios} {v.anuncios === 1 ? "anuncio" : "anuncios"} de {v.campanas} {v.campanas === 1 ? "campaña" : "campañas"}
                      </p>
                      {!ok && <p className="m-0 text-xs text-muted-foreground">poca data</p>}
                    </div>
                  </div>
                  <dl className="m-0 grid grid-cols-3 gap-x-2 gap-y-2 border-t border-border px-3 py-2.5 text-xs">
                    <Dato t="Gasto">{dolares(v.r.gasto)}</Dato>
                    <Dato t="Compras">{entero(v.r.compras)}</Dato>
                    <Dato t="CPA">{ok && v.r.compras > 0 ? <Nivel nivel={nivelDeCpa(cpa(v.r), v.tope)}>{valorCpa(v.r)}</Nivel> : valorCpa(v.r)}</Dato>
                    <Dato t="Hook (3 s)">{hookRate(v.r) === null ? "—" : ok ? <Nivel nivel={nivelDeHook(hookRate(v.r))}>{porcentaje(hookRate(v.r), 0)}</Nivel> : porcentaje(hookRate(v.r), 0)}</Dato>
                    <Dato t="Pasan 15 s">{porcentaje(holdRate(v.r), 0)}</Dato>
                    <Dato t="CTR">{ok ? <Nivel nivel={nivelDeCtr(ctr(v.r))}>{porcentaje(ctr(v.r))}</Nivel> : porcentaje(ctr(v.r))}</Dato>
                  </dl>
                  <p className="m-0 flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    <span>Resultado estimado</span>
                    <Resultado r={v.r} tope={v.tope} />
                  </p>
                </li>
              );
            })}
          </ul>
          {hayPocaData && <p className="m-0 text-xs text-muted-foreground">{AVISO_POCA_DATA}</p>}
        </>
      )}
    </MarcoMeta>
  );
}

function Dato({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground">{t}</dt>
      <dd className="m-0 font-medium tabular-nums">{children}</dd>
    </div>
  );
}
