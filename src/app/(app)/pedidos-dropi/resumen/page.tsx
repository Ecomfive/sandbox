import { MarcoTabla } from "@/components/panel/piezas-panel";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarResumenDropi } from "@/lib/dropi/cargar-resumen";
import { filasResumen, mesCorto, type FilaResumen } from "@/lib/dropi/resumen-mensual";
import { formatearMoneda } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Resumen de Dropi" };

export const dynamic = "force-dynamic";

/**
 * Pedidos Dropi › Resumen (20 nov 2026, pedido de María José): la pestaña RESUMEN del sheet «ECOMFIVE DROPI 2026» dentro del
 * sistema, para dejar ese sheet. Un mes por columna: pedidos por estado, % de entrega, ganancia, comisión de la bodega B280 y la
 * billetera de Dropi separada en lo que es gasto y lo que no. Sale de lo que ya se lee de Dropi cada día (migración 0340).
 */
export default async function ResumenDropiPage() {
  await requireModulo("pedidos-dropi-resumen");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const r = await cargarResumenDropi(supabase, pais.id);

  if ("error" in r) {
    return (
      <Pagina ancho="ancha">
        <EncabezadoPagina titulo="Resumen de Dropi" oculto />
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {r.error}
        </p>
      </Pagina>
    );
  }
  if (!r.meses.length) {
    return (
      <Pagina ancho="ancha">
        <EncabezadoPagina titulo="Resumen de Dropi" oculto />
        <EstadoVacio mensaje={`Todavía no hay pedidos ni movimientos de la billetera de Dropi de ${pais.nombre}.`} />
      </Pagina>
    );
  }

  const filas = filasResumen(r.meses);
  const valor = (f: FilaResumen, v: number | null) => {
    if (v === null) return f.tipo === "pendiente" ? "Pendiente" : "—";
    if (f.formato === "dinero") return formatearMoneda(v, pais.codigo);
    if (f.formato === "porcentaje") return `${(v * 100).toLocaleString("es-PA", { maximumFractionDigits: 1 })} %`;
    return v.toLocaleString("es-PA");
  };

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-3">
      <EncabezadoPagina titulo="Resumen de Dropi" oculto>
        Lo de {pais.nombre} en Dropi mes a mes, como la pestaña RESUMEN del sheet «ECOMFIVE DROPI 2026»: los pedidos por la fecha del pedido y la
        billetera por la fecha del movimiento. Se actualiza solo con la lectura diaria de Dropi.
      </EncabezadoPagina>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted-foreground">
          {mesCorto(r.meses[0].periodo)} a {mesCorto(r.meses.at(-1)!.periodo)} · el mes en curso va a medias y su ganancia crece cuando Dropi paga lo entregado.
        </p>
        <a
          href="/pedidos-dropi/resumen/excel"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
        >
          Descargar Excel
        </a>
      </div>
      <MarcoTabla ariaLabel="Resumen mensual de Dropi">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-[1] border-b border-border bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Concepto
              </th>
              {r.meses.map((m) => (
                <th key={m.periodo} scope="col" className="border-b border-border px-3 py-2 text-right text-xs font-medium whitespace-nowrap text-muted-foreground">
                  {mesCorto(m.periodo)}
                  {m.periodo === r.enCurso ? <span className="block font-normal">en curso</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) =>
              f.tipo === "seccion" ? (
                <tr key={i} className="bg-primario-suave">
                  <th scope="rowgroup" colSpan={r.meses.length + 1} className="sticky left-0 px-3 pt-3 pb-1.5 text-left text-xs font-semibold tracking-wide text-primario uppercase">
                    {f.etiqueta}
                    {f.nota ? <span className="ml-2 font-normal tracking-normal text-muted-foreground normal-case">{f.nota}</span> : null}
                  </th>
                </tr>
              ) : (
                <tr key={i} className={f.tipo === "total" ? "font-semibold" : ""}>
                  <th
                    scope="row"
                    title={f.nota}
                    className={`sticky left-0 z-[1] border-b border-border/45 bg-card py-1.5 pr-3 text-left font-normal whitespace-nowrap ${f.tipo === "detalle" ? "pl-6" : "pl-3"} ${f.tipo === "total" ? "font-semibold" : ""} ${f.tipo === "pendiente" ? "text-muted-foreground" : ""}`}
                  >
                    {f.etiqueta}
                    {f.nota && f.tipo === "pendiente" ? <span className="block text-xs">{f.nota}</span> : null}
                  </th>
                  {f.valores.map((v, j) => (
                    <td key={j} className={`border-b border-border/45 px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${v === null || v === 0 ? "text-muted-foreground" : ""}`}>
                      {valor(f, v)}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </MarcoTabla>
    </Pagina>
  );
}
