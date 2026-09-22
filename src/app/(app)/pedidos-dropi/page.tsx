import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { obtenerPlataformaDropiId } from "@/lib/plataforma-dropi";
import { requireModulo } from "@/lib/auth";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { contarFiltrado, obtenerResumenPedidos, totalesPedidos } from "@/lib/pedidos/resumen";
import { formatearMoneda } from "@/lib/formato";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FiltroFechas } from "@/components/filtro-fechas";
import { OrdenSelect } from "./orden-select";
import { TablaPedidos, type FilaPedido } from "./tabla-pedidos";
import { resolverPeriodo } from "@/lib/dashboard/periodo";
import Link from "next/link";
import { linkClass } from "@/components/ui/link";
import { AyudaContextual } from "@/components/ui/ayuda-contextual";
import { alternarEstado, descripcionFiltro, estadosDeParametro, hrefPedidos } from "@/lib/pedidos/filtro-url";

export const metadata = { title: "Pedidos Dropi" };

export const dynamic = "force-dynamic";

const OPCIONES_ORDEN = {
  fecha_desc: { columna: "fecha", ascending: false },
  fecha_asc: { columna: "fecha", ascending: true },
  monto_desc: { columna: "monto", ascending: false },
  monto_asc: { columna: "monto", ascending: true },
} as const;

