"use client";

import { Fragment, useMemo, useState } from "react";
import {
  archivarPedidoInventario,
  cancelarPedidoInventario,
  crearPedidoInventario,
  deshacerEntregaPedidoInventario,
  deshacerEnvioPedidoInventario,
  reabrirPedidoInventario,
  volverASolicitudPedido,
  editarPedidoInventario,
  enviarPedidoInventario,
  marcarEnProcesoItems,
  ponerEnProcesoPedido,
  recibirPedidoInventario,
} from "@/app/(app)/despacho-ciudad/pedir-inventario/actions";
import { Indicador, TableroIndicadores } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaStock, type SkuFicha } from "@/app/(app)/inventario/ficha-stock";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { usePlegado } from "@/app/(app)/crm-dropshippers/bandeja/usar-plegado";
import { CalendarioIcon, CheckIcon, DescargarIcon, EnvioIcon, FlechaAbajoIcon, FlechaArribaIcon, InventarioIcon, PedidoIcon } from "@/lib/nav-icons";
import {
  cambiosDeEdicion,
  agruparPorBodega,
  partirPorBodega,
  ESTADOS,
  estadoDe,
  fechaCorta,
  MAX_LINEAS,
  repartirSugerido,
  numeroPedido,
  puedeCancelar,
  puedeEditar,
  puedeEnProceso,
  puedeEnviar,
  puedeArchivar,
  puedeDeshacerEntrega,
  puedeDeshacerEnvio,
  puedeReabrir,
  puedeRecibir,
  puedeVolverASolicitud,
  estadoAntesDeEnviar,
  type EstadoPedido,
  type GrupoBodega,
  type PedidoInventario,
  type StockInventario,
} from "@/lib/pedidos-inventario/reglas";
import { BOTON_PEDIDO, useAccion } from "./comun";
import { ConfirmarRecepcion, PorBodega, RepartoBodegas, type EnProceso, type Seleccion } from "./envio";

// Pedir a inventario (16 nov 2026, migración 0305; prototipo aprobado https://claude.ai/artifact/ReVGwYZrBG11rmKFUT7V5T): la tabla
// del Excel que reemplaza (N.º, código, producto, cantidades, fecha, quién, estado, observaciones), con los botones de cada lado.

