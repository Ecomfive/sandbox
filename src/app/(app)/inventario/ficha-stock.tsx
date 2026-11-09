"use client";

import { useEffect, useState } from "react";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { Badge } from "@/components/ui/badge";
import { Seccion } from "@/components/ui/seccion-ficha";
import { cuantasCajas, textoCaja, unidadesDeCajas } from "@/lib/wms/cajas";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { formatearTiempoRelativo } from "@/lib/formato";
import { CalendarioIcon, ComprasIcon, EnvioIcon, HistorialIcon, InventarioIcon } from "@/lib/nav-icons";
import { pideMotivo, puedeMoverAMano } from "@/lib/wms/recepcion";
import { ETIQUETA_PLATAFORMA } from "@/lib/wms/stock-plataformas";
import { ComprasProducto } from "../producto/compras-producto";
import { CorregirStock } from "./corregir-stock";
import { NotasProducto } from "./notas-producto";
import { ETIQUETA_TIPO_SKU, type FilaStock } from "./def-stock";
import { DESCRIPCION_CUBETA } from "./descripciones-stock";
import { PanelMovimiento, type BodegaOpcion, type UbicacionOpcion } from "./panel-movimiento";
import { PanelRemision, PanelTransferencia } from "./panel-transferencia";
import { obtenerStockDeSku, type EnvioDropi, type CajaDeBodega, type LoteStock, type MovimientoStock, type StockBodega } from "./stock-actions";

/** Lo que la ficha necesita del producto (el Levantamiento la abre con sus propios datos). */
export type SkuFicha = Pick<FilaStock, "id" | "codigo" | "nombre" | "numero" | "barras" | "tipo" | "clase" | "manejaVencimiento"> & { plataformas?: FilaStock["plataformas"] };

const ETIQUETA_TIPO_MOV: Record<string, string> = { entrada: "Entrada", salida: "Salida", ajuste: "Ajuste", reserva: "Reserva", liberacion: "Liberación", traslado: "Traslado" };
const ETIQUETA_CUBETA: Record<string, string> = {
  fisico: "físico",
  reservado: "reservado",
  danado: "dañado",
  inspeccion: "en inspección",
  retenido: "retenido",
  en_camino: "en camino",
  vencido: "vencido",
};
const ETIQUETA_ORIGEN: Record<string, string> = {
  manual: "A mano",
  sync_dropi: "Sincronización de Dropi",
  sync_shopify: "Sincronización de Shopify",
  pedido: "Pedido",
  conteo: "Levantamiento",
  transferencia: "Transferencia",
  envio_dropi: "Remisión",
  compra: "Recepción de compra",
};

const ETIQUETA_ESTADO_LOTE = { vencido: "Vencido", por_vencer: "Por vencer", vigente: "Vigente" } as const;

function textoDias(d: number): string {
  if (d < 0) return `venció hace ${-d} ${d === -1 ? "día" : "días"}`;
  if (d === 0) return "vence hoy";
  return `en ${d} ${d === 1 ? "día" : "días"}`;
}

/** Un número del inventario: tabular, y en rojo si el saldo quedó negativo. */
function Cifra({ n }: { n: number }) {
  return <span className={`tabular-nums ${n < 0 ? "font-medium text-destructive" : ""}`}>{n}</span>;
}

function cambiosATexto(cambios: Record<string, number>): string {
  return Object.entries(cambios)
    .map(([cubeta, n]) => `${ETIQUETA_CUBETA[cubeta] ?? cubeta} ${n > 0 ? "+" : ""}${n}`)
    .join(", ");
}

/**
 * Ficha de un SKU en el inventario: el panel a la derecha con su stock por bodega (todas las del país, también las que
 * nunca se movieron) y los últimos movimientos. Con permiso de escritura, los botones de entrada, salida y ajuste. Un combo
 * no guarda stock (sale de sus componentes), así que no tiene botones.
 */
