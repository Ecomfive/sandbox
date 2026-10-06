"use client";

import { startTransition, useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { Seccion } from "@/components/ui/seccion-ficha";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFecha } from "@/lib/formato";
import { ProductoIcon } from "@/lib/nav-icons";
import { actualizarProductoCompra, agregarProductoCompra, obtenerProductosCompra, quitarProductoCompra, type ItemCompra, type ProductoComprable } from "./actions";
import { useConfirmarProductoActivo } from "./confirmar-producto-activo";
import { usd } from "./calculos-compras";
import { aNumero, CamposCosto, claseNumero, DECIMALES_UNITARIO, redondear, useCosto } from "./costo-linea";

/**
 * Una línea de la orden: lo pedido y el costo (unitario o total) se editan en el lugar, en cualquier momento (también con la
 * compra cerrada), y se guardan al salir del campo, con «Guardando…» y «✓ Guardado» a la vista.
 */
function FilaItem({
  item,
  puedeEscribir,
  alCambiar,
  alEscribir,
}: {
  item: ItemCompra;
  puedeEscribir: boolean;
  alCambiar: () => void;
  /** Lo que se ve escrito ahora (aunque no se haya guardado), para el total de la orden en vivo. */
  alEscribir: (id: string, vivo: { cantidad: number; subtotal: number | null }) => void;
}) {
  const { mostrarToast } = useToast();
  const [cantidad, setCantidad] = useState(String(item.cantidadPedida));
  const n = Number(cantidad);
  const costo = useCosto(n, item.costoUnitario);
  const subtotalVivo = aNumero(costo.total);
  useEffect(() => {
    alEscribir(item.id, { cantidad: Number.isFinite(n) ? n : 0, subtotal: subtotalVivo });
    // `alEscribir` es estable (setState del padre); lo que importa es lo escrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, n, subtotalVivo]);
  const [pendiente, start] = useTransition();
  const [guardado, setGuardado] = useState(false);
  // Al volver a escribir, el «✓ Guardado» se quita hasta el próximo guardado.
  const [escrito, setEscrito] = useState(`${cantidad}|${costo.unitario}|${costo.total}`);
  const ahora = `${cantidad}|${costo.unitario}|${costo.total}`;
  if (ahora !== escrito) {
    setEscrito(ahora);
    if (guardado) setGuardado(false);
  }
  const recibido = item.cantidadRecibida !== null;

  function guardar() {
    const u = costo.valorUnitario;
    if (n === item.cantidadPedida && u === item.costoUnitario) return;
    start(async () => {
      const r = await actualizarProductoCompra(item.id, n, u === null ? null : redondear(u, DECIMALES_UNITARIO));
      if (r.error) {
        mostrarToast(r.error, "destructive");
        setCantidad(String(item.cantidadPedida));
        costo.reiniciar(item.costoUnitario, item.cantidadPedida);
      } else {
        mostrarToast(`${item.codigo}: cambio guardado`);
        setGuardado(true);
        alCambiar();
      }
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
        <span className="flex shrink-0 items-center gap-3">
          {pendiente ? (
            <span className="text-xs text-muted-foreground">Guardando…</span>
          ) : (
            guardado && <span className="text-xs text-success">✓ Guardado</span>
          )}
          {puedeEscribir && !recibido && (
            <button type="button" onClick={quitar} disabled={pendiente} className={`text-xs text-muted-foreground hover:text-destructive ${anilloFoco}`}>
              Quitar
            </button>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Unidades</span>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={cantidad}
            disabled={!puedeEscribir || pendiente}
            onChange={(e) => {
              setCantidad(e.target.value);
              costo.conCantidad(Number(e.target.value));
            }}
            onBlur={guardar}
            className={claseNumero}
          />
        </label>
        <CamposCosto costo={costo} deshabilitado={!puedeEscribir || pendiente} alSalir={guardar} />
      </div>
    </li>
  );
}

/**
 * Los productos de una orden de compra, de la ficha de producto: cada línea con lo pedido y su costo (se escribe el unitario
 * o el total y el otro se calcula), su número de lote en el país de la compra (Lote #1, #2… se sigue solo) y, al final, el
 * total de la orden (unidades y monto). La QTY Total y el Monto Total de la compra salen de aquí. Un producto con variantes
 * pide la cantidad de cada variante; uno en Test, pasarlo a Activo. Solo compras de país: Importadora compra para clientes.
 * Con `incrustado` se dibuja dentro del formulario de la compra (ver `FormularioCompra`): guarda sus propios cambios, no
 * los de la compra.
 */
export function ProductosCompra({ compraId, puedeEscribir, incrustado = false }: { compraId: string; puedeEscribir: boolean; incrustado?: boolean }) {
  const { mostrarToast } = useToast();
  const { confirmar, dialogo } = useConfirmarProductoActivo();
  const [datos, setDatos] = useState<{ items: ItemCompra[]; productos: ProductoComprable[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<OpcionSkuMaestro | null>(null);
  const [cantidad, setCantidad] = useState("");
  // Cantidades por variante cuando el producto elegido tiene variantes.
  const [porVariante, setPorVariante] = useState<Record<string, string>>({});
  const [pendiente, start] = useTransition();
  const router = useRouter();
  // Lo escrito en cada línea (antes de guardar), para que el total de la orden cambie mientras se escribe.
  const [vivo, setVivo] = useState<Record<string, { cantidad: number; subtotal: number | null }>>({});
  const alEscribir = useCallback((id: string, v: { cantidad: number; subtotal: number | null }) => setVivo((x) => ({ ...x, [id]: v })), []);

  const items = datos?.items ?? [];
  const yaEstan = new Set(items.map((i) => i.skuId));
  const variantesElegido = elegido ? (datos?.productos ?? []).filter((p) => p.padreId === elegido.id) : [];
  // La cantidad de la línea nueva: la escrita, o la suma de las variantes (el costo total se reparte entre todas).
  const cantidadNueva = variantesElegido.length ? variantesElegido.reduce((s, v) => s + (Number(porVariante[v.id]) || 0), 0) : Number(cantidad) || 0;
  const costoNuevo = useCosto(cantidadNueva, null);

  const cargar = useCallback(async () => {
    const r = await obtenerProductosCompra(compraId);
    if ("error" in r) setError(r.error);
    else {
      setError(null);
      setDatos(r);
    }
  }, [compraId]);

  /** Después de un cambio: recarga las líneas y refresca la tabla de Compras en segundo plano (sin bloquear). */
  const trasCambio = useCallback(async () => {
    await cargar();
    startTransition(() => router.refresh());
  }, [cargar, router]);

  useEffect(() => {
    // Carga al abrir la compra (o al pasar a otra).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  function limpiar() {
    setElegido(null);
    setCantidad("");
    setPorVariante({});
    costoNuevo.reiniciar(null, 0);
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
    const unitario = costoNuevo.valorUnitario === null ? null : redondear(costoNuevo.valorUnitario, DECIMALES_UNITARIO);
    for (const [p] of pares) if (!(await confirmar(p))) return;
    start(async () => {
      for (const [p, n] of pares) {
        const r = await agregarProductoCompra(compraId, p.id, n, unitario);
        if (r.error) {
          mostrarToast(`${p.codigo}: ${r.error}`, "destructive");
          break;
        }
      }
      limpiar();
      await trasCambio();
    });
  }

  // El total de la orden, con lo que está escrito ahora en cada línea (guardado o no) y la línea por agregar.
  const lineaVivo = (i: ItemCompra) => vivo[i.id] ?? { cantidad: i.cantidadPedida, subtotal: i.costoUnitario !== null ? redondear(i.costoUnitario * i.cantidadPedida, 2) : null };
  const nuevaSubtotal = aNumero(costoNuevo.total);
  const hayNueva = !!elegido && cantidadNueva > 0;
  const unidades = items.reduce((s, i) => s + lineaVivo(i).cantidad, 0) + (hayNueva ? cantidadNueva : 0);
  const monto = items.reduce((s, i) => s + (lineaVivo(i).subtotal ?? 0), 0) + (hayNueva && nuevaSubtotal !== null ? nuevaSubtotal : 0);
  const sinCosto = items.filter((i) => lineaVivo(i).subtotal === null).length;
  // Se busca el producto (o el padre); las variantes se piden al elegirlo.
  const opciones: OpcionSkuMaestro[] = (datos?.productos ?? []).filter((p) => !p.padreId && !yaEstan.has(p.id)).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.estado }));
  const listo = !!elegido && cantidadNueva > 0;

  // Incrustado (dentro del bloque «Compra» del formulario, bajo Prioridad) va entre dos líneas, sin el margen de una sección
  // aparte; suelto (a solo lectura, al final de la ficha) es una sección propia.
  return (
    <div className={incrustado ? "border-y border-border py-4" : "border-t border-border p-5"}>
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
              <FilaItem key={i.id} item={i} puedeEscribir={puedeEscribir} alCambiar={() => void trasCambio()} alEscribir={alEscribir} />
            ))}
          </ul>
        )}
        {puedeEscribir && datos && (
          <ProveedorSkusMaestros opciones={opciones}>
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
              <p className="m-0 text-xs font-medium">Agregar producto</p>
              <label className="flex flex-col gap-1 text-xs">
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
              {variantesElegido.length > 0 && (
                <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
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
                            onChange={(e) => {
                              const siguiente = { ...porVariante, [v.id]: e.target.value };
                              setPorVariante(siguiente);
                              costoNuevo.conCantidad(variantesElegido.reduce((s, x) => s + (Number(siguiente[x.id]) || 0), 0));
                            }}
                            className={claseNumero}
                          />
                        )}
                      </label>
                    );
                  })}
                </fieldset>
              )}
              <div className="flex flex-wrap items-end gap-3 text-xs">
                {variantesElegido.length === 0 ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Unidades</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={cantidad}
                      onChange={(e) => {
                        setCantidad(e.target.value);
                        costoNuevo.conCantidad(Number(e.target.value));
                      }}
                      className={claseNumero}
                    />
                  </label>
                ) : (
                  <p className="m-0 pb-2 text-muted-foreground">Unidades: {cantidadNueva.toLocaleString("es-PA")}</p>
                )}
                <CamposCosto costo={costoNuevo} />
                <BotonBarra principal disabled={!listo || pendiente} onClick={() => void agregar()} className="ml-auto">
                  {pendiente ? "Agregando…" : "Agregar a la orden"}
                </BotonBarra>
              </div>
            </div>
          </ProveedorSkusMaestros>
        )}
        {(items.length > 0 || hayNueva) && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-muted px-3 py-2" role="status">
            <span className="text-sm font-medium">
              Total de la orden · {items.length + (hayNueva ? 1 : 0)} producto{items.length + (hayNueva ? 1 : 0) === 1 ? "" : "s"} · {unidades.toLocaleString("es-PA")} u.
            </span>
            <span className="text-base font-semibold tabular-nums">{usd(monto)}</span>
            {hayNueva && <span className="w-full text-xs text-muted-foreground">Incluye la línea que estás agregando: pulsa «Agregar a la orden» para guardarla.</span>}
            {sinCosto > 0 && (
              <span className="w-full text-xs text-warning">
                {sinCosto} producto{sinCosto === 1 ? "" : "s"} sin costo: no {sinCosto === 1 ? "suma" : "suman"} al total.
              </span>
            )}
          </div>
        )}
      </Seccion>
      {dialogo}
    </div>
  );
}