const PRINCIPAL = BOTON_PEDIDO.principal;
const SECUNDARIO = BOTON_PEDIDO.secundario;
const DESCARGA = BOTON_PEDIDO.descarga;
const ARCHIVO = BOTON_PEDIDO.archivo;
const DESHACER = BOTON_PEDIDO.deshacer;
// «En proceso» por producto (27 nov 2026): morado suave para marcar, gris para volver a pendiente.
const BOTON_EN_PROCESO = `inline-flex min-h-7 items-center rounded-md border border-primario/30 bg-primario-suave px-2 text-[11px] font-semibold whitespace-nowrap text-primario hover:brightness-95 disabled:opacity-50 ${anilloFoco}`;
const BOTON_A_PENDIENTE = `inline-flex min-h-7 items-center rounded-md border border-border-control bg-card px-2 text-[11px] font-semibold whitespace-nowrap text-muted-foreground hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

interface Linea {
  clave: number;
  sku: OpcionSkuMaestro | null;
  cantidad: string;
  nota: string;
}

/** Despacho: «+ Nueva solicitud» abre las líneas (producto de la lista, cantidad y nota) y «Enviar solicitud» la manda a inventario. */
export function NuevoPedido({ opciones, stock, bodegas }: { opciones: OpcionSkuMaestro[]; stock: Record<string, StockInventario>; bodegas: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const [siguiente, setSiguiente] = useState(1);
  const [lineas, setLineas] = useState<Linea[]>([{ clave: 0, sku: null, cantidad: "", nota: "" }]);
  const { ocupado, correr } = useAccion();
  const cambiar = (clave: number, c: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...c } : l)));
  const agregar = () => {
    setLineas((ls) => [...ls, { clave: siguiente, sku: null, cantidad: "", nota: "" }]);
    setSiguiente((n) => n + 1);
  };
  const reiniciar = () => {
    setLineas([{ clave: 0, sku: null, cantidad: "", nota: "" }]);
    setAbierto(false);
  };
  // No se pide lo que inventario no tiene (19 nov 2026): un producto sin stock o más unidades de las que hay no dejan enviar.
  const hayDe = (l: Linea) => (l.sku ? (stock[l.sku.id]?.total ?? 0) : 0);
  const listo = lineas.every((l) => l.sku && Number(l.cantidad) > 0 && hayDe(l) > 0 && Number(l.cantidad) <= hayDe(l));
  // Cómo va a salir: un pedido por bodega, según dónde haya (26 nov 2026). Es la misma cuenta que hace el servidor.
  const porNombre: Record<string, Record<string, number>> = {};
  for (const [sku, x] of Object.entries(stock)) for (const b of x.bodegas) (porNombre[b.nombre] ??= {})[sku] = b.disponible;
  const saldran = partirPorBodega(
    lineas.flatMap((l) => (l.sku && Number(l.cantidad) > 0 ? [{ skuId: l.sku.id, nombre: l.sku.nombre, cantidad: Number(l.cantidad) }] : [])),
    bodegas,
    porNombre,
  );

  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className={PRINCIPAL}>
        + Nueva solicitud
      </button>
    );
  return (
    <form
      className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        correr(() => crearPedidoInventario(lineas.map((l) => ({ skuId: l.sku?.id, cantidad: l.cantidad, nota: l.nota }))), reiniciar);
      }}
    >
      <h2 className="m-0 text-sm font-semibold">Nueva solicitud de inventario</h2>
      <ProveedorSkusMaestros opciones={opciones}>
        <div className="flex flex-col gap-2">
          {lineas.map((l, i) => (
            <div key={l.clave} className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-[240px] flex-[3_1_300px] flex-col gap-1 text-sm">
                {i === 0 && <span className="font-medium">Producto</span>}
                <CampoSkuMaestro valor={l.sku?.id ?? null} alCambiar={(o) => cambiar(l.clave, { sku: o })} etiquetaAria={`Producto ${i + 1}`} placeholder="Escribe parte del nombre, el SKU o el N.º" claseContenedor="w-full" />
              </div>
              <label className="flex w-28 flex-col gap-1 text-sm">
                <span className={i === 0 ? "font-medium" : "sr-only"}>Cantidad</span>
                <input type="number" inputMode="numeric" min={1} max={l.sku ? Math.max(1, hayDe(l)) : undefined} step={1} disabled={!!l.sku && hayDe(l) <= 0} value={l.cantidad} onChange={(e) => cambiar(l.clave, { cantidad: e.target.value })} className={fieldClass} />
              </label>
              <label className="flex min-w-[200px] flex-[2_1_240px] flex-col gap-1 text-sm">
                <span className={i === 0 ? "font-medium" : "sr-only"}>
                  Nota <span className="font-normal text-muted-foreground">(opcional)</span>
                </span>
                <input type="text" maxLength={300} value={l.nota} onChange={(e) => cambiar(l.clave, { nota: e.target.value })} placeholder="Ej.: se agotó en el estante" className={fieldClass} />
              </label>
              <button
                type="button"
                aria-label={`Quitar producto ${i + 1}`}
                disabled={lineas.length === 1}
                onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                className={`${SECUNDARIO} min-w-9 px-0 text-muted-foreground`}
              >
                ×
              </button>
              {l.sku && (
                <div className="basis-full">
                  <HayEnInventario hay={stock[l.sku.id]} pedido={Number(l.cantidad) || 0} />
                </div>
              )}
            </div>
          ))}
        </div>
      </ProveedorSkusMaestros>
      {listo && saldran.length > 0 && (
        <div className="flex flex-col gap-1.5" aria-live="polite">
          <p className="m-0 text-xs text-muted-foreground">
            {saldran.length === 1 ? "Saldrá como un pedido:" : `Saldrá como ${saldran.length} pedidos, uno por bodega:`}
          </p>
          <PorBodega
            titulo={false}
            grupos={saldran.map((g) => ({ bodegaId: g.bodegaId, bodega: g.bodegaId, unidades: g.lineas.reduce((t, l) => t + l.cantidad, 0), lineas: g.lineas.map((l) => ({ producto: l.nombre, codigo: null, cantidad: l.cantidad })) }))}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={agregar} disabled={lineas.length >= MAX_LINEAS} className={SECUNDARIO}>
          + Otro producto
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={reiniciar} className={SECUNDARIO}>
            Cerrar
          </button>
          <button type="submit" disabled={ocupado || !listo} className={PRINCIPAL}>
            {ocupado ? "Enviando…" : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Cuánto hay en inventario del producto elegido, con el detalle por bodega; en rojo si no hay o si se pide más de lo que hay. */
function HayEnInventario({ hay, pedido }: { hay: StockInventario | undefined; pedido: number }) {
  const total = hay?.total ?? 0;
  if (total <= 0)
    return (
      <span role="alert" className="text-xs font-semibold text-destructive">
        Sin stock en inventario: no se puede pedir.
      </span>
    );
  const detalle = (hay?.bodegas ?? []).map((b) => `${b.nombre} ${b.disponible.toLocaleString("es-PA")}`).join(" · ");
  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      Hay en inventario: <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString("es-PA")}</span>
      {detalle && <span> ({detalle})</span>}
      {pedido > total && <span className="block font-semibold text-destructive">Pides más de lo que hay: pide {total.toLocaleString("es-PA")} o menos.</span>}
    </span>
  );
}

interface LineaEdicion {
  clave: number;
  /** La línea que ya existía en el pedido (null = producto nuevo). */
  id: string | null;
  sku: OpcionSkuMaestro | null;
  skuId: string | null;
  nombre: string;
  cantidad: string;
  nota: string;
}

/**
 * Despacho edita su pedido (20 nov 2026, pedido de Jhokser): quita productos, cambia cantidades o notas y agrega productos mientras inventario no lo haya enviado. Lo que se sube de cantidad o se agrega se compara con
 * lo que hay en inventario, como al hacer un pedido; lo que no cambia no. Un pedido no puede quedar vacío: para quitarlo todo se cancela.
 */
function EditarPedido({ p, opciones, stock }: { p: PedidoInventario; opciones: OpcionSkuMaestro[]; stock: Record<string, StockInventario> }) {
  const desdeElPedido = (): LineaEdicion[] => p.items.map((it, i) => ({ clave: i, id: it.id, sku: null, skuId: it.skuId, nombre: it.producto, cantidad: String(it.cantidadPedida), nota: it.nota ?? "" }));
  const [abierto, setAbierto] = useState(false);
  const [lineas, setLineas] = useState<LineaEdicion[]>(desdeElPedido);
  const [siguiente, setSiguiente] = useState(p.items.length);
  const { ocupado, correr } = useAccion();
  const abrir = () => {
    setLineas(desdeElPedido());
    setSiguiente(p.items.length);
    setAbierto(true);
  };
  const cambiar = (clave: number, c: Partial<LineaEdicion>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...c } : l)));
  const agregar = () => {
    setLineas((ls) => [...ls, { clave: siguiente, id: null, sku: null, skuId: null, nombre: "", cantidad: "", nota: "" }]);
    setSiguiente((n) => n + 1);
  };

  const editadas = lineas.map((l) => ({ id: l.id, skuId: l.skuId ?? "", cantidad: Number(l.cantidad), nota: l.nota.trim() || null }));
  const antes = p.items.map((it) => ({ id: it.id, skuId: it.skuId, producto: it.producto, cantidad: it.cantidadPedida, nota: it.nota }));
  const nombres = Object.fromEntries([...p.items.map((it) => [it.skuId, it.producto]), ...lineas.flatMap((l) => (l.sku && l.skuId ? [[l.skuId, l.sku.nombre]] : []))]);
  const cambios = cambiosDeEdicion(antes, editadas.filter((l) => l.skuId), nombres);
  const previas = new Map(p.items.map((it) => [it.id, it.cantidadPedida]));
  const hayDe = (skuId: string | null) => (skuId ? (stock[skuId]?.total ?? 0) : 0);
  // Solo lo nuevo o lo que sube de cantidad se compara con lo que hay en inventario.
  const sinStock = (l: LineaEdicion) => {
    const cant = Number(l.cantidad);
    const sube = !l.id || cant > (previas.get(l.id) ?? 0);
    return sube && (hayDe(l.skuId) <= 0 || cant > hayDe(l.skuId));
  };
  const repetido = new Set(lineas.map((l) => l.skuId).filter(Boolean)).size < lineas.filter((l) => l.skuId).length;
  const listo = lineas.length > 0 && !repetido && lineas.every((l) => l.skuId && Number.isInteger(Number(l.cantidad)) && Number(l.cantidad) >= 1 && !sinStock(l)) && cambios.resumen.length > 0;

  return (
    <>
      <button type="button" onClick={abrir} aria-haspopup="dialog" className={SECUNDARIO}>
        Editar
      </button>
      <Ventana abierto={abierto} alCerrar={() => setAbierto(false)} titulo={`Editar ${numeroPedido(p.numero)}`} ancho="lg">
        <form
          className="flex flex-col gap-4 p-5 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ocupado && listo) correr(() => editarPedidoInventario(p.id, editadas), () => setAbierto(false));
          }}
        >
          <ProveedorSkusMaestros opciones={opciones}>
            <div className="flex flex-col gap-2">
              {lineas.map((l, i) => (
                <div key={l.clave} className={`flex flex-wrap items-end gap-2 ${i > 0 ? "border-t border-border pt-2" : ""}`}>
                  {/* Nombre arriba a todo el ancho; nota, cantidad y quitar en la fila de abajo (27 nov 2026, pedido de Hernán: se veía enredado). */}
                  <div className="flex basis-full flex-col gap-1">
                    {i === 0 && <span className="font-medium">Producto</span>}
                    {l.id ? (
                      <span className="flex min-h-9 items-center font-medium">{l.nombre}</span>
                    ) : (
                      <CampoSkuMaestro valor={l.skuId} alCambiar={(o) => cambiar(l.clave, { sku: o, skuId: o?.id ?? null, nombre: o?.nombre ?? "" })} etiquetaAria={`Producto nuevo ${i + 1}`} placeholder="Escribe parte del nombre, el SKU o el N.º" claseContenedor="w-full" />
                    )}
                  </div>
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={i === 0 ? "font-medium" : "sr-only"}>
                      Nota <span className="font-normal text-muted-foreground">(opcional)</span>
                    </span>
                    <input type="text" maxLength={300} value={l.nota} onChange={(e) => cambiar(l.clave, { nota: e.target.value })} className={fieldClass} />
                  </label>
                  <label className="flex w-28 flex-col gap-1">
                    <span className={i === 0 ? "font-medium" : "sr-only"}>Cantidad</span>
                    <input type="number" inputMode="numeric" min={1} step={1} value={l.cantidad} onChange={(e) => cambiar(l.clave, { cantidad: e.target.value })} className={fieldClass} />
                  </label>
                  <button type="button" aria-label={`Quitar ${l.nombre || `el producto ${i + 1}`} del pedido`} onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))} className={`${SECUNDARIO} min-w-9 px-0 text-muted-foreground`}>
                    ×
                  </button>
                  {l.skuId && sinStock(l) && (
                    <span role="alert" className="basis-full text-xs font-semibold text-destructive">
                      {hayDe(l.skuId) <= 0 ? "Sin stock en inventario: no se puede pedir." : `Solo hay ${hayDe(l.skuId).toLocaleString("es-PA")} en inventario: pide ${hayDe(l.skuId).toLocaleString("es-PA")} o menos.`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </ProveedorSkusMaestros>
          {lineas.length === 0 && (
            <p role="alert" className="m-0 text-xs font-semibold text-destructive">
              El pedido no puede quedar vacío: para quitarlo todo, cancélalo.
            </p>
          )}
          {repetido && (
            <p role="alert" className="m-0 text-xs font-semibold text-destructive">
              Un producto está dos veces en el pedido.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={agregar} disabled={lineas.length >= MAX_LINEAS} className={SECUNDARIO}>
              + Agregar producto
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAbierto(false)} className={SECUNDARIO}>
                Cerrar
              </button>
              <button type="submit" disabled={ocupado || !listo} className={PRINCIPAL}>
                {ocupado ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
          {cambios.resumen.length > 0 && <p className="m-0 text-xs text-muted-foreground">Cambios: {cambios.resumen.join("; ")}.</p>}
        </form>
      </Ventana>
    </>
  );
}

const TD = "border-b border-border px-2 py-2 align-top";
/** La última fila de cada pedido cierra con una línea más gruesa para que se lea dónde termina uno y empieza el siguiente. */
const TD_FIN = "border-b-2 border-border-control px-2 py-2 align-top";

/**
 * Cuánto hay del producto en cada bodega de donde inventario envía (20 nov 2026, pedido de Hernán: «si sale general no sabré de dónde sale»): las de donde
 * sale en negrita (aunque tengan 0) y las demás que tienen algo. Descuenta lo que va en camino en otros pedidos.
 * `soloLectura` = el pedido ya no se envía: sin alarmas.
 */
function StockPorBodega({ skuId, usadas, origenes, stock, soloLectura = false }: { skuId: string; usadas: Set<string>; origenes: { id: string; nombre: string }[]; stock: Record<string, Record<string, number>>; soloLectura?: boolean }) {
  const filas = origenes.map((b) => ({ ...b, hay: stock[b.id]?.[skuId] ?? 0 })).filter((b) => usadas.has(b.id) || b.hay > 0);
  if (!filas.some((b) => b.hay > 0)) return soloLectura ? <span className="text-muted-foreground">Sin stock hoy</span> : <span className="font-semibold text-destructive">Sin stock en ninguna bodega</span>;
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0 whitespace-nowrap">
      {filas.map((b) => (
        <li key={b.id} className={usadas.has(b.id) ? "font-semibold text-foreground" : "text-muted-foreground"}>
          {b.nombre} <span className="tabular-nums">{b.hay.toLocaleString("es-PA")}</span>
          {usadas.has(b.id) && <span className="sr-only"> (de aquí sale)</span>}
        </li>
      ))}
    </ul>
  );
}

/** «Descargar PDF» de un pedido: lo arma en el navegador (pdf-lib, cargado al pulsar) y lo baja; lo puede usar quien abra el módulo, aunque solo lea. */
function BotonPdfPedido({ p, grupos }: { p: PedidoInventario; grupos: GrupoBodega[] }) {
  const { mostrarToast } = useToast();
  const [armando, setArmando] = useState(false);
  const descargar = async () => {
    if (armando) return;
    setArmando(true);
    try {
      const { pedidoAPdf, nombreArchivoPedido } = await import("@/lib/pedidos-inventario/pdf");
      const bytes = await pedidoAPdf(p, new Date(), grupos);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivoPedido(p);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      mostrarToast("No se pudo armar el PDF. Inténtalo de nuevo.", "destructive");
    } finally {
      setArmando(false);
    }
  };
  return (
    <button type="button" onClick={descargar} disabled={armando} aria-label={`Descargar el pedido ${numeroPedido(p.numero)} en PDF`} className={`${DESCARGA} gap-1.5`}>
      <DescargarIcon className="h-4 w-4" aria-hidden="true" />
      {armando ? "Armando…" : "Descargar PDF"}
    </button>
  );
}

/** La bodega que le toca al pedido y los otros pedidos que salieron de la misma lista. */
function BodegaDelPedido({ p, hermanos }: { p: PedidoInventario; hermanos: string[] }) {
  if (!p.bodegaAsignada) return null;
  return (
    <span className="mt-1 flex flex-col items-start gap-0.5 whitespace-normal">
      <Badge tone="neutral">{p.bodegaAsignada.nombre}</Badge>
      {hermanos.length > 0 && <span className="max-w-[9rem] text-xs font-normal text-muted-foreground">Misma lista: {hermanos.join(", ")}</span>}
    </span>
  );
}

/** Las filas de un pedido (una por producto, el N.º y los botones a la izquierda y a la derecha, como en el Excel). */
function FilasPedido({
  p,
  modo,
  puedeEscribir,
  origenes,
  stock,
  abrirFicha,
  opciones,
  hayEnInventario,
  columnas,
  fotos,
  sinConfirmacion,
  sinEnProceso,
  soloEnProceso = false,
  hermanos,
}: {
  p: PedidoInventario;
  /** Los números de los otros pedidos de la misma lista. */
  hermanos: string[];
  columnas: number;
  /** Falta la migración 0368: no se puede enviar. */
  sinConfirmacion: boolean;
  /** Falta la migración 0371: sin «En proceso» por producto. */
  sinEnProceso: boolean;
  /** La tarjeta «En proceso» está elegida (27 nov 2026, pedido de Hernán): en cada pedido se ve solo lo marcado en proceso. */
  soloEnProceso?: boolean;
  modo: "despacho" | "inventario";
  puedeEscribir: boolean;
  origenes: { id: string; nombre: string }[];
  stock: Record<string, Record<string, number>>;
  /** Los productos que despacho puede pedir y lo que hay de cada uno en inventario (para editar un pedido). */
  opciones: OpcionSkuMaestro[];
  hayEnInventario: Record<string, StockInventario>;
  /** Abre la ficha de stock del producto (null = no se puede: falta el permiso de Inventario). */
  abrirFicha: ((skuId: string) => void) | null;
  /** La foto de cada producto (23 nov 2026: se agranda al pasar el cursor o con un toque). */
  fotos: Record<string, string>;
}) {
  const { ocupado, correr } = useAccion();
  const enInventario = modo === "inventario";
  const editable = enInventario && puedeEscribir && puedeEnviar(p.estado);
  // De qué bodega sale cada producto (26 nov 2026): viene sugerido (donde alcanza) y se puede cambiar o repartir entre varias.
  // Lo sugerido se calcula con los productos de hoy (también los que se agregan al editar); lo que se cambia a mano se guarda aparte y manda.
  const asignada = p.bodegaAsignada?.id ?? null;
  const sugerido = useMemo(
    () => repartirSugerido(p.items.map((it) => ({ id: it.id, skuId: it.skuId, cantidad: it.cantidadPedida })), origenes.map((b) => b.id), stock, asignada),
    [p.items, origenes, stock, asignada],
  );
  const [reparto, setReparto] = useState<Record<string, { bodegaId: string; cantidad: number | string }[]>>({});
  const [observaciones, setObservaciones] = useState<Record<string, string>>({});
  // Qué productos van en este envío (26 nov 2026, pedido de Hernán): los no marcados pasan a otro pedido, pendientes.
  const [quedan, setQuedan] = useState<Set<string>>(() => new Set());
  const n = p.items.length;
  const seleccion: Seleccion | undefined =
    editable && n > 1
      ? {
          va: (itemId) => !quedan.has(itemId),
          marcar: (ids, valor) =>
            setQuedan((q) => {
              const x = new Set(q);
              for (const id of ids) {
                if (valor) x.delete(id);
                else x.add(id);
              }
              return x;
            }),
        }
      : undefined;
  // «En proceso» por producto (27 nov 2026, pedido de Hernán; migración 0371; prototipo aprobado https://claude.ai/artifact/Sk4X5u2xDoWWuSbhAuS8m3): lo que ya se está preparando
  // se oculta de lo pendiente, en las filas y en las tarjetas por bodega; «Ver pedido completo» lo muestra todo.
  const [completo, setCompleto] = useState(false);
  const conEnProceso = editable && !sinEnProceso;
  const estaEnProceso = (it: { enProcesoEn?: string | null } | undefined) => conEnProceso && !!it?.enProcesoEn;
  const cuantosEnProceso = p.items.filter((it) => estaEnProceso(it)).length;
  const marcarProceso = (ids: string[], valor: boolean) => correr(() => marcarEnProcesoItems(p.id, ids, valor));
  const enProceso: EnProceso | undefined = conEnProceso ? { esta: (id) => estaEnProceso(p.items.find((x) => x.id === id)), marcar: marcarProceso, completo, ocupado } : undefined;
  // Con la tarjeta «En proceso» elegida se ve solo lo marcado en proceso (si el pedido se puso entero en proceso sin marcar productos, se ve todo).
  const vistaEnProceso = soloEnProceso && conEnProceso && cuantosEnProceso > 0 && !completo;
  const filas = !conEnProceso || completo ? p.items : vistaEnProceso ? p.items.filter((it) => estaEnProceso(it)) : soloEnProceso && cuantosEnProceso === 0 ? p.items : p.items.filter((it) => !estaEnProceso(it));
  const vanAhora = p.items.filter((it) => !quedan.has(it.id));
  const pendientes = n - vanAhora.length;
  const partesDe = (itemId: string) => (reparto[itemId] ?? sugerido[itemId] ?? []).map((x) => ({ bodegaId: x.bodegaId, cantidad: Math.max(0, Math.floor(Number(x.cantidad) || 0)) }));
  const noAlcanza = editable && vanAhora.some((it) => partesDe(it.id).some((x) => x.cantidad > Math.max(0, stock[x.bodegaId]?.[it.skuId] ?? 0)));
  const nadaQueEnviar = editable && vanAhora.every((it) => partesDe(it.id).every((x) => x.cantidad === 0));
  const envios = p.envios ?? [];
  /** Enviado con confirmación pendiente (sin traslado todavía): lo de antes del 26 nov 2026 no tiene envíos. */
  const porConfirmar = envios.length > 0;
  const confirmados = envios.filter((e) => e.cantidadRecibida !== null).length;
  // Qué buscar en cada bodega: lo que se está preparando o lo que ya se envió.
  const grupos = agruparPorBodega(
    p.items,
    editable ? p.items.flatMap((it) => partesDe(it.id).map((x) => ({ itemId: it.id, ...x }))) : envios.map((e) => ({ itemId: e.itemId, bodegaId: e.bodegaId, cantidad: e.cantidadRecibida ?? e.cantidadEnviada })),
    origenes,
  );
  const conGrupos = enInventario && (editable || porConfirmar);
  // El PDF lleva solo lo que va en este envío.
  const gruposPdf = vanAhora.length < n ? agruparPorBodega(vanAhora, vanAhora.flatMap((it) => partesDe(it.id).map((x) => ({ itemId: it.id, ...x }))), origenes) : grupos;
  const estado = estadoDe(p.estado);
  // «Deshacer entrega»: dos pasos (pulsar y confirmar) para que no se repita el error de marcarlo sin querer.
  const [deshaciendo, setDeshaciendo] = useState(false);
  // «Deshacer envío»: también en dos pasos, porque devuelve el inventario con un traslado de reversa.
  const [deshaciendoEnvio, setDeshaciendoEnvio] = useState(false);
  // Ocultar o desplegar la solicitud (23 nov 2026, pedido de Jhokser): se recuerda en el navegador de cada persona.
  const [plegado, alternarPlegado] = usePlegado(`pedido-inventario:${p.id}`);

  const acciones = (
    <div className="flex flex-col items-stretch gap-1.5">
      <span className="mb-0.5">
        <Badge tone={estado.tono}>{estado.etiqueta}</Badge>
      </span>
      <BotonPdfPedido p={p} grupos={enInventario ? gruposPdf : []} />
      {!puedeEscribir ? null : enInventario ? (
        <>
          {puedeEnProceso(p.estado) && (
            <button type="button" disabled={ocupado} onClick={() => correr(() => ponerEnProcesoPedido(p.id))} className={SECUNDARIO}>
              Pasar a «En proceso»
            </button>
          )}
          {/* Inventario (Dinora) también edita el pedido (27 nov 2026): quitar, agregar o cambiar cantidades; le avisa a quien lo pidió. */}
          {puedeEditar(p.estado) && <EditarPedido p={p} opciones={opciones} stock={hayEnInventario} />}
          {puedeEnviar(p.estado) && (
            <>
              {(noAlcanza || sinConfirmacion) && (
                <span role="alert" className="max-w-[12rem] text-xs font-semibold text-destructive">
                  {sinConfirmacion ? "Falta correr en Supabase la migración 0368." : "Hay una bodega donde no alcanza: baja la cantidad o saca de otra."}
                </span>
              )}
              <button
                type="button"
                disabled={ocupado || noAlcanza || nadaQueEnviar || sinConfirmacion || vanAhora.length === 0}
                onClick={() =>
                  correr(() =>
                    enviarPedidoInventario(
                      p.id,
                      vanAhora.map((it) => ({ id: it.id, partes: partesDe(it.id), observacion: observaciones[it.id] ?? "" })),
                      p.items.filter((it) => quedan.has(it.id)).map((it) => it.id),
                    ),
                  )
                }
                className={PRINCIPAL}
              >
                {ocupado ? "Enviando…" : pendientes ? `Enviar ${vanAhora.length} de ${n}` : "Enviar"}
              </button>
              {pendientes > 0 && (
                <span className="max-w-[12rem] text-xs text-muted-foreground" aria-live="polite">
                  {vanAhora.length === 0
                    ? "Marca al menos un producto para enviar."
                    : `${pendientes === 1 ? "El otro producto queda pendiente" : `Los otros ${pendientes} quedan pendientes`} en un pedido nuevo de la misma lista, en «${estado.etiqueta}».`}
                </span>
              )}
            </>
          )}
          {puedeVolverASolicitud(p.estado) && (
            <button type="button" disabled={ocupado} onClick={() => correr(() => volverASolicitudPedido(p.id))} className={DESHACER}>
              Volver a «Solicitud»
            </button>
          )}
          {puedeRecibir(p.estado) && (
            <>
              <span className="max-w-[12rem] text-xs text-muted-foreground">
                {porConfirmar ? `Despacho confirmó ${confirmados} de ${envios.length}. El inventario se mueve cuando lo reciba.` : "Esperando que despacho lo reciba"}
              </span>
              {puedeDeshacerEnvio(p.estado) && (porConfirmar || p.traslado) &&
                (deshaciendoEnvio ? (
                  <div className="flex max-w-[14rem] flex-col gap-1.5 rounded-md bg-muted p-2">
                    <span className="text-xs">
                      ¿Deshacer el envío? {porConfirmar ? "No se ha movido inventario; se pierde lo que despacho haya confirmado." : "Lo enviado vuelve a la bodega de origen con un traslado de reversa."} El pedido vuelve a «{estadoAntesDeEnviar(p.enProcesoEn, p.enviadoEn) === "solicitud" ? "Solicitud" : "En proceso"}».
                    </span>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => {
                        setDeshaciendoEnvio(false);
                        correr(() => deshacerEnvioPedidoInventario(p.id));
                      }}
                      className={PRINCIPAL}
                    >
                      {ocupado ? "Deshaciendo…" : "Sí, deshacer el envío"}
                    </button>
                    <button type="button" disabled={ocupado} onClick={() => setDeshaciendoEnvio(false)} className={SECUNDARIO}>
                      No
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDeshaciendoEnvio(true)} className={DESHACER}>
                    Deshacer envío
                  </button>
                ))}
            </>
          )}
        </>
      ) : (
        <>
          {puedeEditar(p.estado) && <EditarPedido p={p} opciones={opciones} stock={hayEnInventario} />}
          {puedeRecibir(p.estado) &&
            (porConfirmar ? (
              <ConfirmarRecepcion p={p} fotos={fotos} />
            ) : (
              <button type="button" disabled={ocupado} onClick={() => correr(() => recibirPedidoInventario(p.id))} className={PRINCIPAL}>
                Recibido
              </button>
            ))}
          {puedeCancelar(p.estado) && (
            <button type="button" disabled={ocupado} onClick={() => correr(() => cancelarPedidoInventario(p.id))} className={SECUNDARIO}>
              Cancelar
            </button>
          )}
          {puedeReabrir(p.estado) && !p.archivadoEn && (
            <button type="button" disabled={ocupado} onClick={() => correr(() => reabrirPedidoInventario(p.id))} className={DESHACER}>
              Reabrir pedido
            </button>
          )}
        </>
      )}
      {puedeEscribir && puedeArchivar(p.estado) && (
        <button type="button" disabled={ocupado} onClick={() => correr(() => archivarPedidoInventario(p.id, !p.archivadoEn))} className={ARCHIVO}>
          {p.archivadoEn ? "Sacar del archivo" : "Archivar pedido"}
        </button>
      )}
      {/* Deshacer una recepción confirmada mueve inventario: solo inventario. Las de antes no lo mueven y las puede deshacer cualquiera de los dos lados. */}
      {puedeEscribir && puedeDeshacerEntrega(p.estado) && !p.archivadoEn && (enInventario || !porConfirmar) &&
        (deshaciendo ? (
          <div className="flex flex-col gap-1.5 rounded-md bg-muted p-2">
            <span className="text-xs">¿Volver este pedido a «Enviado»? {porConfirmar ? "Lo recibido vuelve a sus bodegas con traslados de reversa." : "No cambia el inventario."}</span>
            <button type="button" disabled={ocupado} onClick={() => {
                setDeshaciendo(false);
                correr(() => deshacerEntregaPedidoInventario(p.id));
              }}
              className={PRINCIPAL}
            >
              {ocupado ? "Deshaciendo…" : "Sí, deshacer"}
            </button>
            <button type="button" disabled={ocupado} onClick={() => setDeshaciendo(false)} className={SECUNDARIO}>
              No
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setDeshaciendo(true)} className={DESHACER}>
            Deshacer entrega
          </button>
        ))}
    </div>
  );

  const alternar = (
    <button
      type="button"
      onClick={alternarPlegado}
      aria-expanded={!plegado}
      aria-label={`${plegado ? "Desplegar" : "Ocultar"} el pedido ${numeroPedido(p.numero)}`}
      className={`mt-1 inline-flex items-center gap-1 rounded text-xs font-medium text-primario underline-offset-2 hover:underline ${anilloFoco}`}
    >
      {plegado ? <FlechaAbajoIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <FlechaArribaIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      {plegado ? "Desplegar" : "Ocultar"}
    </button>
  );

  /** La celda del N.º del pedido, con «Ver pedido completo» cuando hay productos en proceso. */
  const celdaNumero = (filasQueAbarca: number) => (
    <td rowSpan={filasQueAbarca} className={`${TD_FIN} bg-primario-suave px-3 whitespace-nowrap`}>
      <span className="block font-semibold text-primario">{numeroPedido(p.numero)}</span>
      <span className="block text-xs font-normal text-muted-foreground">{fechaCorta(p.creadoEn)}</span>
      <BodegaDelPedido p={p} hermanos={hermanos} />
      {alternar}
      {enProceso && cuantosEnProceso > 0 && (
        <span className="mt-2 flex flex-col items-start gap-1 border-t border-primario/20 pt-2 text-xs whitespace-normal">
          <span className="text-foreground">
            <b>{(n - cuantosEnProceso).toLocaleString("es-PA")}</b> pendientes · <b>{cuantosEnProceso.toLocaleString("es-PA")}</b> en proceso
          </span>
          <button type="button" onClick={() => setCompleto((c) => !c)} aria-pressed={completo} className={`rounded text-left font-medium text-primario underline-offset-2 hover:underline ${anilloFoco}`}>
            {completo ? (soloEnProceso ? "Ver solo en proceso" : "Ver solo pendientes") : "Ver pedido completo"}
          </button>
        </span>
      )}
    </td>
  );

  // Plegado: una sola fila con el N.º, un resumen de lo que lleva y el estado. Si falta enviarlo (inventario escribe las cantidades), no se ofrece «Enviar» sin ver los productos.
  if (plegado) {
    const unidades = p.items.reduce((t, it) => t + it.cantidadPedida, 0);
    return (
      <tr>
        <td className={`${TD_FIN} bg-primario-suave px-3 whitespace-nowrap`}>
          <span className="block font-semibold text-primario">{numeroPedido(p.numero)}</span>
          <span className="block text-xs font-normal text-muted-foreground">{fechaCorta(p.creadoEn)}</span>
          <BodegaDelPedido p={p} hermanos={hermanos} />
          {alternar}
        </td>
        <td colSpan={Math.max(1, columnas - 2)} className={`${TD_FIN} text-muted-foreground`}>
          <p className="m-0">
            {n.toLocaleString("es-PA")} {n === 1 ? "producto" : "productos"} · {unidades.toLocaleString("es-PA")} unidades pedidas
          </p>
          {/* Plegado también se ven todos los datos de cada producto (23 nov 2026, pedido de Jhokser): pedida, stock por bodega (inventario), entregada y observaciones, como desplegado pero sin los campos para escribir. */}
          <div className="mt-1.5 overflow-x-auto">
            <div className={`grid min-w-[640px] gap-x-4 gap-y-1.5 text-xs ${enInventario ? "grid-cols-[minmax(0,2fr)_4rem_minmax(0,1.6fr)_4.5rem_minmax(0,1.6fr)]" : "grid-cols-[minmax(0,2fr)_4rem_4.5rem_minmax(0,1.6fr)]"}`}>
              <span className="font-semibold text-foreground">Producto</span>
              <span className="text-right font-semibold text-foreground">Pedida</span>
              {enInventario && <span className="font-semibold text-foreground">Stock por bodega</span>}
              <span className="text-right font-semibold text-foreground">Entregada</span>
              <span className="font-semibold text-foreground">Observaciones</span>
              {p.items.map((it, i) => {
                const hay = origenes.map((b) => ({ nombre: b.nombre, hay: stock[b.id]?.[it.skuId] ?? 0 })).filter((b) => b.hay > 0);
                const obs = [it.nota, it.observacion, ...notasDeDespacho(p, it.id), i === n - 1 && p.traslado ? p.traslado : null].filter(Boolean).join(" · ");
                return (
                  <Fragment key={it.id}>
                    <span className="font-medium text-foreground">{it.producto}</span>
                    <span className="text-right tabular-nums">{it.cantidadPedida.toLocaleString("es-PA")}</span>
                    {enInventario && <span>{hay.length ? hay.map((b) => `${b.nombre} ${b.hay.toLocaleString("es-PA")}`).join(" · ") : "Sin stock hoy"}</span>}
                    <span className="text-right tabular-nums">
                      {editable ? "—" : it.cantidadEntregada === null ? "0" : <span className="font-semibold text-foreground">{it.cantidadEntregada.toLocaleString("es-PA")}</span>}
                    </span>
                    <span>{obs || "—"}</span>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </td>
        <td className={`${TD_FIN} px-3`}>
          {editable ? (
            <span className="flex flex-col gap-1">
              <Badge tone={estado.tono}>{estado.etiqueta}</Badge>
              <span className="text-xs text-muted-foreground">Despliégalo para enviarlo.</span>
            </span>
          ) : (
            acciones
          )}
        </td>
      </tr>
    );
  }

  return (
    <>
      {filas.map((it, i) => {
        const ultima = i === filas.length - 1;
        const borde = ultima && !conGrupos ? TD_FIN : TD;
        const obs = [it.nota, it.observacion, ...notasDeDespacho(p, it.id), ultima && p.traslado ? p.traslado : null].filter(Boolean).join(" · ");
        const suyos = envios.filter((e) => e.itemId === it.id);
        return (
          <tr key={it.id} className={estaEnProceso(it) ? "bg-primario-suave/30" : undefined}>
            {i === 0 && celdaNumero(filas.length + (conGrupos ? 1 : 0))}
            <td className={`${borde} font-mono text-xs text-muted-foreground`}>{it.codigo ?? "—"}</td>
            <td className={`${borde} font-medium`}>
              <span className="flex items-start gap-2">
                <MiniaturaFoto url={fotos[it.skuId] ?? null} nombre={it.producto} />
                {abrirFicha && it.skuId ? (
                  <button
                    type="button"
                    onClick={() => abrirFicha(it.skuId)}
                    title="Ver cómo está repartido su stock"
                    className={`rounded text-left font-medium text-primario underline-offset-2 hover:underline ${anilloFoco}`}
                  >
                    {it.producto}
                  </button>
                ) : (
                  <span>{it.producto}</span>
                )}
              </span>
            </td>
            <td className={`${borde} text-right tabular-nums`}>{it.cantidadPedida.toLocaleString("es-PA")}</td>
            {/* En Comunicación despacho no van «Pedido por» ni «Responsable bodega» (20 nov 2026): siempre son las mismas personas. */}
            {!enInventario && <td className={borde}>{p.pedidoPorNombre ?? "—"}</td>}
            {!enInventario && <td className={`${borde} text-muted-foreground`}>{p.responsableNombre ?? "—"}</td>}
            {enInventario && (
              <td className={`${borde} text-xs`}>
                <StockPorBodega skuId={it.skuId} usadas={new Set(editable ? partesDe(it.id).filter((x) => x.cantidad > 0).map((x) => x.bodegaId) : suyos.map((e) => e.bodegaId))} origenes={origenes} stock={stock} soloLectura={!editable} />
              </td>
            )}
            <td className={`${borde} text-right tabular-nums`}>
              {editable ? (
                <div className="flex flex-col items-end gap-1 text-left">
                  {seleccion && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-foreground">
                      <input type="checkbox" checked={seleccion.va(it.id)} onChange={(e) => seleccion.marcar([it.id], e.target.checked)} className="h-4 w-4 accent-primario" />
                      {seleccion.va(it.id) ? "Va en este envío" : "Queda pendiente"}
                    </label>
                  )}
                  <div className={quedan.has(it.id) ? "pointer-events-none opacity-40" : undefined} inert={quedan.has(it.id) || undefined}>
                    <RepartoBodegas item={it} partes={(reparto[it.id] ?? sugerido[it.id] ?? []) as { bodegaId: string; cantidad: number }[]} alCambiar={(partes) => setReparto((x) => ({ ...x, [it.id]: partes }))} bodegas={origenes} stock={stock} />
                  </div>
                  {enProceso &&
                    (estaEnProceso(it) ? (
                      <span className="flex flex-wrap items-center justify-end gap-1.5 text-xs font-semibold text-primario">
                        En proceso{it.enProcesoPorNombre ? ` · ${it.enProcesoPorNombre}` : ""}
                        <button type="button" disabled={ocupado} onClick={() => marcarProceso([it.id], false)} className={BOTON_A_PENDIENTE}>
                          Volver a pendiente
                        </button>
                      </span>
                    ) : (
                      <button type="button" disabled={ocupado} onClick={() => marcarProceso([it.id], true)} className={BOTON_EN_PROCESO}>
                        Pasar a «En proceso»
                      </button>
                    ))}
                </div>
              ) : p.estado === "enviado" && porConfirmar ? (
                suyos.length ? (
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {suyos.map((e) => (
                      <li key={e.id}>
                        <span className="font-semibold">{e.cantidadEnviada.toLocaleString("es-PA")}</span> <span className="text-xs text-muted-foreground">{e.bodega}</span>
                        <span className={`block text-xs ${e.cantidadRecibida === null ? "text-muted-foreground" : e.cantidadRecibida === e.cantidadEnviada ? "text-success" : "font-semibold text-warning"}`}>
                          {e.cantidadRecibida === null ? "Sin confirmar" : `Llegaron ${e.cantidadRecibida.toLocaleString("es-PA")}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">No se envió</span>
                )
              ) : it.cantidadEntregada === null ? (
                <span className="text-muted-foreground">0</span>
              ) : (
                <>
                  <span className="font-semibold">{it.cantidadEntregada.toLocaleString("es-PA")}</span>
                  {suyos.length > 0 && <span className="block text-xs text-muted-foreground">{suyos.map((e) => e.bodega).join(", ")}</span>}
                </>
              )}
            </td>
            <td className={`${borde} min-w-[160px] text-muted-foreground`}>
              {editable ? (
                <div className="flex flex-col gap-1">
                  {it.nota && <span>{it.nota}</span>}
                  <label>
                    <span className="sr-only">Observaciones de {it.producto}</span>
                    <input
                      type="text"
                      maxLength={300}
                      placeholder="Observación (opcional)"
                      value={observaciones[it.id] ?? ""}
                      onChange={(e) => setObservaciones((x) => ({ ...x, [it.id]: e.target.value }))}
                      className={fieldClass}
                    />
                  </label>
                </div>
              ) : (
                obs || "—"
              )}
            </td>
            {i === 0 && (
              <td rowSpan={filas.length} className={`${TD_FIN} px-3`}>
                {acciones}
              </td>
            )}
          </tr>
        );
      })}
      {filas.length === 0 && (
        // Todo está en proceso: una sola fila con el aviso y los botones de siempre.
        <tr>
          {celdaNumero(1 + (conGrupos ? 1 : 0))}
          <td colSpan={Math.max(1, columnas - 2)} className={`${TD} text-sm text-muted-foreground`}>
            Todo el pedido está en proceso ({n.toLocaleString("es-PA")} {n === 1 ? "producto" : "productos"}).{" "}
            <button type="button" onClick={() => setCompleto(true)} className={`rounded font-medium text-primario underline-offset-2 hover:underline ${anilloFoco}`}>
              Ver pedido completo
            </button>
          </td>
          <td className={`${TD_FIN} px-3`}>{acciones}</td>
        </tr>
      )}
      {conGrupos && (
        <tr>
          <td colSpan={Math.max(1, columnas - 2)} className={TD_FIN}>
            <PorBodega
              grupos={vistaEnProceso ? grupos.flatMap((g) => { const lineas = g.lineas.filter((l) => l.itemId && estaEnProceso(p.items.find((x) => x.id === l.itemId))); return lineas.length ? [{ ...g, lineas, unidades: lineas.reduce((t, l) => t + l.cantidad, 0) }] : []; }) : grupos}
              seleccion={seleccion}
              enProceso={vistaEnProceso && enProceso ? { ...enProceso, completo: true } : enProceso}
            />
          </td>
          <td className={`${TD_FIN} px-3`} />
        </tr>
      )}
    </>
  );
}

