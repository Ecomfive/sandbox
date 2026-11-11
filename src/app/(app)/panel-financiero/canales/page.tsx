import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { Pagina } from "@/components/ui/pagina";
import { dineroKpi, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarConsolidado } from "@/lib/finanzas/cargar-consolidado";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Tiendas y proveeduría" };
export const dynamic = "force-dynamic";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("es-PA", { maximumFractionDigits: 1 })} %`);

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="flex min-h-28 flex-col justify-between rounded-xl border border-border bg-card p-4">
      <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
      <span className="text-2xl font-semibold tabular-nums">{valor}</span>
      {detalle ? <span className="text-xs text-muted-foreground">{detalle}</span> : null}
    </div>
  );
}

export default async function Page() {
  await requireModulo("panel-financiero");
  const permitidas = await cargarTiendasPermitidas();
  if (!veTodaLaEmpresa(permitidas)) {
    return (
      <Pagina ancho="ancha">
        <EncabezadoAF4 titulo="Tiendas y proveeduría" imprimir={false} />
        <EstadoVacioAF4 titulo="Esta vista junta toda la empresa" />
      </Pagina>
    );
  }
  const r = await cargarConsolidado(createServiceClient());
  if ("error" in r) {
    return (
      <Pagina ancho="ancha">
        <EncabezadoAF4 titulo="Tiendas y proveeduría" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer">{r.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const actual = r.meses[0];
  return (
    <Pagina ancho="ancha">
      <EncabezadoAF4 titulo="Tiendas y proveeduría" actualizado={r.actualizado} imprimir={false} />
      {r.faltan.length ? (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />
          {r.faltan.includes("tiendas") ? "Falta correr la migración 0962 (tiendas). " : ""}
          {r.faltan.includes("proveeduria") ? "Falta correr la migración 0938 (Dropi). " : ""}
        </p>
      ) : null}
      {actual ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra titulo={`Tiendas · ${nombreMes(actual.periodo)}`} valor={dineroKpi(actual.tiendas.vendido)} detalle={`${entero(actual.tiendas.entregados)} entregadas · ${pct(actual.tiendas.tasaEntrega)} de entrega`} />
          <Cifra titulo={`Proveeduría · ${nombreMes(actual.periodo)}`} valor={dineroKpi(actual.proveeduria.vendido)} detalle={`${entero(actual.proveeduria.entregados)} entregados · ${pct(actual.proveeduria.tasaEntrega)} de entrega`} />
          <Cifra titulo="Efectivo en la calle" valor={dineroKpi(r.porCobrar.efectivoEnCalle)} detalle="Cobrado por mensajeros, sin remesar" />
          <Cifra titulo="Billetera de Dropi" valor={dineroKpi(r.porCobrar.billeteraDropi)} detalle={`Por cobrar en total: ${dineroKpi(r.porCobrar.total)}`} />
        </div>
      ) : (
        <EstadoVacioAF4 titulo="Todavía no hay ventas para juntar" />
      )}
      {r.meses.length ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[44rem] text-sm tabular-nums">
            <caption className="sr-only">Lo vendido y entregado por mes, tiendas y proveeduría</caption>
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Mes</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Tiendas</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Entrega</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Proveeduría</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Entrega</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">% tiendas</th>
              </tr>
            </thead>
            <tbody>
              {r.meses.map((m) => (
                <tr key={m.periodo} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-medium">{nombreMes(m.periodo)}</th>
                  <td className="px-3 py-2 text-right">{dineroKpi(m.tiendas.vendido)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{pct(m.tiendas.tasaEntrega)}</td>
                  <td className="px-3 py-2 text-right">{dineroKpi(m.proveeduria.vendido)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{pct(m.proveeduria.tasaEntrega)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{dineroKpi(m.vendidoTotal)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{m.pesoTiendas === null ? "—" : pct(m.pesoTiendas * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Pagina>
  );
}
