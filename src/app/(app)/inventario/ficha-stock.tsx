"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { Badge } from "@/components/ui/badge";
import { Seccion } from "@/components/ui/seccion-ficha";
import { cuantasCajas, textoCaja, unidadesDeCajas } from "@/lib/wms/cajas";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { FechaHora } from "@/components/ui/fecha-hora";
import { CalendarioIcon, ComprasIcon, EnvioIcon, GastoIcon, HistorialIcon, InventarioIcon } from "@/lib/nav-icons";
import { CostoProductoBloque } from "@/components/costos/costo-producto";
import { pideMotivo, puedeMoverAMano } from "@/lib/wms/recepcion";
import { ETIQUETA_PLATAFORMA, type Plataforma } from "@/lib/wms/stock-plataformas";
import { juntarConVariantes, sumarCubetas, type Cubetas } from "@/lib/wms/stock-con-variantes";

/** De qué plataforma lee cada bodega externa su stock (por su código): la fila de la bodega muestra lo que dice la plataforma (11 nov 2026, Hernán). */
const PLATAFORMA_DE_BODEGA: Record<string, Plataforma> = { dropi: "dropi", effi: "effi", boxfull: "drop", dunamixfy: "dunamixfy" };
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { ComprasProducto } from "../producto/compras-producto";
import { FichaProductoEmbebida } from "../producto/ficha-producto-embebida";
import { CorregirStock } from "./corregir-stock";
import { PanelDefectuoso, type BodegaDefectuosos, type OpcionDefectuoso } from "./defectuoso";
import { NotasProducto } from "./notas-producto";
import { ETIQUETA_TIPO_SKU, type FilaStock } from "./def-stock";
import { DESCRIPCION_CUBETA } from "./descripciones-stock";
import { PanelMovimiento, type BodegaOpcion, type UbicacionOpcion } from "./panel-movimiento";
import { PanelRemision, PanelTransferencia } from "./panel-transferencia";
import { obtenerStockDeSku, type EnvioDropi, type CajaDeBodega, type LoteStock, type MovimientoStock, type StockBodega } from "./stock-actions";
import type { VarianteConStock } from "@/lib/wms/stock-con-variantes";

/** Lo que la ficha necesita del producto (el Levantamiento la abre con sus propios datos). */
export type SkuFicha = Pick<FilaStock, "id" | "codigo" | "nombre" | "numero" | "barras" | "tipo" | "clase" | "manejaVencimiento"> & { /** Su stock está como general en el producto principal, pendiente de repartir entre las variantes (migración 0273). */ repartoPendiente?: boolean; plataformas?: FilaStock["plataformas"]; /** Un producto principal con variantes: la etiqueta dice «Con variantes». */ conVariantes?: boolean };

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

/** Las cifras de una fila de la tabla de bodegas, en el orden de sus columnas. */
const valoresDe = (c: Cubetas): number[] => [c.fisico, c.reservado, c.disponible, c.danado, c.inspeccion, c.retenido, c.vencido, c.enCamino];

/** Lo de todo el producto (stock general más variantes) en las bodegas propias del país: es el número que ve la lista de Stock. */
const totalPropias = (bodegas: StockBodega[], variantes: VarianteConStock[]): Cubetas =>
  sumarCubetas(...juntarConVariantes(bodegas.filter((b) => b.tipo !== "externa"), variantes).map((x) => x.total));

/**
 * A qué se le puede marcar defectuoso desde el botón de arriba: un producto simple, todas sus bodegas propias; un producto con variantes, cada variante con las bodegas donde tiene unidades (disponibles o ya
 * marcadas) y, mientras su stock esté sin repartir, el stock general del principal.
 */