/** Lo que despacho anotó al confirmar un producto. */
const notasDeDespacho = (p: PedidoInventario, itemId: string): string[] => (p.envios ?? []).filter((e) => e.itemId === itemId && e.nota).map((e) => `Despacho (${e.bodega}): ${e.nota}`);

/** La tabla de pedidos, igual para los dos lados: despacho ve «Recibido» y «Cancelar»; inventario, lo que hay y «Enviar». */
/** Cómo se ve la tarjeta de cada estado en el tablero (como el de Compras: ícono de color, número grande y la tarjeta filtra la tabla). */
const TARJETA_ESTADO = {
  solicitud: { icono: PedidoIcon, color: "violeta", detalle: "pedidos que inventario no ha tomado" },
  en_proceso: { icono: CalendarioIcon, color: "ambar", detalle: "inventario los está preparando" },
  enviado: { icono: EnvioIcon, color: "azul", detalle: "en camino a despacho" },
  recibido: { icono: CheckIcon, color: "verde", detalle: "ya llegaron a despacho" },
} as const;

/** El tablero de arriba: el total y un contador por estado; cada tarjeta pone (o quita) el filtro `?estado=` de la dirección. */
export function TableroPedidos({
  modo,
  ruta,
  cuenta,
  total,
  elegido,
}: {
  modo: "despacho" | "inventario";
  ruta: string;
  cuenta: Record<EstadoPedido, number>;
  total: number;
  elegido: EstadoPedido | null;
}) {
  const num = (n: number) => n.toLocaleString("es-PA");
  return (
    <TableroIndicadores etiqueta="Pedidos por estado">
      <Indicador titulo="Total pedidos" icono={InventarioIcon} color="violeta" valor={num(total)} detalle="abiertos y cerrados de 30 días" href={ruta} activo={elegido === null} />
      {ESTADOS.filter((e) => e.clave !== "cancelado").map((e) => {
        const t = TARJETA_ESTADO[e.clave as keyof typeof TARJETA_ESTADO];
        const n = cuenta[e.clave];
        return (
          <Indicador
            key={e.clave}
            titulo={modo === "inventario" && e.clave === "solicitud" ? "Por atender (Solicitud)" : e.etiqueta}
            icono={t.icono}
            color={t.color}
            punto={modo === "inventario" && e.clave === "solicitud" && n ? "aviso" : undefined}
            valor={num(n)}
            detalle={t.detalle}
            href={elegido === e.clave ? ruta : `${ruta}?estado=${e.clave}`}
            activo={elegido === e.clave}
          />
        );
      })}
    </TableroIndicadores>
  );
}

