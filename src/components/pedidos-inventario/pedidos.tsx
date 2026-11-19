"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelarPedidoInventario,
  crearPedidoInventario,
  enviarPedidoInventario,
  ponerEnProcesoPedido,
  recibirPedidoInventario,
} from "@/app/(app)/despacho-ciudad/pedir-inventario/actions";
import { Indicador, TableroIndicadores } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import { fieldClass } from "@/components/ui/field";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import { CalendarioIcon, CheckIcon, EnvioIcon, InventarioIcon, PedidoIcon } from "@/lib/nav-icons";
import {
  ESTADOS,
  estadoDe,
  fechaCorta,
  MAX_LINEAS,
  numeroPedido,
  puedeCancelar,
  puedeEnProceso,
  puedeEnviar,
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

const TD = "border-b border-border px-2 py-2 align-top";

/** Las filas de un pedido (una por producto, el N.º y los botones a la izquierda y a la derecha, como en el Excel). */
function FilasPedido({
  p,
  modo,
  puedeEscribir,
  origenes,
  stock,
}: {
  p: PedidoInventario;
  modo: "despacho" | "inventario";
  puedeEscribir: boolean;
  origenes: { id: string; nombre: string }[];
  stock: Record<string, Record<string, number>>;
}) {
  const { ocupado, correr } = useAccion();
  const enInventario = modo === "inventario";
  const editable = enInventario && puedeEscribir && puedeEnviar(p.estado);
  const [origen, setOrigen] = useState(origenes[0]?.id ?? "");
  const [entregas, setEntregas] = useState<Record<string, { cantidad: string; observacion: string }>>(() =>
    Object.fromEntries(p.items.map((it) => [it.id, { cantidad: String(it.cantidadPedida), observacion: "" }])),
  );
  const estado = estadoDe(p.estado);
  const n = p.items.length;

  const acciones = (
    <div className="flex flex-col items-stretch gap-1.5">
      {!puedeEscribir ? null : enInventario ? (
        <>
          {puedeEnProceso(p.estado) && (
            <button type="button" disabled={ocupado} onClick={() => correr(() => ponerEnProcesoPedido(p.id))} className={SECUNDARIO}>
              Pasar a «En proceso»
            </button>
          )}
          {puedeEnviar(p.estado) && (
            <>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Sale de
                <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={`${fieldClass} text-sm`}>
                  {origenes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={ocupado || !origen}
                onClick={() => correr(() => enviarPedidoInventario(p.id, origen, p.items.map((it) => ({ id: it.id, ...entregas[it.id] }))))}
                className={PRINCIPAL}
              >
                {ocupado ? "Enviando…" : "Enviar"}
              </button>
            </>
          )}
          {p.estado === "enviado" && <span className="text-xs text-muted-foreground">Esperando que despacho lo reciba</span>}
        </>
      ) : (
        <>
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
    </div>
  );

  return (
    <>
      {p.items.map((it, i) => {
        const ultima = i === n - 1;
        const borde = TD;
        const hay = stock[origen]?.[it.skuId];
        const obs = [it.nota, it.observacion, ultima && p.traslado ? p.traslado : null].filter(Boolean).join(" · ");
        return (
          <tr key={it.id}>
            {i === 0 && (
              <td rowSpan={n} className={`${TD} bg-primario-suave px-3 font-semibold whitespace-nowrap text-primario`}>
                {numeroPedido(p.numero)}
              </td>
            )}
            <td className={`${borde} font-mono text-xs text-muted-foreground`}>{it.codigo ?? "—"}</td>
            <td className={`${borde} font-medium`}>{it.producto}</td>
            <td className={`${borde} text-right tabular-nums`}>{it.cantidadPedida.toLocaleString("es-PA")}</td>
            <td className={`${borde} whitespace-nowrap`}>{fechaCorta(p.creadoEn)}</td>
            <td className={borde}>{p.pedidoPorNombre ?? "—"}</td>
            <td className={`${borde} text-muted-foreground`}>{p.responsableNombre ?? "—"}</td>
            {enInventario && <td className={`${borde} text-right tabular-nums text-muted-foreground`}>{editable ? (hay ?? 0).toLocaleString("es-PA") : "—"}</td>}
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
            <td className={borde}>
              <Badge tone={estado.tono}>{estado.etiqueta}</Badge>
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
              <td rowSpan={n} className={`${TD} px-3`}>
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
  recibido: { icono: CheckIcon, color: "verde", detalle: "despacho ya los recibió" },
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
}: {
  pedidos: PedidoInventario[];
  modo: "despacho" | "inventario";
  puedeEscribir: boolean;
  origenes?: { id: string; nombre: string }[];
  stock?: Record<string, Record<string, number>>;
}) {
  const columnas = modo === "inventario" ? 12 : 11;
  const th = "px-2 py-2.5 font-semibold";
  const vacios = pedidos.length === 0;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[1100px] border-collapse text-sm">
        <thead>
          <tr className="bg-muted text-left text-foreground">
            <th className={`${th} px-3`}>N.º pedido</th>
            <th className={th}>Código</th>
            <th className={th}>Producto</th>
            <th className={`${th} text-right`}>Cantidad pedida</th>
            <th className={th}>Fecha</th>
            <th className={th}>Pedido por</th>
            <th className={th}>Responsable bodega</th>
            {modo === "inventario" && <th className={`${th} text-right`}>Hay en bodega</th>}
            <th className={`${th} text-right`}>Cantidad entregada</th>
            <th className={th}>Estado</th>
            <th className={th}>Observaciones</th>
            <th className={`${th} px-3`}>
              <span className="sr-only">Acciones</span>
            </th>
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
                <FilasPedido p={p} modo={modo} puedeEscribir={puedeEscribir} origenes={origenes} stock={stock} />
              </Fragment>
            ))
          )}
        </tbody>
      </table>
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
        <p className="m-0">A quien envió, cuando despacho marca «Recibido».</p>
        <p className="m-0">«Enviar» hace el traslado a la bodega de despacho: no hay que hacerlo aparte en Inventario › Traslados.</p>
      </section>
    </div>
  );
}
