"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { formatearTiempoRelativo } from "@/lib/formato";
import { CalendarioIcon, ComprasIcon, HistorialIcon, InventarioIcon } from "@/lib/nav-icons";
import { ComprasProducto } from "../producto/compras-producto";
import { ETIQUETA_TIPO_SKU, type FilaStock } from "./def-stock";
import { DESCRIPCION_CUBETA } from "./descripciones-stock";
import { PanelMovimiento, type BodegaOpcion, type UbicacionOpcion } from "./panel-movimiento";
import { obtenerStockDeSku, type LoteStock, type MovimientoStock, type StockBodega } from "./stock-actions";

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
const ETIQUETA_ORIGEN: Record<string, string> = { manual: "A mano", sync_dropi: "Sincronización de Dropi", sync_shopify: "Sincronización de Shopify", pedido: "Pedido", conteo: "Conteo" };

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
  alCerrar,
  alCambiar,
}: {
  sku: FilaStock | undefined;
  bodegasPropias: BodegaOpcion[];
  ubicaciones: UbicacionOpcion[];
  puedeEscribir: boolean;
  /** Las compras que se ven son las de este país, como el stock. */
  codigoPais: string;
  alCerrar: () => void;
  /** Se llama tras guardar un movimiento, para que la tabla vuelva a pedir sus totales. */
  alCambiar: () => void;
}) {
  const [datos, setDatos] = useState<{ bodegas: StockBodega[]; movimientos: MovimientoStock[]; lotes: LoteStock[] } | "error" | null>(null);
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
            <span className="text-lg font-semibold">{sku.codigo}</span>
            <Badge tone="neutral">{ETIQUETA_TIPO_SKU[sku.tipo] ?? sku.tipo}</Badge>
          </>
        )
      }
    >
      {sku && (
        <div className="flex flex-1 flex-col">
          <p className="px-5 pt-5 pb-4 text-sm text-muted-foreground">{sku.nombre}</p>

          {puedeEscribir && !esCombo && !esTest && (
            <div className="flex flex-wrap gap-2 border-y border-border px-5 py-3">
              {(["entrada", "salida", "ajuste"] as const).map((tipo) => (
                <PanelMovimiento
                  key={`${sku.id}-${tipo}`}
                  skuId={sku.id}
                  tipo={tipo}
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
                      {datos.bodegas.map((b) => (
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
        </div>
      )}
    </Ventana>
  );
}
