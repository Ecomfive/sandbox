import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { formatearMoneda } from "@/lib/formato";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FiltroFechas } from "@/components/filtro-fechas";
import { OrdenSelect } from "./orden-select";
import { TablaPedidos, type FilaPedido } from "./tabla-pedidos";
import { resolverPeriodo } from "@/lib/dashboard/periodo";
import Link from "next/link";
import { linkClass } from "@/components/ui/link";
import { AyudaContextual } from "@/components/ui/ayuda-contextual";

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

  // Filtros que ponen las tarjetas del resumen (van en la dirección, para que la tabla traiga todas las de ese
  // estado y no solo las que caben en las primeras 500): un estado, o «liquidado sin marcar entregado».
  const filtroEstado = typeof sp.estado === "string" && sp.estado !== "" ? sp.estado : null;
  const soloAlertas = sp.alertas === "1";

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: plataformaDropi } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  const plataformaId = plataformaDropi?.id ?? "";

  /** Las órdenes de la tabla (hasta 500): las del período, más el filtro de estado o solo las referencias dadas. */
  const consultarOrdenes = (referencias?: string[]) => {
    let consulta = supabase
      .from("ordenes")
      .select("referencia_externa, cantidad, monto, estado, fecha, fecha_hora, productos(sku, nombre)")
      .eq("pais_id", pais.id)
      .eq("plataforma_id", plataformaId)
      .gte("fecha", desde)
      .lte("fecha", hasta);
    if (filtroEstado) consulta = consulta.eq("estado", filtroEstado);
    if (referencias) consulta = consulta.in("referencia_externa", referencias);
    return consulta
      .order(orden.columna, { ascending: orden.ascending })
      .order("referencia_externa", { ascending: orden.ascending })
      .limit(500);
  };

  const [resumen, ordenesGenerales, carteraGanancia] = await Promise.all([
    traerTodasLasFilas<{ monto: number; estado: string; referencia_externa: string }>((rDesde, rHasta) =>
      supabase
        .from("ordenes")
        .select("monto, estado, referencia_externa")
        .eq("pais_id", pais.id)
        .eq("plataforma_id", plataformaId)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(rDesde, rHasta)
    ),
    soloAlertas ? Promise.resolve({ data: null }) : consultarOrdenes(),
    traerTodasLasFilas<{ orden_referencia_externa: string | null }>((rDesde, rHasta) =>
      supabase
        .from("historial_cartera")
        .select("orden_referencia_externa")
        .eq("pais_id", pais.id)
        .eq("plataforma_id", plataformaId)
        .ilike("descripcion", "%GANANCIA%")
        .range(rDesde, rHasta)
    ),
  ]);

  const totalOrdenes = resumen.length;
  const totalMonto = resumen.reduce((acc, o) => acc + Number(o.monto), 0);

  const referenciasLiquidadas = new Set(
    (carteraGanancia ?? []).map((c) => c.orden_referencia_externa).filter((r): r is string => r !== null)
  );
  const esAlerta = (referencia: string, estado: string) =>
    referenciasLiquidadas.has(referencia) && !estado.toUpperCase().includes("ENTREGAD");
  const alertas = resumen.filter((o) => esAlerta(o.referencia_externa, o.estado));
  const totalAlertas = alertas.length;

  // Con el filtro de alertas, las órdenes de la tabla son las de esas referencias (no se sabían antes de mirar la cartera).
  let ordenes = ordenesGenerales.data;
  if (soloAlertas) {
    const referencias = alertas.map((o) => o.referencia_externa).slice(0, 300);
    ordenes = referencias.length > 0 ? (await consultarOrdenes(referencias)).data : [];
  }
  const todas = ordenes ?? [];
  // Cuántas órdenes tiene el filtro puesto (la tabla trae como máximo 500 de ellas).
  const totalFiltrado = soloAlertas
    ? totalAlertas
    : filtroEstado
      ? resumen.filter((o) => o.estado === filtroEstado).length
      : totalOrdenes;

  const filasPedido: FilaPedido[] = todas.map((o) => ({
    referencia: o.referencia_externa,
    fecha: o.fecha,
    fechaHora: o.fecha_hora,
    producto: (o.productos as unknown as { sku: string; nombre: string } | null)?.nombre ?? null,
    cantidad: o.cantidad,
    monto: Number(o.monto),
    estado: o.estado,
    alerta: esAlerta(o.referencia_externa, o.estado),
  }));

  const porEstado = new Map<string, number>();
  for (const o of resumen) porEstado.set(o.estado, (porEstado.get(o.estado) ?? 0) + 1);
  const estadosOrdenados = Array.from(porEstado.entries()).sort((a, b) => b[1] - a[1]);

  // Las tarjetas del resumen son enlaces a esta misma página con el filtro puesto; conservan el período y el orden.
  const hrefConFiltro = (filtro: Record<string, string> = {}) => {
    const parametros = new URLSearchParams();
    for (const clave of ["preset", "desde", "hasta", "orden"]) {
      const valor = sp[clave];
      if (typeof valor === "string") parametros.set(clave, valor);
    }
    for (const [clave, valor] of Object.entries(filtro)) parametros.set(clave, valor);
    const texto = parametros.toString();
    return texto ? `/pedidos-dropi?${texto}` : "/pedidos-dropi";
  };
  const hayFiltro = soloAlertas || filtroEstado !== null;
  const nombreFiltro = soloAlertas ? "liquidado sin marcar entregado" : filtroEstado;

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
                  Tabla filtrada por «{nombreFiltro}»
                  <Link href={hrefConFiltro()} scroll={false} className={linkClass}>
                    Quitar filtro
                  </Link>
                </span>
              )
            }
          >
            <KpiGrid>
              <KpiCard
                titulo="Órdenes en el rango"
                valor={totalOrdenes}
                href={hrefConFiltro()}
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
                href={totalAlertas > 0 ? hrefConFiltro({ alertas: "1" }) : undefined}
                activa={soloAlertas}
                ayudaLectores="Filtrar la tabla por estas alertas"
              />
              {estadosOrdenados.map(([estado, cantidad]) => (
                <KpiCard
                  key={estado}
                  titulo={estado}
                  valor={cantidad}
                  href={hrefConFiltro({ estado })}
                  activa={filtroEstado === estado}
                  ayudaLectores={`Filtrar la tabla por ${estado}`}
                />
              ))}
            </KpiGrid>
          </KpiGroup>

          {todas.length < totalFiltrado && (
            <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
              <strong className="font-semibold">
                Mostrando {todas.length} de {totalFiltrado.toLocaleString("es")} órdenes
              </strong>{" "}
              en la tabla (el resumen de arriba sí las cuenta a todas). Achica el rango de fechas
              {hayFiltro ? "" : " o pulsa un estado del resumen"} para verlas todas, o usa «Descargar» en la tabla y
              elige «{filtroEstado ? "Todas las de este estado" : "Todo el período"}».
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
                    href: `/api/exportar-pedidos-dropi?desde=${desde}&hasta=${hasta}${
                      filtroEstado ? `&estado=${encodeURIComponent(filtroEstado)}` : ""
                    }`,
                    etiqueta: filtroEstado ? "Todas las de este estado" : "Todo el período",
                    detalle: `${totalFiltrado.toLocaleString("es")} órdenes`,
                  }
            }
          />
        </>
      )}
    </Pagina>
  );
}