function opcionesDefectuoso(sku: SkuFicha, datos: { bodegas: StockBodega[]; variantes: VarianteConStock[] } | null): OpcionDefectuoso[] {
  if (!datos) return [];
  // El nombre y el tipo de cada bodega salen de las del producto principal (las variantes traen solo las cifras).
  const propias = new Map(datos.bodegas.filter((b) => b.tipo !== "externa").map((b) => [b.bodegaId, b.nombre]));
  const bodegasDe = (cifras: { bodegaId: string; disponible: number; danado: number }[], soloConUnidades: boolean): BodegaDefectuosos[] =>
    cifras
      .filter((b) => propias.has(b.bodegaId) && (!soloConUnidades || b.disponible > 0 || b.danado > 0))
      .map((b) => ({ bodegaId: b.bodegaId, nombre: propias.get(b.bodegaId)!, disponible: b.disponible, danado: b.danado }));
  if (!sku.conVariantes) return [{ skuId: sku.id, nombre: sku.nombre, bodegas: bodegasDe(datos.bodegas, false) }];
  const deVariantes: OpcionDefectuoso[] = datos.variantes.map((v) => ({ skuId: v.id, nombre: v.etiqueta, bodegas: bodegasDe(v.bodegas, true) })).filter((o) => o.bodegas.length > 0);
  const general: OpcionDefectuoso[] = sku.repartoPendiente ? [{ skuId: sku.id, nombre: "Stock general (sin repartir)", bodegas: bodegasDe(datos.bodegas, true) }].filter((o) => o.bodegas.length > 0) : [];
  return [...deVariantes, ...general];
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
  soloEnBodegas = null,
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
  /**
   * Las únicas bodegas que esa persona puede modificar (quien no está a cargo del inventario: la de despacho), sin transferir. `null` = todas. Las remisiones no cambian.
   * El servidor lo vuelve a comprobar.
   */
  soloEnBodegas?: string[] | null;
  /** Si puede escribir notas en el producto (por omisión, quien puede escribir en el inventario). */
  puedeComentar?: boolean;
  alCerrar: () => void;
  /** Se llama tras guardar un movimiento, para que la tabla vuelva a pedir sus totales. */
  alCambiar: () => void;
}) {
  const [datos, setDatos] = useState<{ bodegas: StockBodega[]; movimientos: MovimientoStock[]; lotes: LoteStock[]; envios: EnvioDropi[]; cajas: CajaDeBodega[]; variantes: VarianteConStock[] } | "error" | null>(null);
  // Sube cuando se guarda un movimiento, para volver a pedir el stock y el libro.
  const [version, setVersion] = useState(0);
  const id = sku?.id;
  // La ficha de Producto encima de esta (11 nov 2026, pedido de Hernán: que Dinora cree variantes, una productos, etc. sin salir del Levantamiento).
  const puedeVerProducto = usePuedeAbrir("producto");
  // El Levantamiento es del módulo Inventario: quien abre la ficha desde otro lado (Producto, Gestión de IDs) y no lo tiene, no ve el enlace.
  const puedeVerInventario = usePuedeAbrir("inventario");
  const [productoAbierto, setProductoAbierto] = useState<string | null>(null);

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
  const puedeEnBodega = (bodegaId: string) => soloEnBodegas === null || soloEnBodegas.includes(bodegaId);
  const bodegasQueMueve = bodegasPropias.filter((b) => puedeEnBodega(b.id));
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
            <Badge tone="neutral">{sku.conVariantes ? "Con variantes" : (ETIQUETA_TIPO_SKU[sku.tipo] ?? sku.tipo)}</Badge>
            {sku.repartoPendiente && <Badge tone="neutral">{sku.conVariantes ? "Stock sin repartir" : "Sin repartir: sale del stock general"}</Badge>}
          </>
        )
      }
    >
      {sku && (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-col gap-1 px-5 pt-5 pb-4">
            <p className="m-0 text-sm text-muted-foreground">{sku.codigo}</p>
            <CodigosProducto numero={sku.numero} barras={sku.barras} />
            {puedeVerProducto && (
              <button
                type="button"
                onClick={() => setProductoAbierto(sku.id)}
                className="mt-1 w-fit rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                Editar en Producto
              </button>
            )}
          </div>

          {puedeEscribir && !esCombo && !esTest && (
            <div className="flex flex-wrap gap-2 border-y border-border px-5 py-3">
              {(["entrada", "salida"] as const).filter((tipo) => bodegasQueMueve.length > 0 && puedeMoverAMano(tipo, codigoPais, esAdmin)).map((tipo) => (
                <PanelMovimiento
                  key={`${sku.id}-${tipo}`}
                  skuId={sku.id}
                  tipo={tipo}
                  motivoObligatorio={pideMotivo(tipo, codigoPais)}
                  bodegas={bodegasQueMueve}
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
                  bodegas={datos && datos !== "error" ? datos.bodegas.filter((b) => b.tipo !== "externa" && puedeEnBodega(b.bodegaId)).map((b) => ({ bodegaId: b.bodegaId, nombre: b.nombre, fisico: b.fisico })) : []}
                  lotes={datos && datos !== "error" ? datos.lotes : []}
                  manejaVencimiento={sku.manejaVencimiento}
                  alGuardar={() => {
                    setVersion((v) => v + 1);
                    alCambiar();
                  }}
                />
              )}
              {/* Defectuoso: marcar unidades que no se pueden vender, devolverlas a disponible o darlas de baja. En un producto con variantes se elige primero la variante (y el stock general mientras esté sin repartir). No aplica a un producto con vencimiento. */}
              {puedeCorregir && !sku.manejaVencimiento && (
                <PanelDefectuoso
                  key={`${sku.id}-defectuoso-${version}`}
                  opciones={opcionesDefectuoso(sku, datos && datos !== "error" ? datos : null).map((o) => ({ ...o, bodegas: o.bodegas.filter((b) => puedeEnBodega(b.bodegaId)) }))}
                  puedeBaja={puedeMoverAMano("salida", codigoPais, esAdmin)}
                  alGuardar={() => {
                    setVersion((v) => v + 1);
                    alCambiar();
                  }}
                />
              )}
              {/* Transferir es de la persona a cargo del inventario y de los administradores (26 nov 2026). */}
              {soloEnBodegas === null && (
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
              )}
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
                      {juntarConVariantes(datos.bodegas, datos.variantes).map(({ bodega: b, total, partes }) => {
                        // Una bodega de plataforma (Dropi B280, Effi, Drop, Dunamixfy) muestra lo de la última lectura de la plataforma: el sistema no la mueve.
                        const plataforma = conPlataformas && b.tipo === "externa" ? PLATAFORMA_DE_BODEGA[b.codigo] : undefined;
                        const enPlataforma = plataforma ? (sku.plataformas?.[plataforma] ?? 0) : null;
                        const fisico = enPlataforma ?? total.fisico;
                        const disponible = enPlataforma ?? total.disponible;
                        // Junto a la de Dropi, nuestra bodega de proveedor en Dropi (B81 en Panamá): sus unidades son referenciales (11 nov 2026, Hernán).
                        const enProveedor = plataforma === "dropi" ? (sku.plataformas?.lineas ?? []).filter((l) => l.plataforma === "dropi").reduce((t, l) => t + l.aparte, 0) : null;
                        // Con variantes, el stock general sin repartir se nombra en la bodega donde está (aún sin ninguna variante ahí), para que se entienda que ese número no es de una variante.
                        const sinRepartir = sku.repartoPendiente && datos.variantes.length > 0 && partes.length === 0 && total.fisico !== 0;
                        return (
                        <Fragment key={b.bodegaId}>
                        <tr className="border-t border-border">
                          <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                            {/* Una bodega propia abre su levantamiento con este producto (23 nov 2026, pedido de Dinora). Las de plataforma no se cuentan ahí. */}
                            {b.tipo !== "externa" && puedeVerInventario ? (
                              <Link
                                href={`/inventario/levantamiento?bodega=${b.bodegaId}&producto=${sku.id}`}
                                title={`Abrir el levantamiento de ${b.nombre} con este producto`}
                                className="underline-offset-2 hover:text-primario hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                {b.nombre}
                              </Link>
                            ) : (
                              b.nombre
                            )}
                            {b.tipo === "externa" && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{plataforma ? `según ${ETIQUETA_PLATAFORMA[plataforma]}` : "externa"}</span>}
                            {sinRepartir && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">stock general, sin repartir</span>}
                          </th>
                          {[fisico, total.reservado, disponible, total.danado, total.inspeccion, total.retenido, total.vencido, total.enCamino].map((n, i) => (
                            <td key={i} className="px-1.5 py-1.5 text-right">
                              <Cifra n={n} />
                            </td>
                          ))}
                        </tr>
                        {partes.map((p) => (
                          <tr key={p.clave} className="text-muted-foreground">
                            <th scope="row" className="py-1 pr-2 pl-5 text-left text-xs font-normal">
                              <span aria-hidden="true">↳ </span>
                              <span className="sr-only">Incluido en el total de {b.nombre}: </span>
                              {b.tipo !== "externa" && !p.general && puedeVerInventario ? (
                                <Link
                                  href={`/inventario/levantamiento?bodega=${b.bodegaId}&producto=${p.clave}`}
                                  title={`Abrir el levantamiento de ${b.nombre} con esta variante`}
                                  className="underline-offset-2 hover:text-primario hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                                >
                                  {p.nombre}
                                </Link>
                              ) : (
                                p.nombre
                              )}
                              {p.general && <span className="ml-1.5 text-[11px]">sin repartir</span>}
                              {/* Corregir el número de esa variante en esa bodega y marcar unidades defectuosas, sin salir de la ficha del principal (19 nov 2026, pedido de Jhokser). El stock general sin repartir es del propio principal. */}
                              {puedeCorregir && !sku.manejaVencimiento && b.tipo !== "externa" && puedeEnBodega(b.bodegaId) && (
                                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  <CorregirStock
                                    key={`${p.clave}-${b.bodegaId}-corregir-${version}`}
                                    skuId={p.general ? sku.id : p.clave}
                                    nombre={p.general ? "el stock general" : p.nombre}
                                    enLinea
                                    bodegas={[{ bodegaId: b.bodegaId, nombre: b.nombre, fisico: p.cubetas.fisico }]}
                                    lotes={[]}
                                    manejaVencimiento={false}
                                    alGuardar={() => {
                                      setVersion((v) => v + 1);
                                      alCambiar();
                                    }}
                                  />
                                  <PanelDefectuoso
                                    key={`${p.clave}-${b.bodegaId}-defectuoso-${version}`}
                                    nombre={p.general ? "el stock general" : p.nombre}
                                    enLinea
                                    opciones={[{ skuId: p.general ? sku.id : p.clave, nombre: p.general ? "Stock general" : p.nombre, bodegas: [{ bodegaId: b.bodegaId, nombre: b.nombre, disponible: p.cubetas.disponible, danado: p.cubetas.danado }] }]}
                                    puedeBaja={puedeMoverAMano("salida", codigoPais, esAdmin)}
                                    alGuardar={() => {
                                      setVersion((v) => v + 1);
                                      alCambiar();
                                    }}
                                  />
                                </span>
                              )}
                            </th>
                            {valoresDe(p.cubetas).map((n, i) => (
                              <td key={i} className="px-1.5 py-1 text-right text-xs">
                                <Cifra n={n} />
                              </td>
                            ))}
                          </tr>
                        ))}
                        {enProveedor !== null && (
                          <tr className="border-t border-border">
                            <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                              Dropi · Proveedor Ecomfive{codigoPais.toUpperCase() === "PA" ? " (B81)" : ""}
                              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">según Dropi · referencial</span>
                            </th>
                            {[enProveedor, 0, enProveedor, 0, 0, 0, 0, 0].map((n, i) => (
                              <td key={i} className="px-1.5 py-1.5 text-right">
                                <Cifra n={n} />
                              </td>
                            ))}
                          </tr>
                        )}
                        </Fragment>
                        );
                      })}
                      {datos.variantes.length > 0 && datos.bodegas.length > 1 && (
                        <tr className="border-t-2 border-border font-semibold">
                          <th scope="row" className="py-1.5 pr-2 text-left">
                            Total en bodegas propias
                          </th>
                          {valoresDe(totalPropias(datos.bodegas, datos.variantes)).map((n, i) => (
                            <td key={i} className="px-1.5 py-1.5 text-right">
                              <Cifra n={n} />
                            </td>
                          ))}
                        </tr>
                      )}
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
                            {!!l.exclusivo && <span className="text-muted-foreground"> · {l.exclusivo.toLocaleString("es-PA")} u. exclusivas de clientes</span>}
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

            {/* El costo viene de la hoja de Costos de producto (0992): aquí solo se ve, no se edita. */}
            <Seccion icono={GastoIcon} titulo="Costo">
              <CostoProductoBloque key={sku.id} skuId={sku.id} />
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
                        Desde {e.desde} · <FechaHora iso={e.enviadoEn} />
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
                          {m.usuario ? ` · ${m.usuario}` : ""} · <FechaHora iso={m.creadoEn} />
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
    <FichaProductoEmbebida
      productoId={productoAbierto}
      alCerrar={() => {
        setProductoAbierto(null);
        // Lo cambiado allá (variantes, nombre, unir) se vuelve a pedir aquí y en la tabla.
        setVersion((v) => v + 1);
        alCambiar();
      }}
    />
    </Ventana>
  );
}