export function FichaStock({
  sku,
  bodegasPropias,
  ubicaciones,
  puedeEscribir,
  codigoPais,
  bodegasExternas,
  conPlataformas = false,
  esAdmin = false,
  puedeComentar = puedeEscribir,
  alCerrar,
  alCambiar,
}: {
  /** Lo que la ficha usa del producto: desde el Levantamiento llega sin lo de las plataformas. */
  sku: SkuFicha | undefined;
  bodegasPropias: BodegaOpcion[];
  /** Las bodegas externas activas del país (Dropi, Effi…): a dónde va una remisión. */
  bodegasExternas: BodegaOpcion[];
  ubicaciones: UbicacionOpcion[];
  puedeEscribir: boolean;
  /** Las compras que se ven son las de este país, como el stock. */
  codigoPais: string;
  /** Este país muestra las plataformas: las bodegas externas sin nada propio no salen, porque su stock se ve en «En plataformas». */
  conPlataformas?: boolean;
  /** Es administrador: en los países donde toda salida va con remisión, solo él hace salidas y ajustes a mano. */
  esAdmin?: boolean;
  /** Si puede escribir notas en el producto (por omisión, quien puede escribir en el inventario). */
  puedeComentar?: boolean;
  alCerrar: () => void;
  /** Se llama tras guardar un movimiento, para que la tabla vuelva a pedir sus totales. */
  alCambiar: () => void;
}) {
  const [datos, setDatos] = useState<{ bodegas: StockBodega[]; movimientos: MovimientoStock[]; lotes: LoteStock[]; envios: EnvioDropi[]; cajas: CajaDeBodega[] } | "error" | null>(null);
  // Sube cuando se guarda un movimiento, para volver a pedir el stock y el libro.
  const [version, setVersion] = useState(0);
  const id = sku?.id;

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    obtenerStockDeSku(id)
      .then((r) => vigente && setDatos("bodegas" in r ? r : "error"))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [id, version]);

  const esCombo = sku?.tipo === "combo";
  const esTest = sku?.clase === "test";
  // Corregir un valor: cualquiera que edite el inventario, en todos los países, siempre con nota (7 nov 2026).
  const puedeCorregir = puedeEscribir && !esCombo && !esTest;
  return (
    <Ventana
      abierto={!!sku}
      alCerrar={() => {
        setDatos(null);
        alCerrar();
      }}
      lado="derecha"
      ancho="lg"
      titulo={
        sku && (
          <>
            <span className="text-lg font-semibold">{sku.nombre}</span>
            <Badge tone="neutral">{ETIQUETA_TIPO_SKU[sku.tipo] ?? sku.tipo}</Badge>
          </>
        )
      }
    >
      {sku && (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-col gap-1 px-5 pt-5 pb-4">
            <p className="m-0 text-sm text-muted-foreground">{sku.codigo}</p>
            <CodigosProducto numero={sku.numero} barras={sku.barras} />
          </div>

          {puedeEscribir && !esCombo && !esTest && (
            <div className="flex flex-wrap gap-2 border-y border-border px-5 py-3">
              {(["entrada", "salida"] as const).filter((tipo) => puedeMoverAMano(tipo, codigoPais, esAdmin)).map((tipo) => (
                <PanelMovimiento
                  key={`${sku.id}-${tipo}`}
                  skuId={sku.id}
                  tipo={tipo}
                  motivoObligatorio={pideMotivo(tipo, codigoPais)}
                  bodegas={bodegasPropias}
                  ubicaciones={ubicaciones}
                  manejaVencimiento={sku.manejaVencimiento}
                  lotes={datos && datos !== "error" ? datos.lotes : []}
                  alGuardar={() => {
                    setVersion((v) => v + 1);
                    alCambiar();
                  }}
                />
              ))}
              {/* Corregir un valor: se escribe el número correcto, no la diferencia, y por qué (reemplaza a «Ajuste»). */}
              {puedeCorregir && (
                <CorregirStock
                  key={`${sku.id}-corregir-${version}`}
                  skuId={sku.id}
                  bodegas={datos && datos !== "error" ? datos.bodegas.filter((b) => b.tipo !== "externa").map((b) => ({ bodegaId: b.bodegaId, nombre: b.nombre, fisico: b.fisico })) : []}
                  lotes={datos && datos !== "error" ? datos.lotes : []}
                  manejaVencimiento={sku.manejaVencimiento}
                  alGuardar={() => {
                    setVersion((v) => v + 1);
                    alCambiar();
                  }}
                />
              )}
              <PanelTransferencia
                key={`${sku.id}-transferir`}
                skuId={sku.id}
                bodegas={bodegasPropias}
                manejaVencimiento={sku.manejaVencimiento}
                lotes={datos && datos !== "error" ? datos.lotes : []}
                alGuardar={() => {
                  setVersion((v) => v + 1);
                  alCambiar();
                }}
              />
              {bodegasExternas.length > 0 && (
                <PanelRemision
                  key={`${sku.id}-remision`}
                  skuId={sku.id}
                  bodegas={bodegasPropias}
                  externas={bodegasExternas}
                  manejaVencimiento={sku.manejaVencimiento}
                  lotes={datos && datos !== "error" ? datos.lotes : []}
                  alGuardar={() => {
                    setVersion((v) => v + 1);
                    alCambiar();
                  }}
                />
              )}
            </div>
          )}

          <div className="flex flex-col divide-y divide-border border-t border-border p-5">
            <Seccion icono={InventarioIcon} titulo="Stock por bodega">
              {esTest ? (
                <p className="text-sm text-muted-foreground">Producto de prueba: no tiene stock hasta que se pase a Activo (en Producto).</p>
              ) : esCombo ? (
                <p className="text-sm text-muted-foreground">Un producto compuesto no guarda stock: se calcula de sus componentes.</p>
              ) : datos === null ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : datos === "error" ? (
                <p role="alert" className="text-sm text-destructive">
                  No se pudo cargar el stock.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[38rem] border-collapse text-[13px]">
                    <thead>
                      <tr className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                        <th scope="col" className="py-1.5 pr-2 font-semibold">
                          Bodega
                        </th>
                        {(
                          [
                            ["Físico", DESCRIPCION_CUBETA.fisico],
                            ["Reserv.", DESCRIPCION_CUBETA.reservado],
                            ["Disp.", DESCRIPCION_CUBETA.disponible],
                            ["Dañado", DESCRIPCION_CUBETA.danado],
                            ["Insp.", DESCRIPCION_CUBETA.inspeccion],
                            ["Retenido", DESCRIPCION_CUBETA.retenido],
                            ["Vencido", DESCRIPCION_CUBETA.vencido],
                            ["En camino", DESCRIPCION_CUBETA.enCamino],
                          ] as const
                        ).map(([t, descripcion]) => (
                          <th key={t} scope="col" className="px-1.5 py-1.5 text-right font-semibold">
                            <Tooltip texto={descripcion}>
                              <span tabIndex={0} className="cursor-help border-b border-dotted border-muted-foreground/60">
                                {t}
                              </span>
                            </Tooltip>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datos.bodegas.filter((b) => !conPlataformas || b.tipo !== "externa" || b.fisico !== 0 || b.enCamino !== 0).map((b) => (
                        <tr key={b.bodegaId} className="border-t border-border">
                          <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                            {b.nombre}
                            {b.tipo === "externa" && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">externa</span>}
                          </th>
                          {[b.fisico, b.reservado, b.disponible, b.danado, b.inspeccion, b.retenido, b.vencido, b.enCamino].map((n, i) => (
                            <td key={i} className="px-1.5 py-1.5 text-right">
                              <Cifra n={n} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Seccion>

            {conPlataformas && (
              <Seccion icono={EnvioIcon} titulo="En plataformas">
                {!sku.plataformas ? (
                  <p className="text-sm text-muted-foreground">No tiene unidades en Dropi, Effi ni Drop, o no está vinculado a una publicación de allá.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
                      {sku.plataformas.lineas.map((l) => (
                        <li key={`${l.plataforma}-${l.id}`} className="flex flex-wrap justify-between gap-x-3">
                          <span className="min-w-0">
                            <span className="font-medium">{ETIQUETA_PLATAFORMA[l.plataforma]}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {l.id} · {l.nombre}
                            </span>
                            {l.aparte !== 0 && <span className="text-muted-foreground"> · {l.aparte.toLocaleString("es-PA")} u. {l.plataforma === "effi" ? "en garantías" : "en otra bodega (referencial)"}</span>}
                          </span>
                          <span className="tabular-nums">{l.unidades.toLocaleString("es-PA")} u.</span>
                        </li>
                      ))}
                    </ul>
                    <p className="m-0 text-xs text-muted-foreground">Es lo de la última lectura de cada plataforma. Aquí no se cambia: se mueve con remisión o en la plataforma.</p>
                  </div>
                )}
              </Seccion>
            )}

            {!esCombo && !esTest && datos !== null && datos !== "error" && datos.cajas.length > 0 && (
              <Seccion icono={InventarioIcon} titulo="Cajas">
                <div className="flex flex-col gap-3">
                  {[...new Set(datos.cajas.map((c) => c.bodegaId))].map((bodegaId) => {
                    const deBodega = datos.cajas.filter((c) => c.bodegaId === bodegaId);
                    const fisico = datos.bodegas.find((b) => b.bodegaId === bodegaId)?.fisico ?? 0;
                    const unidades = unidadesDeCajas(deBodega);
                    return (
                      <div key={bodegaId} className="flex flex-col gap-1">
                        <p className="m-0 text-[13px] font-medium">
                          {deBodega[0].bodega}: {cuantasCajas(deBodega).toLocaleString("es-PA")} {cuantasCajas(deBodega) === 1 ? "caja" : "cajas"} · {unidades.toLocaleString("es-PA")} u.
                        </p>
                        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[13px]">
                          {deBodega.map((c) => (
                            <li key={c.id} className="flex flex-wrap justify-between gap-x-3">
                              <span>
                                {textoCaja(c)}
                                {c.lugar ? ` · ${c.lugar}` : ""}
                                {c.observacion ? <span className="text-muted-foreground"> · {c.observacion}</span> : null}
                              </span>
                              <span className="text-muted-foreground tabular-nums">{(c.cajas * c.porCaja).toLocaleString("es-PA")} u.</span>
                            </li>
                          ))}
                        </ul>
                        {unidades !== fisico && (
                          <p role="status" className="m-0 text-xs text-warning">
                            No cuadra: las cajas suman {unidades.toLocaleString("es-PA")} u. y el stock físico es {fisico.toLocaleString("es-PA")} u. Corrígelo en el Levantamiento.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Seccion>
            )}

            {!esCombo && (
              <Seccion icono={ComprasIcon} titulo="Compras">
                <ComprasProducto key={sku.id} id={sku.id} limite={5} pais={codigoPais} />
              </Seccion>
            )}

            {sku.manejaVencimiento && !esCombo && !esTest && datos !== null && datos !== "error" && (
              <Seccion icono={CalendarioIcon} titulo="Lotes">
                {datos.lotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin lotes con unidades.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
                    {datos.lotes.map((l) => (
                      <li key={l.loteId + l.bodegaId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <strong className="font-medium">{l.lote}</strong>
                        <Badge tone={l.estado === "vencido" ? "destructive" : l.estado === "por_vencer" ? "warning" : "neutral"}>{ETIQUETA_ESTADO_LOTE[l.estado]}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {l.cantidad} u. · {l.bodega} · vence {l.fechaVencimiento} ({textoDias(l.diasRestantes)})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Seccion>
            )}

            {!esCombo && !esTest && datos !== null && datos !== "error" && datos.envios.length > 0 && (
              <Seccion icono={EnvioIcon} titulo="Remisiones">
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13px]">
                  {datos.envios.map((e) => (
                    <li key={e.id} className="flex flex-col">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="font-medium tabular-nums">{e.enviada} u.</strong>
                        <span>a {e.hacia}</span>
                        {e.estado === "en_camino" ? (
                          <Badge tone="warning">En camino</Badge>
                        ) : e.recibida === e.enviada ? (
                          <Badge tone="success">Llegó completo</Badge>
                        ) : (
                          <Badge tone="destructive">Llegaron {e.recibida}</Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Desde {e.desde} · {formatearTiempoRelativo(e.enviadoEn)}
                        {e.referencia ? ` · ${e.referencia}` : ""}
                        {e.motivo ? ` · ${e.motivo}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Seccion>
            )}

            {!esCombo && !esTest && (
              <Seccion icono={HistorialIcon} titulo="Movimientos">
                {datos === null || datos === "error" ? null : datos.movimientos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13px]">
                    {datos.movimientos.map((m) => (
                      <li key={m.id} className="flex flex-col">
                        <span>
                          <strong className="font-medium">{ETIQUETA_TIPO_MOV[m.tipo] ?? m.tipo}</strong> · {cambiosATexto(m.cambios)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {m.bodega}
                          {m.ubicacion ? ` · ${m.ubicacion}` : ""} · {ETIQUETA_ORIGEN[m.origen] ?? m.origen}
                          {m.usuario ? ` · ${m.usuario}` : ""} · {formatearTiempoRelativo(m.creadoEn)}
                          {m.referencia ? ` · ${m.referencia}` : ""}
                          {m.motivo ? ` · ${m.motivo}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Seccion>
            )}
          </div>
          {/* Notas del producto y sus cambios (7 nov 2026, pedido de Hernán), al final como en Compras y Producto. */}
          <section aria-label="Notas del producto" className="border-t border-border bg-muted/30">
            <NotasProducto key={sku.id} id={sku.id} puedeComentar={puedeComentar} version={version} />
          </section>
        </div>
      )}
    </Ventana>
  );
}