export function TablaPedidos({
  pedidos,
  modo,
  puedeEscribir,
  origenes = [],
  stock = {},
  fichas = null,
  opciones = [],
  hayEnInventario = {},
  fotos = {},
  sinConfirmacion = false,
  sinEnProceso = false,
  soloEnProceso = false,
}: {
  pedidos: PedidoInventario[];
  modo: "despacho" | "inventario";
  puedeEscribir: boolean;
  origenes?: { id: string; nombre: string }[];
  stock?: Record<string, Record<string, number>>;
  /** Los productos de los pedidos, para abrir su ficha de stock (20 nov 2026); null = sin permiso de Inventario. */
  fichas?: Record<string, SkuFicha> | null;
  /** Para que despacho edite un pedido: los productos que puede pedir y lo que hay de cada uno en inventario. */
  opciones?: OpcionSkuMaestro[];
  hayEnInventario?: Record<string, StockInventario>;
  /** La foto de cada producto de los pedidos (23 nov 2026). */
  fotos?: Record<string, string>;
  /** Falta la migración 0368: inventario no puede enviar. */
  sinConfirmacion?: boolean;
  /** Falta la migración 0371: sin «En proceso» por producto. */
  sinEnProceso?: boolean;
  /** La tarjeta «En proceso» está elegida: cada pedido muestra solo lo marcado en proceso. */
  soloEnProceso?: boolean;
}) {
  const [ficha, setFicha] = useState<string | null>(null);
  const columnas = modo === "inventario" ? 8 : 9;
  const th = "px-2 py-2.5 font-semibold";
  const vacios = pedidos.length === 0;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className={`w-full border-collapse text-sm ${modo === "inventario" ? "min-w-[1200px]" : "min-w-[1100px]"}`}>
        <thead>
          <tr className="bg-muted text-left text-foreground">
            <th className={`${th} px-3`}>N.º pedido y fecha</th>
            <th className={th}>Código</th>
            <th className={th}>Producto</th>
            <th className={`${th} text-right`}>Cantidad pedida</th>
            {modo !== "inventario" && <th className={th}>Pedido por</th>}
            {modo !== "inventario" && <th className={th}>Responsable bodega</th>}
            {modo === "inventario" && <th className={th}>Stock por bodega</th>}
            <th className={`${th} text-right`}>{modo === "inventario" ? "Sale de y cantidad" : "Cantidad entregada"}</th>
            <th className={th}>Observaciones</th>
            <th className={`${th} px-3`}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {vacios ? (
            <tr>
              <td colSpan={columnas} className="px-4 py-8 text-center text-muted-foreground">
                No hay pedidos aquí.
              </td>
            </tr>
          ) : (
            pedidos.map((p) => (
              <Fragment key={p.id}>
                <FilasPedido p={p} modo={modo} puedeEscribir={puedeEscribir} origenes={origenes} stock={stock} abrirFicha={fichas ? (id) => fichas[id] && setFicha(id) : null} opciones={opciones} hayEnInventario={hayEnInventario} columnas={columnas} fotos={fotos} sinConfirmacion={sinConfirmacion} sinEnProceso={sinEnProceso} soloEnProceso={soloEnProceso} hermanos={p.grupo ? pedidos.filter((x) => x.grupo === p.grupo && x.id !== p.id).map((x) => numeroPedido(x.numero)) : []} />
              </Fragment>
            ))
          )}
        </tbody>
      </table>
      {fichas && (
        // Solo para consultar cómo está repartido el stock: los movimientos se hacen en Inventario.
        <FichaStock
          sku={ficha ? fichas[ficha] : undefined}
          bodegasPropias={[]}
          bodegasExternas={[]}
          ubicaciones={[]}
          puedeEscribir={false}
          puedeComentar={false}
          codigoPais="PA"
          alCerrar={() => setFicha(null)}
          alCambiar={() => undefined}
        />
      )}
    </div>
  );
}

/** El recuadro de los estados y los avisos, debajo de la tabla (como en el Excel). */
export function LeyendaPedidos() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <h2 className="m-0 text-sm font-semibold">Estados</h2>
        <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
          {ESTADOS.filter((e) => e.clave !== "cancelado").map((e) => (
            <Fragment key={e.clave}>
              <dt>
                <Badge tone={e.tono}>{e.etiqueta}</Badge>
              </dt>
              <dd className="m-0 text-muted-foreground">{e.explica}</dd>
            </Fragment>
          ))}
        </dl>
      </section>
      <section className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <h2 className="m-0 text-sm font-semibold text-foreground">Avisos automáticos («Para ti»)</h2>
        <p className="m-0">A inventario, cuando despacho hace un pedido (o lo cancela).</p>
        <p className="m-0">A quien pidió, cuando inventario lo pone en proceso y cuando lo envía.</p>
        <p className="m-0">A quien envió, cuando despacho recibe el pedido (con las diferencias, si las hay).</p>
        <p className="m-0">«Enviar» no mueve inventario. Cuando despacho confirma cada producto y pulsa «Recibir y transferir», se hace un traslado por cada bodega: no hay que hacerlo aparte en Inventario › Traslados.</p>
      </section>
    </div>
  );
}
