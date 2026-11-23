"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archivarPedidoInventario,
  cancelarPedidoInventario,
  crearPedidoInventario,
  deshacerEntregaPedidoInventario,
  deshacerEnvioPedidoInventario,
  editarPedidoInventario,
  enviarPedidoInventario,
  marcarEntregadoPedidoInventario,
  ponerEnProcesoPedido,
  recibirPedidoInventario,
} from "@/app/(app)/despacho-ciudad/pedir-inventario/actions";
import { Indicador, TableroIndicadores } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaStock, type SkuFicha } from "@/app/(app)/inventario/ficha-stock";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { usePlegado } from "@/app/(app)/crm-dropshippers/bandeja/usar-plegado";
import { CalendarioIcon, CheckIcon, DescargarIcon, EnvioIcon, FlechaAbajoIcon, FlechaArribaIcon, InventarioIcon, PedidoIcon } from "@/lib/nav-icons";
import {
  cambiosDeEdicion,
  ESTADOS,
  estadoDe,
  faltantesEn,
  fechaCorta,
  MAX_LINEAS,
  mejorOrigen,
  numeroPedido,
  puedeCancelar,
  puedeEditar,
  puedeEnProceso,
  puedeEnviar,
  puedeArchivar,
  puedeDeshacerEntrega,
  puedeDeshacerEnvio,
  puedeRecibir,
  type EstadoPedido,
  type PedidoInventario,
  type StockInventario,
} from "@/lib/pedidos-inventario/reglas";

// Pedir a inventario (16 nov 2026, migración 0305; prototipo aprobado https://claude.ai/artifact/ReVGwYZrBG11rmKFUT7V5T): la tabla
// del Excel que reemplaza (N.º, código, producto, cantidades, fecha, quién, estado, observaciones), con los botones de cada lado.

const BOTON = "inline-flex min-h-9 items-center justify-center rounded-md px-3 text-sm font-semibold whitespace-nowrap disabled:opacity-50";
const PRINCIPAL = `${BOTON} bg-primario text-white`;
const SECUNDARIO = `${BOTON} border border-border bg-card text-foreground hover:bg-muted`;

type Resultado = { ok: true; mensaje?: string } | { error: string };

