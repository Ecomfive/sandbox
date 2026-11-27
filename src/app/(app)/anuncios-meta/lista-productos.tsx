"use client";

import { AvisoDeTope, GuiaEnLinea } from "./aviso-tope";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Ventana } from "@/components/ui/ventana";
import { AnunciosIcon, ChevronRightIcon, EstadoIcon, FiltroIcon, MargenIcon, ProductoIcon } from "@/lib/nav-icons";
import { CATALOGO_COLUMNAS, valorColumna, type ClaveColumna } from "@/lib/meta-ads/columnas";
import { confiable, cpa, dolares } from "@/lib/meta-ads/metricas";
import { ordenarPor } from "@/lib/meta-ads/orden";
import { CRITERIOS_PRODUCTOS, ORDEN_PRODUCTOS } from "@/lib/meta-ads/orden-listas";
import { angulosDeProducto } from "@/lib/meta-ads/productos";
import { filasDeCostos, type CostosOperacion, type EntregasMeta } from "@/lib/meta-ads/costos-operacion";
import { claveDeProducto } from "@/lib/meta-ads/nombre";
import type { CampanaVista, ProductoVista, VideoVista } from "@/lib/meta-ads/vistas";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CeldasColumnas, EncabezadoColumnas, estiloRejilla, SelectorColumnasMeta, useColumnasMeta } from "./columnas-meta";
import { DEF_PRODUCTOS } from "./def-productos";
import { BarraOrden, useOrdenMeta } from "./orden-meta";
import { AVISO_POCA_DATA, Cifra, InsigniaEtapa, InsigniaPrioridad, MetricasEnLinea, Nivel } from "./piezas";
import { LeyendaDeCostos } from "./calculadora-costos";
import { BarraApilada } from "./graficas";
import { nombreDeAngulo } from "@/lib/meta-ads/angulo-detalle";
import { anguloDeLaCampana } from "@/lib/meta-ads/atributos-video";

const pctEntrega = (n: number) => `${Math.round(n * 100)} %`;
/** Entrega mala: la de la tienda baja de 55 % o queda 12 puntos por debajo del promedio de todos los productos. */
const entregaMala = (t: number, promedio: number | null) => t <= 0.55 || (promedio !== null && t <= promedio - 0.12);

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = { nombre: ProductoIcon, veredicto: MargenIcon, datos: FiltroIcon, activas: EstadoIcon, gasto: MargenIcon, compras: MargenIcon, cpa: MargenIcon, campanas: AnunciosIcon, videos: AnunciosIcon };

/** Las columnas de la vista por producto cuando nadie ha elegido otras: lo que se gastó, lo que se vendió y cómo rinden los anuncios. */
const COLUMNAS_PRODUCTOS: ClaveColumna[] = ["gasto", "compras", "cpa", "roas", "ctr", "hook", "cvr", "resultado"];

const idDe = (p: ProductoVista) => p.clave || "sin-producto";

function FilaProducto({ p, columnas, alAbrir, entrega }: { p: ProductoVista; columnas: ClaveColumna[]; alAbrir: () => void; entrega: EntregasMeta | null }) {
  const ok = confiable(p.r);
  const e = entrega?.productos[p.clave] ?? null;
  return (
    <button type="button" onClick={alAbrir} style={estiloRejilla(columnas.length)} className="grid w-full cursor-pointer grid-cols-1 items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground xl:[grid-template-columns:var(--columnas-meta)]">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{p.nombre}</span>
          <InsigniaPrioridad pendiente={p.pendiente} />
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {p.campanas} {p.campanas === 1 ? "campaña" : "campañas"} ({p.activas} {p.activas === 1 ? "activa" : "activas"}) · {p.videos} {p.videos === 1 ? "video" : "videos"}
          {ok ? "" : " · poca data"}
          {e?.tasa != null && (
            <span className={entregaMala(e.tasa, entrega?.promedio ?? null) ? "font-medium text-destructive" : ""}> · Entrega {pctEntrega(e.tasa)}{entregaMala(e.tasa, entrega?.promedio ?? null) ? " (baja)" : ""}</span>
          )}
        </span>
        {p.guiaTope && <GuiaEnLinea guia={p.guiaTope} className="mt-0.5" />}
      </span>
      <CeldasColumnas columnas={columnas} r={p.r} ctx={{ tope: p.tope, etapa: "venta", confiable: ok }} />
      <ChevronRightIcon aria-hidden="true" className="hidden h-4 w-4 text-muted-foreground xl:block" />
    </button>
  );
}

