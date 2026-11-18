import { formatearFechaHora } from "@/lib/formato";
import { dolares } from "@/lib/meta-ads/metricas";
import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { MarcoMeta } from "../marco-meta";

export const metadata = { title: "Equipo · Anuncios Meta" };

export const dynamic = "force-dynamic";

/**
 * Anuncios Meta › Equipo: quién montó cuántas campañas (por día, en el periodo), qué parte son de testing, cuántos tests terminaron ganando (últimos 30 días), cuánto gastó sin compras y
 * qué cambios hizo en Meta. Sale del registro de actividad de Meta; si el acceso no lo trae, esta pestaña queda vacía y lo dice.
 */
export default async function EquipoMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  const maxTira = Math.max(1, ...datos.equipo.flatMap((p) => p.tira));
  return (
    <MarcoMeta titulo="Equipo" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais}>
      {datos.equipo.length === 0 ? (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          Meta todavía no dijo quién montó las campañas. Pulsa «Leer ahora»; si sigue vacío, el acceso a Meta no trae el registro de actividad de la cuenta (ver «Cuentas»).
        </p>
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="tabla-datos w-full min-w-[56rem] border-collapse text-sm">
              <caption className="sr-only">Lo que hizo cada persona en las cuentas de Meta</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Persona</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Campañas hoy</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Campañas en el periodo</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">% testing</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Anuncios nuevos</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Tests que ganaron</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Gastó sin compras</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Otros cambios</th>
                  <th scope="col" className="px-4 py-2 font-medium">Última actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {datos.equipo.map((p) => (
                  <tr key={p.persona}>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium">
                      <span className="block">{p.persona}</span>
                      <span aria-hidden="true" className="mt-1 flex h-6 items-end gap-px">
                        {p.tira.map((n, i) => (
                          <span key={i} className="w-1.5 rounded-sm bg-foreground/70" style={{ height: `${n === 0 ? 2 : Math.max(10, (n / maxTira) * 100)}%`, opacity: n === 0 ? 0.25 : 1 }} />
                        ))}
                      </span>
                      <span className="sr-only">
                        Campañas por día, últimos 14 días: {p.tira.join(", ")}
                      </span>
                    </th>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.hoy}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.periodo}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.pctTesting === null ? "—" : `${p.pctTesting} %`}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.anunciosNuevos}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.tests === 0 ? "—" : `${p.testsGanadores} de ${p.tests}`}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${p.gastoSinCompras > 100 ? "text-destructive" : ""}`}>{p.gastoSinCompras > 0 ? dolares(p.gastoSinCompras) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.cambios}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.ultimo ? formatearFechaHora(p.ultimo) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span>«Tests que ganaron» y «Gastó sin compras» cuentan los últimos 30 días de campañas en testing.</span>
          </p>
        </div>
      )}
    </MarcoMeta>
  );
}