function useAccion() {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [ocupado, iniciar] = useTransition();
  const correr = (hacer: () => Promise<Resultado>, alTerminar?: () => void) =>
    iniciar(async () => {
      const r = await hacer().catch(() => ({ error: "No se pudo guardar. Intenta otra vez." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      if (r.mensaje) mostrarToast(r.mensaje);
      alTerminar?.();
      router.refresh();
    });
  return { ocupado, correr };
}

interface Linea {
  clave: number;
  sku: OpcionSkuMaestro | null;
  cantidad: string;
  nota: string;
}

/** Despacho: «+ Nuevo pedido» abre las líneas (producto de la lista, cantidad y nota) y «Pedir a inventario» lo manda. */
export function NuevoPedido({ opciones, stock }: { opciones: OpcionSkuMaestro[]; stock: Record<string, StockInventario> }) {
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

  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className={PRINCIPAL}>
        + Nuevo pedido
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
      <h2 className="m-0 text-sm font-semibold">Nuevo pedido a inventario</h2>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={agregar} disabled={lineas.length >= MAX_LINEAS} className={SECUNDARIO}>
          + Otro producto
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={reiniciar} className={SECUNDARIO}>
            Cerrar
          </button>
          <button type="submit" disabled={ocupado || !listo} className={PRINCIPAL}>
            {ocupado ? "Enviando…" : "Pedir a inventario"}
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
                <div key={l.clave} className="flex flex-wrap items-end gap-2">
                  <div className="flex min-w-[220px] flex-[3_1_280px] flex-col gap-1">
                    {i === 0 && <span className="font-medium">Producto</span>}
                    {l.id ? (
                      <span className="flex min-h-9 items-center font-medium">{l.nombre}</span>
                    ) : (
                      <CampoSkuMaestro valor={l.skuId} alCambiar={(o) => cambiar(l.clave, { sku: o, skuId: o?.id ?? null, nombre: o?.nombre ?? "" })} etiquetaAria={`Producto nuevo ${i + 1}`} placeholder="Escribe parte del nombre, el SKU o el N.º" claseContenedor="w-full" />
                    )}
                  </div>
                  <label className="flex w-28 flex-col gap-1">
                    <span className={i === 0 ? "font-medium" : "sr-only"}>Cantidad</span>
                    <input type="number" inputMode="numeric" min={1} step={1} value={l.cantidad} onChange={(e) => cambiar(l.clave, { cantidad: e.target.value })} className={fieldClass} />
                  </label>
                  <label className="flex min-w-[180px] flex-[2_1_220px] flex-col gap-1">
                    <span className={i === 0 ? "font-medium" : "sr-only"}>
                      Nota <span className="font-normal text-muted-foreground">(opcional)</span>
                    </span>
                    <input type="text" maxLength={300} value={l.nota} onChange={(e) => cambiar(l.clave, { nota: e.target.value })} className={fieldClass} />
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
 * Cuánto hay del producto en cada bodega de donde inventario envía (20 nov 2026, pedido de Hernán: «si sale general no sabré de dónde sale»): la de donde
 * sale el pedido en negrita (aunque tenga 0) y las demás que tienen algo; en rojo cuánto falta si en la elegida no alcanza.
 */
/** Lo que hay hoy de ese producto en cada bodega de origen (23 nov 2026: también en los pedidos ya enviados o cerrados, no solo en los que faltan por enviar). `soloLectura` = el pedido ya no se envía: sin alarmas. */
function StockPorBodega({ skuId, origen, origenes, stock, falta, soloLectura = false }: { skuId: string; origen: string; origenes: { id: string; nombre: string }[]; stock: Record<string, Record<string, number>>; falta: number; soloLectura?: boolean }) {
  const filas = origenes.map((b) => ({ ...b, hay: stock[b.id]?.[skuId] ?? 0 })).filter((b) => b.id === origen || b.hay > 0);
  if (!filas.some((b) => b.hay > 0)) return soloLectura ? <span className="text-muted-foreground">Sin stock hoy</span> : <span className="font-semibold text-destructive">Sin stock en ninguna bodega</span>;
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0 whitespace-nowrap">
      {filas.map((b) => (
        <li key={b.id} className={b.id === origen ? "font-semibold text-foreground" : "text-muted-foreground"}>
          {b.nombre} <span className="tabular-nums">{b.hay.toLocaleString("es-PA")}</span>
          {b.id === origen && <span className="sr-only"> (de aquí sale)</span>}
        </li>
      ))}
      {falta > 0 && (
        <li className="font-semibold whitespace-normal text-destructive">
          Faltan {falta.toLocaleString("es-PA")} en {origenes.find((b) => b.id === origen)?.nombre ?? "esa bodega"}
        </li>
      )}
    </ul>
  );
}

/** «Descargar PDF» de un pedido: lo arma en el navegador (pdf-lib, cargado al pulsar) y lo baja; lo puede usar quien abra el módulo, aunque solo lea. */
function BotonPdfPedido({ p }: { p: PedidoInventario }) {
  const { mostrarToast } = useToast();
  const [armando, setArmando] = useState(false);
  const descargar = async () => {
    if (armando) return;
    setArmando(true);
    try {
      const { pedidoAPdf, nombreArchivoPedido } = await import("@/lib/pedidos-inventario/pdf");
      const bytes = await pedidoAPdf(p);
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
    <button type="button" onClick={descargar} disabled={armando} aria-label={`Descargar el pedido ${numeroPedido(p.numero)} en PDF`} className={`${SECUNDARIO} gap-1.5`}>
      <DescargarIcon className="h-4 w-4" aria-hidden="true" />
      {armando ? "Armando…" : "Descargar PDF"}
    </button>
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
}: {
  p: PedidoInventario;
  columnas: number;
  modo: "despacho" | "inventario";
  puedeEscribir: boolean;
  origenes: { id: string; nombre: string }[];
  stock: Record<string, Record<string, number>>;
  /** Los productos que despacho puede pedir y lo que hay de cada uno en inventario (para editar un pedido). */
  opciones: OpcionSkuMaestro[];
  hayEnInventario: Record<string, StockInventario>;
  /** Abre la ficha de stock del producto (null = no se puede: falta el permiso de Inventario). */
  abrirFicha: ((skuId: string) => void) | null;
}) {
  const { ocupado, correr } = useAccion();
  const enInventario = modo === "inventario";
  const editable = enInventario && puedeEscribir && puedeEnviar(p.estado);
  // Ya no se elige de dónde sale (20 nov 2026: por ahora no aplica): sale de la bodega que alcanza para todo el pedido y, si ninguna, de la que deja menos sin cubrir.
  const [origen] = useState(
    () => mejorOrigen(p.items.map((it) => ({ skuId: it.skuId, cantidad: it.cantidadPedida })), origenes.map((b) => b.id), stock) ?? origenes[0]?.id ?? "",
  );
  const [entregas, setEntregas] = useState<Record<string, { cantidad: string; observacion: string }>>(() =>
    Object.fromEntries(p.items.map((it) => [it.id, { cantidad: String(it.cantidadPedida), observacion: "" }])),
  );
  // Lo que se va a enviar (lo escrito en «Cantidad entregada») y lo que no alcanza en cada bodega.
  const aEnviar = p.items.map((it) => ({ skuId: it.skuId, cantidad: Math.max(0, Math.floor(Number(entregas[it.id]?.cantidad) || 0)) }));
  const faltanEn = (bodegaId: string) => faltantesEn(aEnviar, bodegaId, stock);
  const faltan = editable ? faltanEn(origen) : [];
  const faltaDe = new Map(faltan.map((f) => [f.skuId, f.falta]));
  const nombreOrigen = origenes.find((b) => b.id === origen)?.nombre ?? "esa bodega";
  const estado = estadoDe(p.estado);
  const n = p.items.length;
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
      <BotonPdfPedido p={p} />
      {!puedeEscribir ? null : enInventario ? (
        <>
          {puedeEnProceso(p.estado) && (
            <button type="button" disabled={ocupado} onClick={() => correr(() => ponerEnProcesoPedido(p.id))} className={SECUNDARIO}>
              Pasar a «En proceso»
            </button>
          )}
          {puedeEnviar(p.estado) && (
            <>
              {faltan.length > 0 && (
                <span role="alert" className="max-w-[12rem] text-xs font-semibold text-destructive">
                  En {nombreOrigen} no alcanza: baja la cantidad entregada.
                </span>
              )}
              <button
                type="button"
                disabled={ocupado || !origen || faltan.length > 0}
                onClick={() => correr(() => enviarPedidoInventario(p.id, origen, p.items.map((it) => ({ id: it.id, ...entregas[it.id] }))))}
                className={PRINCIPAL}
              >
                {ocupado ? "Enviando…" : "Enviar"}
              </button>
            </>
          )}
          {puedeRecibir(p.estado) && (
            <>
              <span className="text-xs text-muted-foreground">Esperando que despacho lo reciba</span>
              <button type="button" disabled={ocupado} onClick={() => correr(() => marcarEntregadoPedidoInventario(p.id))} className={PRINCIPAL}>
                {ocupado ? "Cerrando…" : "Marcar entregado"}
              </button>
              {puedeDeshacerEnvio(p.estado) && p.traslado &&
                (deshaciendoEnvio ? (
                  <div className="flex max-w-[14rem] flex-col gap-1.5 rounded-md bg-muted p-2">
                    <span className="text-xs">¿Deshacer el envío? Lo enviado vuelve a la bodega de origen con un traslado de reversa y el pedido queda «En proceso».</span>
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
                  <button type="button" onClick={() => setDeshaciendoEnvio(true)} className={SECUNDARIO}>
                    Deshacer envío
                  </button>
                ))}
            </>
          )}
        </>
      ) : (
        <>
          {puedeEditar(p.estado) && <EditarPedido p={p} opciones={opciones} stock={hayEnInventario} />}
          {puedeRecibir(p.estado) && (
            <button type="button" disabled={ocupado} onClick={() => correr(() => recibirPedidoInventario(p.id))} className={PRINCIPAL}>
              Recibido
            </button>
          )}
          {puedeCancelar(p.estado) && (
            <button type="button" disabled={ocupado} onClick={() => correr(() => cancelarPedidoInventario(p.id))} className={SECUNDARIO}>
              Cancelar
            </button>
          )}
        </>
      )}
      {puedeEscribir && puedeArchivar(p.estado) && (
        <button type="button" disabled={ocupado} onClick={() => correr(() => archivarPedidoInventario(p.id, !p.archivadoEn))} className={SECUNDARIO}>
          {p.archivadoEn ? "Sacar del archivo" : "Archivar pedido"}
        </button>
      )}
      {puedeEscribir && puedeDeshacerEntrega(p.estado) && !p.archivadoEn &&
        (deshaciendo ? (
          <div className="flex flex-col gap-1.5 rounded-md bg-muted p-2">
            <span className="text-xs">¿Volver este pedido a «Enviado»? No cambia el inventario.</span>
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
          <button type="button" onClick={() => setDeshaciendo(true)} className={SECUNDARIO}>
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

  // Plegado: una sola fila con el N.º, un resumen de lo que lleva y el estado. Si falta enviarlo (inventario escribe las cantidades), no se ofrece «Enviar» sin ver los productos.
  if (plegado) {
    const unidades = p.items.reduce((t, it) => t + it.cantidadPedida, 0);
    return (
      <tr>
        <td className={`${TD_FIN} bg-primario-suave px-3 whitespace-nowrap`}>
          <span className="block font-semibold text-primario">{numeroPedido(p.numero)}</span>
          <span className="block text-xs font-normal text-muted-foreground">{fechaCorta(p.creadoEn)}</span>
          {alternar}
        </td>
        <td colSpan={Math.max(1, columnas - 2)} className={`${TD_FIN} text-muted-foreground`}>
          {n.toLocaleString("es-PA")} {n === 1 ? "producto" : "productos"} · {unidades.toLocaleString("es-PA")} unidades pedidas
          {enInventario ? (
            // Plegado también se ve el stock por bodega de cada producto (23 nov 2026, pedido de Jhokser).
            <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 text-xs">
              {p.items.map((it) => {
                const hay = origenes.map((b) => ({ nombre: b.nombre, hay: stock[b.id]?.[it.skuId] ?? 0 })).filter((b) => b.hay > 0);
                return (
                  <li key={it.id} className="flex flex-wrap gap-x-3">
                    <span className="font-medium text-foreground">{it.producto}</span>
                    <span>
                      {it.cantidadPedida.toLocaleString("es-PA")} pedidas · Stock: {hay.length ? hay.map((b) => `${b.nombre} ${b.hay.toLocaleString("es-PA")}`).join(" · ") : "sin stock hoy"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <span className="block truncate text-xs">{p.items.map((it) => it.producto).join(" · ")}</span>
          )}
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
      {p.items.map((it, i) => {
        const ultima = i === n - 1;
        const borde = ultima ? TD_FIN : TD;
        const obs = [it.nota, it.observacion, ultima && p.traslado ? p.traslado : null].filter(Boolean).join(" · ");
        return (
          <tr key={it.id}>
            {i === 0 && (
              <td rowSpan={n} className={`${TD_FIN} bg-primario-suave px-3 whitespace-nowrap`}>
                <span className="block font-semibold text-primario">{numeroPedido(p.numero)}</span>
                <span className="block text-xs font-normal text-muted-foreground">{fechaCorta(p.creadoEn)}</span>
                {alternar}
              </td>
            )}
            <td className={`${borde} font-mono text-xs text-muted-foreground`}>{it.codigo ?? "—"}</td>
            <td className={`${borde} font-medium`}>
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
                it.producto
              )}
            </td>
            <td className={`${borde} text-right tabular-nums`}>{it.cantidadPedida.toLocaleString("es-PA")}</td>
            {/* En Comunicación despacho no van «Pedido por» ni «Responsable bodega» (20 nov 2026): siempre son las mismas personas. */}
            {!enInventario && <td className={borde}>{p.pedidoPorNombre ?? "—"}</td>}
            {!enInventario && <td className={`${borde} text-muted-foreground`}>{p.responsableNombre ?? "—"}</td>}
            {enInventario && (
              <td className={`${borde} text-xs`}>
                <StockPorBodega skuId={it.skuId} origen={origen} origenes={origenes} stock={stock} falta={faltaDe.get(it.skuId) ?? 0} soloLectura={!editable} />
              </td>
            )}
            <td className={`${borde} text-right tabular-nums`}>
              {editable ? (
                <label>
                  <span className="sr-only">Cantidad entregada de {it.producto}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={entregas[it.id]?.cantidad ?? ""}
                    onChange={(e) => setEntregas((x) => ({ ...x, [it.id]: { ...x[it.id], cantidad: e.target.value } }))}
                    className={`${fieldClass} w-20 text-right`}
                  />
                </label>
              ) : it.cantidadEntregada === null ? (
                <span className="text-muted-foreground">0</span>
              ) : (
                <span className="font-semibold">{it.cantidadEntregada.toLocaleString("es-PA")}</span>
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
                      value={entregas[it.id]?.observacion ?? ""}
                      onChange={(e) => setEntregas((x) => ({ ...x, [it.id]: { ...x[it.id], observacion: e.target.value } }))}
                      className={fieldClass}
                    />
                  </label>
                </div>
              ) : (
                obs || "—"
              )}
            </td>
            {i === 0 && (
              <td rowSpan={n} className={`${TD_FIN} px-3`}>
                {acciones}
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}

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
}) {
  const [ficha, setFicha] = useState<string | null>(null);
  const columnas = modo === "inventario" ? 8 : 9;
  const th = "px-2 py-2.5 font-semibold";
  const vacios = pedidos.length === 0;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[1100px] border-collapse text-sm">
        <thead>
          <tr className="bg-muted text-left text-foreground">
            <th className={`${th} px-3`}>N.º pedido y fecha</th>
            <th className={th}>Código</th>
            <th className={th}>Producto</th>
            <th className={`${th} text-right`}>Cantidad pedida</th>
            {modo !== "inventario" && <th className={th}>Pedido por</th>}
            {modo !== "inventario" && <th className={th}>Responsable bodega</th>}
            {modo === "inventario" && <th className={th}>Stock por bodega</th>}
            <th className={`${th} text-right`}>Cantidad entregada</th>
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
                <FilasPedido p={p} modo={modo} puedeEscribir={puedeEscribir} origenes={origenes} stock={stock} abrirFicha={fichas ? (id) => fichas[id] && setFicha(id) : null} opciones={opciones} hayEnInventario={hayEnInventario} columnas={columnas} />
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
        <p className="m-0">A quien envió, cuando despacho marca «Recibido». A quien pidió, cuando inventario marca «Marcar entregado».</p>
        <p className="m-0">«Enviar» hace el traslado a la bodega de despacho: no hay que hacerlo aparte en Inventario › Traslados.</p>
      </section>
    </div>
  );
}