export default async function PedidosDropiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModulo("pedidos-dropi");
  const sp = await searchParams;
  const { desde, hasta } = resolverPeriodo({
    preset: typeof sp.preset === "string" ? sp.preset : undefined,
    desde: typeof sp.desde === "string" ? sp.desde : undefined,
    hasta: typeof sp.hasta === "string" ? sp.hasta : undefined,
  });
  const ordenClave = typeof sp.orden === "string" && sp.orden in OPCIONES_ORDEN ? sp.orden : "fecha_desc";
  const orden = OPCIONES_ORDEN[ordenClave as keyof typeof OPCIONES_ORDEN];

  // Filtros que ponen las tarjetas del resumen (van en la dirección, para que la tabla traiga todas las de esos
  // estados y no solo las que caben en las primeras 500): uno o varios estados (uno u otro), y/o «liquidado sin
  // marcar entregado» (que se combina con los estados: deben cumplirse las dos cosas).
  const estados = estadosDeParametro(sp.estado);
  const soloAlertas = sp.alertas === "1";
  const coincideEstado = (estado: string) => estados.length === 0 || estados.includes(estado);

  const supabase = createServiceClient();
  const [pais, plataformaDropiId] = await Promise.all([getPaisActual(supabase), obtenerPlataformaDropiId(supabase)]);
  const plataformaId = plataformaDropiId ?? "";

  /** Las órdenes de la tabla (hasta 500): las del período, más el filtro de estados o solo las referencias dadas. */
  const consultarOrdenes = (referencias?: string[]) => {
    let consulta = supabase
      .from("ordenes")
      .select("referencia_externa, cantidad, monto, estado, fecha, fecha_hora, productos(sku, nombre)")
      .eq("pais_id", pais.id)
      .eq("plataforma_id", plataformaId)
      .gte("fecha", desde)
      .lte("fecha", hasta);
    if (estados.length > 0) consulta = consulta.in("estado", estados);
    if (referencias) consulta = consulta.in("referencia_externa", referencias);
    return consulta
      .order(orden.columna, { ascending: orden.ascending })
      .order("referencia_externa", { ascending: orden.ascending })
      .limit(500);
  };

  // El resumen (cuántas órdenes, cuánto suman, por estado y cuáles están en alerta) lo calcula la base: un renglón
  // por estado en vez de traer todas las órdenes del período para contarlas aquí (ver `obtenerResumenPedidos`).
  const [resumen, ordenesGenerales] = await Promise.all([
    obtenerResumenPedidos(supabase, { paisId: pais.id, plataformaId, desde, hasta }),
    soloAlertas ? Promise.resolve({ data: null }) : consultarOrdenes(),
  ]);

  const { ordenes: totalOrdenes, monto: totalMonto, alertas: totalAlertas } = totalesPedidos(resumen.grupos);
  const referenciasEnAlerta = new Set(resumen.alertas.map((a) => a.referencia));
  const esAlerta = (referencia: string) => referenciasEnAlerta.has(referencia);

  // Con el filtro de alertas, las órdenes de la tabla son las de esas referencias (no se sabían antes de mirar la cartera).
  let ordenes = ordenesGenerales.data;
  if (soloAlertas) {
    const referencias = resumen.alertas
      .filter((a) => coincideEstado(a.estado))
      .map((a) => a.referencia)
      .slice(0, 300);
    ordenes = referencias.length > 0 ? (await consultarOrdenes(referencias)).data : [];
  }
  const todas = ordenes ?? [];
  // Cuántas órdenes tiene el filtro puesto (la tabla trae como máximo 500 de ellas).
  const totalFiltrado = contarFiltrado(resumen.grupos, estados, soloAlertas);

  const filasPedido: FilaPedido[] = todas.map((o) => ({
    referencia: o.referencia_externa,
    fecha: o.fecha,
    fechaHora: o.fecha_hora,
    producto: (o.productos as unknown as { sku: string; nombre: string } | null)?.nombre ?? null,
    cantidad: o.cantidad,
    monto: Number(o.monto),
    estado: o.estado,
    alerta: esAlerta(o.referencia_externa),
  }));

  const estadosOrdenados = resumen.grupos.map((g) => [g.estado, g.cantidad] as const);

  // Las tarjetas del resumen son enlaces a esta misma página con el filtro puesto; conservan el período y el orden.
  // Cada una suma su estado a los elegidos o, si ya estaba, lo quita (pulsar otra vez una tarjeta la apaga).
  const conservar: Record<string, string> = {};
  for (const clave of ["preset", "desde", "hasta", "orden"]) {
    const valor = sp[clave];
    if (typeof valor === "string") conservar[clave] = valor;
  }
  const hrefSinFiltro = hrefPedidos(conservar, [], false);
  const hrefDeEstado = (estado: string) => hrefPedidos(conservar, alternarEstado(estados, estado), soloAlertas);
  const hrefDeAlertas = hrefPedidos(conservar, estados, !soloAlertas);
  const hayFiltro = soloAlertas || estados.length > 0;
  const nombreFiltro = descripcionFiltro(estados, soloAlertas);
  const etiquetaDescargaCompleta =
    estados.length > 1 ? "Todas las de estos estados" : estados.length === 1 ? "Todas las de este estado" : "Todo el período";

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Pedidos Dropi" oculto>
        {pais.nombre} — órdenes reales extraídas del panel de proveedor de Dropi.
      </EncabezadoPagina>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FiltroFechas />
          <OrdenSelect actual={ordenClave} />
        </div>
      </div>

      {totalOrdenes === 0 ? (
        <EstadoVacio mensaje={`No hay órdenes de Dropi para ${pais.nombre} entre ${desde} y ${hasta}.`} />
      ) : (
        <>
          <KpiGroup
            titulo="Resumen del período"
            accion={
              hayFiltro && (
                <span className="flex items-center gap-2 font-normal">
                  Tabla filtrada por {nombreFiltro}
                  <Link href={hrefSinFiltro} scroll={false} className={linkClass}>
                    {estados.length + (soloAlertas ? 1 : 0) > 1 ? "Quitar filtros" : "Quitar filtro"}
                  </Link>
                </span>
              )
            }
          >
            <KpiGrid>
              <KpiCard
                titulo="Órdenes en el rango"
                valor={totalOrdenes}
                href={hrefSinFiltro}
                activa={!hayFiltro}
                ayudaLectores="Ver todas, sin filtrar la tabla"
              />
              <KpiCard titulo="Monto total" valor={formatearMoneda(totalMonto, pais.codigo)} />
              <KpiCard
                titulo="Alertas: liquidado sin marcar entregado"
                ayuda={
                  <AyudaContextual texto="Dropi ya registró la ganancia de este pedido en la cartera, pero el pedido todavía no aparece como ENTREGADO — normalmente significa que hay que actualizar su estado a mano en Dropi." />
                }
                valor={totalAlertas}
                tono={totalAlertas > 0 ? "destructive" : "neutral"}
                href={totalAlertas > 0 || soloAlertas ? hrefDeAlertas : undefined}
                activa={soloAlertas}
                ayudaLectores={soloAlertas ? "Quitar el filtro de alertas" : "Filtrar la tabla por estas alertas"}
              />
              {estadosOrdenados.map(([estado, cantidad]) => {
                const elegido = estados.includes(estado);
                return (
                  <KpiCard
                    key={estado}
                    titulo={estado}
                    valor={cantidad}
                    href={hrefDeEstado(estado)}
                    activa={elegido}
                    ayudaLectores={
                      elegido
                        ? `Quitar ${estado} del filtro`
                        : estados.length > 0
                          ? `Sumar ${estado} al filtro`
                          : `Filtrar la tabla por ${estado}`
                    }
                  />
                );
              })}
            </KpiGrid>
          </KpiGroup>

          {todas.length < totalFiltrado && (
            <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
              <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-warning align-middle" />
              <strong className="font-semibold">
                Mostrando {todas.length} de {totalFiltrado.toLocaleString("es")} órdenes
              </strong>{" "}
              en la tabla (el resumen de arriba sí las cuenta a todas). Achica el rango de fechas
              {hayFiltro ? "" : " o pulsa un estado del resumen"} para verlas todas, o usa «Descargar» en la tabla y
              elige «{etiquetaDescargaCompleta}».
            </div>
          )}

          <TablaPedidos
            pedidos={filasPedido}
            codigoPais={pais.codigo}
            // Con el filtro de alertas no hay descarga completa: caben todas en la tabla y salen con «Lo que se ve».
            descargaCompleta={
              soloAlertas
                ? undefined
                : {
                    href: `/api/exportar-pedidos-dropi?desde=${desde}&hasta=${hasta}${estados
                      .map((e) => `&estado=${encodeURIComponent(e)}`)
                      .join("")}`,
                    etiqueta: etiquetaDescargaCompleta,
                    detalle: `${totalFiltrado.toLocaleString("es")} órdenes`,
                  }
            }
          />
        </>
      )}
    </Pagina>
  );
}