/** La ficha de un producto: lo que sumó en el periodo con todas sus cifras, los ángulos que usa, sus campañas y sus videos. */
function FichaProducto({ p, campanas, videos, alCerrar, entrega, costos }: { p: ProductoVista | undefined; campanas: CampanaVista[]; videos: VideoVista[]; alCerrar: () => void; entrega: EntregasMeta | null; costos: CostosOperacion }) {
  const e = p ? (entrega?.productos[p.clave] ?? null) : null;
  const venta = p && entrega ? (filasDeCostos([{ clave: p.clave, nombre: p.nombre, gasto: p.r.gasto, compras: p.r.compras }], entrega.productos, entrega.tienda, costos, entrega.economia)[0] ?? null) : null;
  const cpaMeta = p ? cpa(p.r) : null;
  const entregadas = p && e?.tasa != null ? p.r.compras * e.tasa : null;
  const delProducto = useMemo(() => (p ? campanas.filter((c) => claveDeProducto(c.producto) === p.clave).sort((a, b) => b.r.gasto - a.r.gasto) : []), [p, campanas]);
  const angulos = useMemo(() => (p ? angulosDeProducto(videos, p.clave) : []), [p, videos]);
  const susVideos = useMemo(() => (p ? videos.filter((v) => claveDeProducto(v.producto) === p.clave).sort((a, b) => b.r.gasto - a.r.gasto).slice(0, 8) : []), [p, videos]);
  return (
    <Ventana abierto={!!p} alCerrar={alCerrar} lado="derecha" ancho="lg" titulo={p && <span className="min-w-0 break-words text-lg font-semibold">{p.nombre}</span>}>
      {p && (
        <div className="flex flex-col divide-y divide-border px-5 py-5">
          <Seccion icono={MargenIcon} titulo="Cómo le va en el periodo">
            <p className="m-0 text-sm text-muted-foreground">
              Con un CPA tope de {dolares(p.tope)}
              {p.topeDefinido || p.topeAjustado ? "" : " (el general; se puede cambiar en Cuentas)"}.
            </p>
            {p.guiaTope && <AvisoDeTope guia={p.guiaTope} />}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {CATALOGO_COLUMNAS.filter((c) => c.clave !== "frecuencia").map((c) => {
                const v = valorColumna(c.clave, p.r, { tope: p.tope, etapa: "venta", confiable: confiable(p.r) });
                return <Cifra key={c.clave} titulo={c.titulo} valor={v.texto} nivel={v.nivel} />;
              })}
            </div>
            {!confiable(p.r) && <p className="m-0 text-xs text-muted-foreground">{AVISO_POCA_DATA}</p>}
          </Seccion>

          {e && (
            <Seccion icono={EstadoIcon} titulo="Entrega en la tienda">
              {e.tasa === null ? (
                <p className="m-0 text-sm text-muted-foreground">Todavía hay pocos pedidos resueltos de este producto ({e.cerradas}) para tener una tasa de entrega.</p>
              ) : (
                <>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
                    <Cifra titulo="Tasa de entrega" valor={pctEntrega(e.tasa)} apoyo={`${e.entregadas} entregados · ${e.devueltas} devueltos`} nivel={entregaMala(e.tasa, entrega?.promedio ?? null) ? "malo" : "bueno"} />
                    {!venta?.costo && (
                      <>
                        <Cifra titulo="Compras entregadas (est.)" valor={entregadas === null ? "—" : Math.round(entregadas).toLocaleString("es-PA")} apoyo="compras × tasa" />
                        <Cifra titulo="CPA por entrega" valor={entregadas && entregadas > 0 ? dolares(p!.r.gasto / entregadas) : "—"} apoyo={cpaMeta !== null ? `CPA de Meta ${dolares(cpaMeta)}` : undefined} nivel={entregadas && entregadas > 0 && p!.r.gasto / entregadas > p!.tope ? "malo" : undefined} />
                      </>
                    )}
                  </div>
                  <p className="m-0 text-xs text-muted-foreground">
                    Con los pedidos de los últimos 180 días.{entrega?.promedio != null ? ` El promedio de todos los productos es ${pctEntrega(entrega.promedio)}.` : ""} Un producto puede vender bien en Meta y entregar mal: cada compra que no llega se paga igual.
                  </p>
                </>
              )}
            </Seccion>
          )}

          {venta?.costo && (
            <Seccion icono={MargenIcon} titulo="Costo de cada venta entregada">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
                <Cifra titulo="Por venta entregada" valor={dolares(venta.costo.total)} apoyo="sin el producto ni el IVA" />
                <Cifra titulo="CPA real" valor={dolares(venta.costo.cpaReal)} apoyo={venta.cpa !== null ? `CPA de Meta ${dolares(venta.cpa)}` : undefined} />
                <Cifra titulo="Envíos" valor={dolares(venta.costo.envios)} apoyo={`envía ${pctEntrega(venta.envio!)}${venta.envioDeLaTienda ? " *" : ""} · entrega ${pctEntrega(venta.entrega!)}${venta.entregaDeLaTienda ? " *" : ""}`} />
                <Cifra titulo="Operativo" valor={dolares(venta.costo.operativo)} />
              </div>
              <BarraApilada
                alto={14}
                conPorcentaje
                etiqueta={`De qué está hecho: anuncios ${dolares(venta.costo.cpaReal)}, envíos ${dolares(venta.costo.envios)}, operativo ${dolares(venta.costo.operativo)}`}
                partes={[
                  { nombre: "Anuncios (CPA real)", valor: venta.costo.cpaReal, color: "var(--meta-1)" },
                  { nombre: "Envíos", valor: venta.costo.envios, color: "var(--meta-2)" },
                  { nombre: "Operativo", valor: venta.costo.operativo, color: "var(--meta-3)" },
                ]}
              />
              <LeyendaDeCostos />
              {(venta.envioDeLaTienda || venta.entregaDeLaTienda) && <p className="m-0 text-xs text-muted-foreground">* Porcentaje de toda la tienda: este producto tiene pocos pedidos.</p>}
              {venta.rentabilidad && (
                <>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
                    <Cifra titulo="Venta por pedido" valor={dolares(venta.rentabilidad.venta)} apoyo={venta.economia ? `${venta.economia.pedidos} pedidos entregados` : undefined} />
                    <Cifra titulo="Producto" valor={dolares(venta.rentabilidad.producto)} apoyo={venta.economia?.fuente === "matriz" ? "costo de la Matriz" : `${venta.economia?.unidades ?? 1} ud. · costo de Compras`} />
                    <Cifra titulo="Deja por venta entregada" valor={`${(venta.rentabilidad.ganancia ?? 0) < 0 ? "−" : ""}${venta.rentabilidad.ganancia === null ? "—" : dolares(Math.abs(venta.rentabilidad.ganancia))}`} nivel={venta.rentabilidad.pierde ? "malo" : "bueno"} apoyo="con el CPA de ahora" />
                    <Cifra titulo="CPA para no perder" valor={dolares(venta.rentabilidad.cpaParaNoPerder)} nivel={venta.cpa !== null && venta.cpa > venta.rentabilidad.cpaParaNoPerder ? "malo" : undefined} apoyo={venta.cpa !== null ? `ahora ${dolares(venta.cpa)}` : undefined} />
                  </div>
                  <p className="m-0 text-xs text-muted-foreground">Con el costo de Compras (sin flete ni IVA). Solo informa: no cambia el CPA tope.</p>
                </>
              )}
            </Seccion>
          )}

          <Seccion icono={FiltroIcon} titulo={`Ángulos que usa (${angulos.length})`}>
            {p.clave && (
              <Link href={`/anuncios-meta/que-funciona?producto=${encodeURIComponent(p.clave)}`} className="w-fit text-xs font-medium text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                Ver qué funciona de este producto
              </Link>
            )}
            {angulos.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Todavía no hay videos de este producto con ángulo (se miran los últimos 30 días).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-left text-sm">
                  <caption className="sr-only">Ángulos del producto con lo que gastó y vendió cada uno en los últimos 30 días</caption>
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th scope="col" className="py-1.5 pr-3 font-medium">Ángulo</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Videos</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Gasto</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Compras</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">CPA</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Hook</th>
                      <th scope="col" className="pl-2 py-1.5 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {angulos.map((a) => {
                      const ctx = { tope: p.tope, etapa: "venta", confiable: confiable(a.r) };
                      return (
                        <tr key={a.angulo} className="border-t border-border tabular-nums">
                          <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                            {a.angulo}
                            {a.deQue && <span className="block max-w-[18rem] text-xs font-normal text-muted-foreground">{a.deQue}</span>}
                          </th>
                          <td className="px-2 py-1.5 text-right">{a.videos}</td>
                          {(["gasto", "compras", "cpa", "hook", "ctr"] as const).map((k, i) => {
                            const v = valorColumna(k, a.r, ctx);
                            return (
                              <td key={k} className={`${i === 4 ? "pl-2" : "px-2"} py-1.5 text-right`}>
                                <Nivel nivel={v.nivel}>{v.texto}</Nivel>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>

          <Seccion icono={AnunciosIcon} titulo={`Campañas (${delProducto.length})`}>
            <ul role="list" className="m-0 flex list-none flex-col gap-2 p-0">
              {delProducto.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 rounded-lg border border-border p-2.5">
                  <Link href={`/anuncios-meta/campanas?abrir=${c.id}`} className="truncate text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                    {c.nombre}
                  </Link>
                  <p className="m-0 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <InsigniaPrioridad pendiente={c.pendiente} />
                    <InsigniaEtapa etapa={c.etapa} />
                    {c.activa ? "Activa" : "Apagada"}
                    {c.angulo ? ` · ${anguloDeLaCampana(c)}` : ""}
                  </p>
                  {c.r.gasto > 0 && <MetricasEnLinea r={c.r} tope={c.tope} etapa={c.etapa} completa frecuencia={c.frecuencia} />}
                </li>
              ))}
            </ul>
          </Seccion>

          {susVideos.length > 0 && (
            <Seccion icono={AnunciosIcon} titulo="Sus videos con más gasto (últimos 30 días)">
              <ul role="list" className="m-0 flex list-none flex-col gap-2 p-0">
                {susVideos.map((v) => (
                  <li key={v.id} className="flex flex-col gap-1 rounded-lg border border-border p-2.5">
                    <Link href={`/anuncios-meta/videos?abrir=${v.id}`} className="truncate text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                      {v.numero ? `${v.numero} · ` : ""}
                      {v.nombre}
                    </Link>
                    <p className="m-0 text-xs text-muted-foreground">{nombreDeAngulo(v.analisis?.angulo ?? v.angulo, v.analisis?.anguloDetalle) ?? "Ángulo sin analizar"}</p>
                    {v.r.gasto > 0 && <MetricasEnLinea r={v.r} tope={v.tope} etapa="venta" />}
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
        </div>
      )}
    </Ventana>
  );
}

/** Todos los productos con lo que sumaron sus campañas en el periodo, con la barra común, el orden que cada persona elija y las columnas que cada persona quiera ver. Tocar uno abre su ficha (`?abrir=<producto>`). */
export function ListaProductos({ productos, campanas, videos, abrirInicial, entrega, costos }: { productos: ProductoVista[]; campanas: CampanaVista[]; videos: VideoVista[]; abrirInicial: string | null; entrega: EntregasMeta | null; costos: CostosOperacion }) {
  const [columnas, guardarColumnas, restablecerColumnas] = useColumnasMeta("productos", COLUMNAS_PRODUCTOS);
  const [ordenes, guardarOrdenes] = useOrdenMeta("productos", CRITERIOS_PRODUCTOS, ORDEN_PRODUCTOS);
  const [abierto, setAbierto] = useState<string | null>(() => (abrirInicial && productos.some((p) => idDe(p) === abrirInicial) ? abrirInicial : null));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (abierto) url.searchParams.set("abrir", abierto);
    else url.searchParams.delete("abrir");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [abierto]);
  // La ficha se dibuja en `<body>` (portal): con `?abrir=` arranca abierta, así que solo se monta ya en el navegador.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const ordenados = useMemo(() => ordenarPor(productos, CRITERIOS_PRODUCTOS, ordenes, (p) => p.r.gasto), [productos, ordenes]);
  const p = enNavegador ? productos.find((x) => idDe(x) === abierto) : undefined;
  const hayPocaData = productos.some((x) => x.r.gasto > 0 && !confiable(x.r));
  return (
    <>
      <BarraOrden criterios={CRITERIOS_PRODUCTOS} ordenes={ordenes} alCambiar={guardarOrdenes}>
        <SelectorColumnasMeta titulo="Productos" columnas={columnas} alCambiar={guardarColumnas} alRestablecer={restablecerColumnas} sinFrecuencia />
      </BarraOrden>
      <ListaDatos
        def={DEF_PRODUCTOS}
        filas={ordenados}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={idDe}
        variante="filas"
        encabezado={<EncabezadoColumnas nombre="Producto" columnas={columnas} />}
        renderFila={(x) => <FilaProducto p={x} columnas={columnas} alAbrir={() => setAbierto(idDe(x))} entrega={entrega} />}
        vacio="Todavía no hay campañas con producto en este periodo."
      />
      {hayPocaData && <p className="m-0 text-xs text-muted-foreground">{AVISO_POCA_DATA}</p>}
      <FichaProducto p={p} campanas={campanas} videos={videos} alCerrar={() => setAbierto(null)} entrega={entrega} costos={costos} />
    </>
  );
}
