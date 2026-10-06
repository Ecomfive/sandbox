"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { Seccion } from "@/components/ui/seccion-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFecha } from "@/lib/formato";
import { ProductoIcon } from "@/lib/nav-icons";
import { actualizarProductoCompra, agregarProductoCompra, obtenerProductosCompra, quitarProductoCompra, type ItemCompra, type ProductoComprable } from "./actions";
import { useConfirmarProductoActivo } from "./confirmar-producto-activo";
import { usd } from "./calculos-compras";

const claseNumero = `${fieldClass} w-24 text-right tabular-nums`;
const aNumero = (t: string): number | null => (t.trim() === "" ? null : Number(t.replace(",", ".")));

/** Una fila: lo pedido y el costo se editan en el lugar y se guardan al salir del campo. */
function FilaItem({ item, puedeEscribir, alCambiar }: { item: ItemCompra; puedeEscribir: boolean; alCambiar: () => void }) {
  const { mostrarToast } = useToast();
  const [cantidad, setCantidad] = useState(String(item.cantidadPedida));
  const [costo, setCosto] = useState(item.costoUnitario === null ? "" : String(item.costoUnitario));
  const [pendiente, start] = useTransition();
  const recibido = item.cantidadRecibida !== null;

  function guardar() {
    const n = Number(cantidad);
    const c = aNumero(costo);
    if (n === item.cantidadPedida && c === item.costoUnitario) return;
    start(async () => {
      const r = await actualizarProductoCompra(item.id, n, c);
      if (r.error) {
        mostrarToast(r.error, "destructive");
        setCantidad(String(item.cantidadPedida));
        setCosto(item.costoUnitario === null ? "" : String(item.costoUnitario));
      } else alCambiar();
    });
  }

  function quitar() {
    if (!confirm(`¿Quitar ${item.codigo} · ${item.nombre} de la compra?`)) return;
    start(async () => {
      const r = await quitarProductoCompra(item.id);
      if (r.error) mostrarToast(r.error, "destructive");
      else alCambiar();
    });
  }

  const subtotal = item.costoUnitario !== null ? item.costoUnitario * item.cantidadPedida : null;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 text-sm font-medium">
            <span className="mr-1.5 text-muted-foreground">{item.codigo}</span>
            {item.nombre}
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            Lote #{item.loteNumero}
            {item.origen === "clickup" ? " · de ClickUp" : ""}
            {recibido ? ` · recibido ${item.cantidadRecibida} u.${item.fechaRecepcion ? ` el ${formatearFecha(item.fechaRecepcion)}` : ""}` : ""}
          </p>
        </div>
        {puedeEscribir && !recibido && (
          <button type="button" onClick={quitar} disabled={pendiente} className={`text-xs text-muted-foreground hover:text-destructive ${anilloFoco}`}>
            Quitar
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Pedido (u.)</span>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={cantidad}
            disabled={!puedeEscribir || pendiente}
            onChange={(e) => setCantidad(e.target.value)}
            onBlur={guardar}
            className={claseNumero}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Costo unitario (USD)</span>
          <input
            type="number"
            min={0}
            step="0.0001"
            inputMode="decimal"
            value={costo}
            disabled={!puedeEscribir || pendiente}
            onChange={(e) => setCosto(e.target.value)}
            onBlur={guardar}
            className={claseNumero}
          />
        </label>
        <p className="m-0 ml-auto text-sm tabular-nums">{subtotal !== null ? usd(subtotal) : <span className="text-muted-foreground">—</span>}</p>
      </div>
    </li>
  );
}

/**
 * Los productos de una orden de compra, de la ficha de producto: cada uno con lo pedido, su costo unitario y su número de
 * lote en el país de la compra (Lote #1, #2… se sigue solo). La QTY Total de la compra es la suma de lo pedido. Un
 * producto en Test pide pasarlo a Activo antes de agregarlo. Solo compras de país: Importadora compra para clientes.
 */
export function ProductosCompra({ compraId, puedeEscribir }: { compraId: string; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const { confirmar, dialogo } = useConfirmarProductoActivo();
  const [datos, setDatos] = useState<{ items: ItemCompra[]; productos: ProductoComprable[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<OpcionSkuMaestro | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  // Cantidades por variante cuando el producto elegido tiene variantes.
  const [porVariante, setPorVariante] = useState<Record<string, string>>({});
  const [pendiente, start] = useTransition();

  const cargar = useCallback(async () => {
    const r = await obtenerProductosCompra(compraId);
    if ("error" in r) setError(r.error);
    else {
      setError(null);
      setDatos(r);
    }
  }, [compraId]);

  useEffect(() => {
    // Carga al abrir la compra (o al pasar a otra).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  function limpiar() {
    setElegido(null);
    setCantidad("");
    setCosto("");
    setPorVariante({});
  }

  async function agregar() {
    if (!elegido || !datos) return;
    const producto = datos.productos.find((p) => p.id === elegido.id);
    if (!producto) return;
    // Con variantes: se agrega cada variante que tenga cantidad (el padre no se compra: no lleva stock).
    const hijas = datos.productos.filter((p) => p.padreId === producto.id);
    const pares: [ProductoComprable, number][] = hijas.length
      ? hijas.map((h) => [h, Number(porVariante[h.id] || 0)] as [ProductoComprable, number]).filter(([, n]) => n !== 0)
      : [[producto, Number(cantidad)]];
    if (pares.length === 0) return mostrarToast("Escribe la cantidad de al menos una variante.", "destructive");
    if (pares.some(([, n]) => !Number.isInteger(n) || n <= 0)) return mostrarToast("Las cantidades deben ser números enteros mayores que cero.", "destructive");
    for (const [p] of pares) if (!(await confirmar(p))) return;
    start(async () => {
      for (const [p, n] of pares) {
        const r = await agregarProductoCompra(compraId, p.id, n, aNumero(costo));
        if (r.error) {
          mostrarToast(`${p.codigo}: ${r.error}`, "destructive");
          break;
        }
      }
      limpiar();
      await cargar();
    });
  }

  const items = datos?.items ?? [];
  const total = items.reduce((s, i) => s + i.cantidadPedida, 0);
  const yaEstan = new Set(items.map((i) => i.skuId));
  // Se busca el producto (o el padre); las variantes se piden al elegirlo.
  const opciones: OpcionSkuMaestro[] = (datos?.productos ?? []).filter((p) => !p.padreId && !yaEstan.has(p.id)).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.estado }));
  const variantesElegido = elegido ? (datos?.productos ?? []).filter((p) => p.padreId === elegido.id) : [];
  const listo = !!elegido && (variantesElegido.length ? Object.values(porVariante).some((v) => Number(v) > 0) : !!cantidad);

  return (
    <div className="border-t border-border p-5">
      <Seccion icono={ProductoIcon} titulo="Productos">
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
        {!datos && !error && <p className="m-0 text-sm text-muted-foreground">Cargando…</p>}
        {datos && items.length === 0 && (
          <p className="m-0 text-sm text-muted-foreground">Todavía no tiene productos de la ficha{puedeEscribir ? ": búscalos abajo." : "."}</p>
        )}
        {items.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {items.map((i) => (
              <FilaItem key={`${i.id}-${i.cantidadPedida}-${i.costoUnitario}`} item={i} puedeEscribir={puedeEscribir} alCambiar={() => void cargar()} />
            ))}
          </ul>
        )}
        {items.length > 1 && <p className="m-0 text-xs text-muted-foreground">Total pedido: {total.toLocaleString("es-PA")} u.</p>}
        {puedeEscribir && datos && (
          <ProveedorSkusMaestros opciones={opciones}>
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
              <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Producto</span>
                <CampoSkuMaestro
                  valor={elegido?.id ?? null}
                  alCambiar={(s) => {
                    setElegido(s);
                    setPorVariante({});
                  }}
                  etiquetaAria="Producto a agregar"
                  placeholder="Código o nombre del producto"
                />
              </label>
              {variantesElegido.length === 0 && (
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Pedido (u.)</span>
                  <input type="number" min={1} step={1} inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={claseNumero} />
                </label>
              )}
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Costo unitario (USD)</span>
                <input type="number" min={0} step="0.0001" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} className={claseNumero} />
              </label>
              <BotonBarra principal disabled={!listo || pendiente} onClick={() => void agregar()}>
                {pendiente ? "Agregando…" : "Agregar"}
              </BotonBarra>
              {variantesElegido.length > 0 && (
                <fieldset className="m-0 flex w-full flex-col gap-1.5 border-0 p-0">
                  <legend className="mb-1 text-xs text-muted-foreground">Cantidad por variante (deja vacías las que no se compran):</legend>
                  {variantesElegido.map((v) => {
                    const ya = yaEstan.has(v.id);
                    return (
                      <label key={v.id} className="flex items-center gap-2 text-xs">
                        <span className="w-28 shrink-0 font-medium">{v.codigo}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{v.opciones ? Object.values(v.opciones).join(" / ") : v.nombre}</span>
                        {ya ? (
                          <span className="text-muted-foreground">ya está en la compra</span>
                        ) : (
                          <input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            aria-label={`Cantidad de ${v.codigo}`}
                            value={porVariante[v.id] ?? ""}
                            onChange={(e) => setPorVariante((c) => ({ ...c, [v.id]: e.target.value }))}
                            className={claseNumero}
                          />
                        )}
                      </label>
                    );
                  })}
                </fieldset>
              )}
            </div>
          </ProveedorSkusMaestros>
        )}
      </Seccion>
      {dialogo}
    </div>
  );
}
