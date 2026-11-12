import Link from "next/link";
import { claseThLista, claseTdLista, MarcoTabla } from "@/components/panel/piezas-panel";
import { AvisoConexion, BarraTienda, FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { formatearMoneda } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarTiendas, cargarVariantes, inicioPeriodo, periodoElegido, sinConfirmarDesde, tiendaElegida } from "@/lib/tienda/datos";
import { after } from "next/server";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { revisarSiHaceFalta } from "@/lib/tienda/conectar-shopify";
import { vendidosDeFinanzas } from "@/lib/tienda/ordenes-finanzas";
import { NOMBRE_FUENTE_COSTO, costosDeProductos } from "@/lib/tienda/costos";
import { diaPanama, pedidosPorDia, productosVendidos, resumirPedidos, type LineaVendida } from "@/lib/tienda/resumen";
import { TableroDashboard, type Tarjeta } from "./tablero-dashboard";

export const metadata = { title: "Dashboard de tienda" };

export const dynamic = "force-dynamic";

/** «▲ 18 % frente a los 30 días anteriores» (o en puntos para un porcentaje); null sin con qué comparar. */
function frente(actual: number | null, antes: number | null, dias: number, puntos = false): string {
  if (actual === null || antes === null || (!puntos && antes === 0)) return `sin datos de los ${dias} días anteriores`;
  const d = puntos ? Math.round((actual - antes) * 10) / 10 : Math.round(((actual - antes) / antes) * 1000) / 10;
  if (d === 0) return `igual que los ${dias} días anteriores`;
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toLocaleString("es-PA")} ${puntos ? "pp" : "%"} frente a los ${dias} días anteriores`;
}

/**
 * Gestión de tienda › Dashboard (3 nov 2026): cómo van las tiendas del país en el periodo, frente al periodo anterior, como los dashboards de operación
 * y financiero de Mi Reto Digital: operación (pedidos, confirmación, entrega, cancelación, devolución), dinero contra entrega (facturado, recaudado,
 * por recaudar, devuelto, ticket), pedidos por día, avisos y lo vendido por producto nuestro.
 */
export default async function DashboardTiendaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("tienda-dashboard");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, faltaMigracion } = await cargarTiendas(supabase, pais.id);
  const tienda = tiendaElegida(tiendas, sp.tienda);
  const periodo = periodoElegido(sp.periodo);
  const miradas = tienda ? [tienda] : tiendas;
  // La revisión de Shopify (por si se perdió algún aviso), después de mostrar la página y como mucho cada 10 minutos.
  after(() => revisarSiHaceFalta(createServiceClient(), tiendas));
  const ids = miradas.map((t) => t.id);
  // Las tiendas sin conectar se ven con las órdenes de Finanzas (11 nov 2026); si todo sale de ahí, los periodos terminan en su último día.
  const [{ pedidos: todos, lineasFinanzas, fuente, referencia }, variantes] = await Promise.all([pedidosDeTiendas(supabase, miradas, pais.codigo, periodo.dias * 2), cargarVariantes(supabase, ids)]);
  const desde = inicioPeriodo(periodo.dias, referencia);
  const hoy = inicioPeriodo(1, referencia);
  const actuales = todos.filter((p) => diaPanama(p.creado) >= desde);
  const anteriores = todos.filter((p) => diaPanama(p.creado) < desde);
  const r = resumirPedidos(actuales);
  const a = resumirPedidos(anteriores);

  // Las líneas de los pedidos del periodo, para lo vendido por producto (de a 200 pedidos por consulta).
  const estadoDe = new Map(actuales.map((p) => [p.id, p.estado]));
  const lineas: LineaVendida[] = [];
  const deShopify = actuales.filter((p) => !fuente.unidadDe.has(p.tiendaId));
  for (let i = 0; i < deShopify.length; i += 200) {
    const { data } = await supabase
      .from("tienda_pedido_lineas")
      .select("pedido_id, shopify_variante_id, titulo, cantidad, precio")
      .in(
        "pedido_id",
        deShopify.slice(i, i + 200).map((p) => p.id),
      );
    for (const l of data ?? [])
      lineas.push({ pedidoId: l.pedido_id, shopifyVarianteId: l.shopify_variante_id === null ? null : Number(l.shopify_variante_id), titulo: l.titulo, cantidad: Number(l.cantidad), precio: Number(l.precio), estado: estadoDe.get(l.pedido_id) ?? "nuevo" });
  }
  const vinculos = new Map(variantes.flatMap((v) => (v.noFisico ? [[v.shopifyVarianteId, "no_fisico" as const] as const] : v.skuMaestroId ? [[v.shopifyVarianteId, v.skuMaestroId] as const] : [])));
  const pedidoFinanzas = new Map(actuales.filter((p) => fuente.unidadDe.has(p.tiendaId)).map((p) => [p.id, { estado: p.estado, total: p.total }]));
  const vendidos: (ReturnType<typeof productosVendidos>[number] & { titulo?: string })[] = [
    ...productosVendidos(lineas, new Map(vinculos)),
    ...vendidosDeFinanzas(lineasFinanzas, pedidoFinanzas),
  ].sort((x, y) => y.ingreso - x.ingreso);
  const skuIds = vendidos.map((v) => v.skuId).filter((x): x is string => !!x);
  const [{ data: skus }, costos] = await Promise.all([
    skuIds.length ? supabase.from("skus_maestros").select("id, codigo, nombre").in("id", skuIds) : Promise.resolve({ data: [] as { id: string; codigo: string; nombre: string }[] }),
    // El costo de cada producto en el país (Dropi del país o la última compra), para el margen (12 nov 2026).
    costosDeProductos(supabase, skuIds, pais.id),
  ]);
  const skuDe = new Map((skus ?? []).map((s) => [s.id as string, s as { codigo: string; nombre: string }]));

  const dias = pedidosPorDia(actuales, desde, hoy);
  const max = Math.max(1, ...dias.map((d) => d.pedidos));
  const dinero = (n: number | null) => (n === null ? "—" : formatearMoneda(n, pais.codigo));
  const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PA")} %`);
  const sinVincular = variantes.filter((v) => !v.skuMaestroId && !v.noFisico && v.enShopify).length;
  // Con una foto de Finanzas, «hace más de un día» se cuenta desde el cierre de su último día, no desde hoy.
  const soloFinanzas = miradas.every((t) => fuente.unidadDe.has(t.id) && t.estado !== "conectada");
  const viejosSinConfirmar = sinConfirmarDesde(actuales, 24, soloFinanzas ? referencia.getTime() + 7 * 3_600_000 : Date.now());
  const conectadas = miradas.filter((t) => t.estado === "conectada").length;

  const operacion: Tarjeta[] = [
    { titulo: "Pedidos", valor: r.pedidos.toLocaleString("es-PA"), detalle: frente(r.pedidos, a.pedidos, periodo.dias), icono: "pedido", color: "violeta" },
    { titulo: "Confirmación", valor: pct(r.confirmacion), detalle: frente(r.confirmacion, a.confirmacion, periodo.dias, true), icono: "check", color: "azul" },
    { titulo: "Entrega", valor: pct(r.entrega), detalle: "de lo que salió", icono: "envio", color: "verde" },
    { titulo: "Cancelación", valor: pct(r.cancelacion), detalle: frente(r.cancelacion, a.cancelacion, periodo.dias, true), icono: "cerrar", color: "rojo" },
    { titulo: "Devolución", valor: pct(r.devolucion), detalle: frente(r.devolucion, a.devolucion, periodo.dias, true), icono: "deshacer", color: "rojo" },
    { titulo: "Unid. por pedido", valor: r.unidadesPorPedido === null ? "—" : r.unidadesPorPedido.toLocaleString("es-PA"), detalle: "unidades de cada pedido", icono: "inventario", color: "violeta" },
  ];
  const plata: Tarjeta[] = [
    { titulo: "Facturado", valor: dinero(r.facturado), detalle: frente(r.facturado, a.facturado, periodo.dias), icono: "ventas", color: "violeta" },
    { titulo: "Recaudado", valor: dinero(r.recaudado), detalle: "entregado y cobrado", icono: "wallet", color: "verde" },
    { titulo: "Por recaudar", valor: dinero(r.porRecaudar), detalle: "en camino, contra entrega", icono: "envio", color: "ambar" },
    { titulo: "Devuelto", valor: dinero(r.devueltoMonto), detalle: "no se cobró", icono: "deshacer", color: "rojo" },
    { titulo: "Ticket promedio", valor: dinero(r.ticketPromedio), detalle: "por pedido no cancelado", icono: "pedido", color: "azul" },
  ];
  const avisos: Tarjeta[] = [
    { titulo: "SKU sin vincular", valor: String(sinVincular), detalle: "variantes de Shopify sin producto nuestro", icono: "alerta", color: "ambar", punto: sinVincular ? "aviso" : undefined, href: "/tienda-productos" },
    { titulo: "Sin confirmar +24 h", valor: String(viejosSinConfirmar), detalle: "pedidos que esperan desde ayer", icono: "alerta", color: "rojo", punto: viejosSinConfirmar ? "peligro" : undefined, href: "/tienda-pedidos" },
    { titulo: "Tiendas conectadas", valor: `${conectadas} de ${miradas.length}`, detalle: "solo lectura", icono: "check", color: "verde", href: "/tienda-tiendas" },
  ];

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Dashboard de tienda" oculto>
        Cómo van las tiendas de {pais.nombre} en el periodo, frente al periodo anterior.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <FaltaMigracionTienda />
      ) : !tiendas.length ? (
        <SinTiendas pais={pais.nombre} />
      ) : (
        <>
          <BarraTienda ruta="/tienda-dashboard" tiendas={tiendas} tiendaId={tienda?.id ?? null} periodo={periodo.id} />
          <AvisoConexion tiendas={miradas} finanzas={fuente} />
          <TableroDashboard etiqueta="Operación" titulo="Operación" tarjetas={operacion} />
          <TableroDashboard etiqueta="Dinero" titulo="Dinero (contra entrega)" tarjetas={plata} />
          <TableroDashboard etiqueta="Avisos" titulo="Avisos" tarjetas={avisos} />

          <section aria-labelledby="t-dia" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <h2 id="t-dia" className="m-0 text-[15px] font-semibold">
              Pedidos por día
            </h2>
            {!r.pedidos ? (
              <EstadoVacio mensaje="Sin pedidos en el periodo." />
            ) : (
              <>
                <div role="img" aria-label={`Pedidos por día, ${periodo.etiqueta.toLowerCase()}: entre ${Math.min(...dias.map((d) => d.pedidos))} y ${max} por día`} className="flex h-48 items-end gap-1 border-b border-border">
                  {dias.map((d) => (
                    <div key={d.dia} title={`${d.dia}: ${d.pedidos}`} className="min-w-0 flex-1 rounded-t bg-primario" style={{ height: `${Math.max(2, Math.round((d.pedidos / max) * 100))}%` }} />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{dias[0]?.dia}</span>
                  <span>{dias.at(-1)?.dia}</span>
                </div>
              </>
            )}
          </section>

          <section aria-labelledby="t-vend" className="flex flex-col gap-3">
            <h2 id="t-vend" className="m-0 text-[15px] font-semibold">
              Productos vendidos
            </h2>
            {!vendidos.length ? (
              <div className="rounded-[10px] border border-border bg-card">
                <EstadoVacio mensaje="Lo vendido por producto aparece aquí con los pedidos de la tienda." />
              </div>
            ) : (
              <MarcoTabla ariaLabel="Productos vendidos">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th scope="col" className={claseThLista}>Producto nuestro</th>
                      <th scope="col" className={claseThLista}>SKU</th>
                      <th scope="col" className={`${claseThLista} text-right`}>Unidades</th>
                      <th scope="col" className={`${claseThLista} text-right`}>Pedidos</th>
                      <th scope="col" className={`${claseThLista} text-right`}>Ingreso</th>
                      <th scope="col" className={`${claseThLista} text-right`}>% del total</th>
                      <th scope="col" className={`${claseThLista} text-right`}>Costo</th>
                      <th scope="col" className={`${claseThLista} text-right`}>Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendidos.map((v) => {
                      const s = v.skuId ? skuDe.get(v.skuId) : undefined;
                      return (
                        <tr key={v.skuId ?? `t:${v.titulo ?? "sin"}`}>
                          <td className={claseTdLista}>
                            {s ? (
                              s.nombre
                            ) : v.titulo ? (
                              <span className="flex max-w-[34rem] items-baseline gap-1.5" title={v.titulo}>
                                <span className="truncate">{v.titulo}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">· sin vincular</span>
                              </span>
                            ) : (
                              <Link href="/tienda-productos" className="text-warning underline underline-offset-2">
                                Sin vincular
                              </Link>
                            )}
                          </td>
                          <td className={`${claseTdLista} font-mono text-xs`}>{s?.codigo ?? "—"}</td>
                          <td className={`${claseTdLista} text-right tabular-nums`}>{v.unidades.toLocaleString("es-PA")}</td>
                          <td className={`${claseTdLista} text-right tabular-nums`}>{v.pedidos.toLocaleString("es-PA")}</td>
                          <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(v.ingreso)}</td>
                          <td className={`${claseTdLista} text-right tabular-nums`}>{pct(v.porcentaje)}</td>
                          {(() => {
                            const c = v.skuId ? costos.get(v.skuId) : undefined;
                            const costo = c ? c.costo * v.unidades : null;
                            return (
                              <>
                                <td className={`${claseTdLista} text-right tabular-nums`} title={c ? `${dinero(c.costo)} por unidad · ${NOMBRE_FUENTE_COSTO[c.fuente]}` : undefined}>
                                  {costo === null ? "—" : dinero(costo)}
                                </td>
                                <td className={`${claseTdLista} text-right tabular-nums`}>
                                  {costo === null ? "—" : `${dinero(v.ingreso - costo)}${v.ingreso > 0 ? ` · ${Math.round(((v.ingreso - costo) / v.ingreso) * 100)} %` : ""}`}
                                </td>
                              </>
                            );
                          })()}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </MarcoTabla>
            )}
          </section>
        </>
      )}
    </Pagina>
  );
}
