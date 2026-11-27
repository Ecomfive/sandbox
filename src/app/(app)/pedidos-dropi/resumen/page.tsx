import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { MarcoTabla } from "@/components/panel/piezas-panel";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarResumenDropi } from "@/lib/dropi/cargar-resumen";
import { mesCorto, type ColumnaVista, type FilaResumen } from "@/lib/dropi/resumen-mensual";
import { formatearMoneda } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Resumen de Dropi" };

export const dynamic = "force-dynamic";

const RUTA = "/pedidos-dropi/resumen";
const conVista = (ruta: string, anio: string, mes: string) => `${ruta}?${new URLSearchParams({ anio, mes })}`;

/**
 * Pedidos Dropi › Resumen (20 nov 2026, pedido de María José): la pestaña RESUMEN del sheet «ECOMFIVE DROPI 2026» dentro del
 * sistema: pedidos por estado, % de entrega, ganancia, comisión de la bodega B280 y la billetera de Dropi separada en lo que es
 * gasto y lo que no (migración 0340). Desde el 23 nov 2026 se elige qué ver (pedido de María José: «que los meses sean por
 * selección»): el año y, dentro, un mes con el anterior y la diferencia (lo de siempre al cerrar) o todo el año con su total.
 */
export default async function ResumenDropiPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("pedidos-dropi-resumen");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const r = await cargarResumenDropi(supabase, pais.id, { anio: sp.anio, mes: sp.mes });

  if (r && "error" in r) {
    return (
      <Pagina ancho="ancha">
        <EncabezadoPagina titulo="Resumen de Dropi" oculto />
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {r.error}
        </p>
      </Pagina>
    );
  }
  if (!r || !r.columnas.length) {
    return (
      <Pagina ancho="ancha">
        <EncabezadoPagina titulo="Resumen de Dropi" oculto />
        <EstadoVacio mensaje={`Todavía no hay pedidos de Dropi de ${pais.nombre} guardados en el sistema.`} />
      </Pagina>
    );
  }

  const { vista, enCurso, columnas, filas } = r;
  const mesParam = vista.mes ?? "todo";
  const opcionesMes = [
    { valor: "todo", etiqueta: `Todo ${vista.anio}`, href: conVista(RUTA, vista.anio, "todo") },
    ...[...vista.mesesAnio].reverse().map((m) => ({ valor: m, etiqueta: `${mesCorto(m)}${m === enCurso ? " · en curso" : ""}`, href: conVista(RUTA, vista.anio, m) })),
  ];
  const opcionesAnio = vista.anios.map((a) => ({ valor: a, etiqueta: a, href: conVista(RUTA, a, "") }));

  const formato = (f: FilaResumen, v: number, conSigno: boolean) => {
    const signo = conSigno ? (v > 0 ? "+" : v < 0 ? "−" : "") : "";
    const n = conSigno ? Math.abs(v) : v;
    if (f.formato === "dinero") return `${signo}${formatearMoneda(n, pais.codigo)}`;
    if (f.formato === "porcentaje") return `${signo}${(n * 100).toLocaleString("es-PA", { maximumFractionDigits: 1 })} ${conSigno ? "pp" : "%"}`;
    return `${signo}${n.toLocaleString("es-PA")}`;
  };
  const celda = (f: FilaResumen, v: number | null, c: ColumnaVista) => (v === null ? (f.tipo === "pendiente" && c.tipo !== "diferencia" ? "Pendiente" : "—") : formato(f, v, c.tipo === "diferencia"));
  const fondo = (c: ColumnaVista) => (c.tipo === "mes" ? "" : "bg-primario-suave/60");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-3">
      <EncabezadoPagina titulo="Resumen de Dropi" oculto>
        Lo de {pais.nombre} en Dropi, como la pestaña RESUMEN del sheet «ECOMFIVE DROPI 2026»: los pedidos por la fecha del pedido y la billetera
        por la fecha del movimiento. Elige un mes (se compara con el anterior) o todo el año. Se actualiza solo con la lectura diaria de Dropi.
      </EncabezadoPagina>
      <div className="flex flex-wrap items-center gap-2">
        <ControlSegmentado etiqueta="Elegir año" opciones={opcionesAnio} elegido={vista.anio} />
        <SelectorEnlace etiqueta="Elegir mes" opciones={opcionesMes} elegido={mesParam} />
        <span className="text-xs text-muted-foreground">
          {vista.mes === enCurso ? "El mes en curso va a medias: su ganancia crece cuando Dropi paga lo entregado." : null}
        </span>
        <a
          href={conVista(`${RUTA}/excel`, vista.anio, mesParam)}
          className="ml-auto rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
        >
          Descargar Excel
        </a>
      </div>
      <MarcoTabla ariaLabel="Resumen de Dropi">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-[1] border-b border-border bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Concepto
              </th>
              {columnas.map((c, j) => (
                <th key={j} scope="col" className={`border-b border-border px-3 py-2 text-right text-xs font-medium whitespace-nowrap text-muted-foreground ${fondo(c)}`}>
                  {c.titulo}
                  {c.nota ? <span className="block font-normal">{c.nota}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) =>
              f.tipo === "seccion" ? (
                <tr key={i} className="bg-primario-suave">
                  <th scope="rowgroup" colSpan={columnas.length + 1} className="sticky left-0 px-3 pt-3 pb-1.5 text-left text-xs font-semibold tracking-wide text-primario uppercase">
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
                    <td
                      key={j}
                      className={`border-b border-border/45 px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${fondo(columnas[j])} ${v === null || v === 0 ? "text-muted-foreground" : ""}`}
                    >
                      {celda(f, v, columnas[j])}
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
