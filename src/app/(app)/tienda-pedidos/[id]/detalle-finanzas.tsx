import Link from "next/link";
import type { ReactNode } from "react";
import { claseThLista, claseTdLista, Pastilla } from "@/components/panel/piezas-panel";
import { Pagina } from "@/components/ui/pagina";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { NOMBRE_FUENTE_COSTO } from "@/lib/tienda/costos";
import type { OrdenFinanzas, OrdenTienda } from "@/lib/tienda/orden-detalle";
import { estadoDesdeFinanzas, etiquetasDe, zonaDeEtiquetas } from "@/lib/tienda/ordenes-finanzas";
import { ESTADOS_PEDIDO } from "@/lib/tienda/resumen";
import { NotasOrden } from "./notas-orden";

export type { ClienteOrdenFinanzas, LineaOrdenFinanzas, OrdenFinanzas } from "@/lib/tienda/orden-detalle";

function Tarjeta({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h3 id={id} className="m-0 text-[15px] font-semibold">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0 min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

/** Una cifra de «Ingresos y costos»: el nombre, el valor y, si hay, una nota corta debajo. */
function Caja({ titulo, valor, nota, fuerte = false }: { titulo: string; valor: string; nota?: string; fuerte?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/60 px-3 py-2">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <b className={`text-base tabular-nums ${fuerte ? "text-primario" : ""}`}>{valor}</b>
      {nota && (
        <span className="truncate text-[11px] text-muted-foreground" title={nota}>
          {nota}
        </span>
      )}
    </div>
  );
}

const hora = (iso: string, segundos = true) =>
  new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", ...(segundos ? { second: "2-digit" } : {}), timeZone: "America/Panama" });

/** El estado de la orden (como se muestra en Pedidos). */
export const estadoDeOrden = (o: OrdenFinanzas) => ESTADOS_PEDIDO.find((e) => e.id === estadoDesdeFinanzas(o.estado_entrega, o.etiquetas))!;

/** La línea de debajo del título: tienda, fecha y hora, y cuánto tardó en llegar de Shopify. */
export function subtituloOrden(o: OrdenFinanzas, tienda: string): string {
  const deShopify = o.origen === "shopify";
  const tardo = deShopify && o.creado_origen && o.creado_en ? Math.round((Date.parse(o.creado_en) - Date.parse(o.creado_origen)) / 1000) : null;
  return [
    tienda,
    `${formatearFecha(o.fecha)}${o.creado_origen ? ` ${hora(o.creado_origen, false)}` : ""}`,
    tardo !== null && tardo >= 0 && tardo < 600 ? `llegó de Shopify en ${tardo} s` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * El contenido de la ficha de una orden de tienda (12 nov 2026, como en Mi Reto Digital), en una columna para la ficha lateral de Pedidos y en dos para su
 * página: Cliente y dirección, Productos, Ingresos y costos, Entrega, Etiquetas, Notas del equipo e Historial. Lo único que se escribe son las notas,
 * que quedan en el sistema y no van a Shopify.
 */
export function ContenidoOrdenTienda({
  orden,
  codigoPais,
  puedeEscribir,
  dosColumnas = false,
}: {
  orden: OrdenTienda;
  codigoPais: string;
  puedeEscribir: boolean;
  dosColumnas?: boolean;
}) {
  const { o, lineas, cliente, anteriores } = orden;
  const deShopify = o.origen === "shopify";
  const entregados = anteriores.filter((e) => e === "entregada").length;
  const devueltos = anteriores.filter((e) => e === "devuelta").length;
  const dinero = (n: number | null) => (n === null ? "—" : formatearMoneda(Number(n), codigoPais));
  const etiquetas = etiquetasDe(o.etiquetas);

  const clienteYDireccion = (
    <Tarjeta id={`t-cli-${orden.id}`} titulo="Cliente y dirección">
      <dl className="m-0 flex flex-col gap-1.5">
        <Dato etiqueta="Nombre">{cliente?.nombre ?? "—"}</Dato>
        <Dato etiqueta="Teléfono">{cliente?.telefono ?? "—"}</Dato>
        <Dato etiqueta="Pedidos anteriores">
          {anteriores.length
            ? `${anteriores.length} · ${entregados} ${entregados === 1 ? "entregado" : "entregados"}${devueltos ? ` · ${devueltos} ${devueltos === 1 ? "devuelto" : "devueltos"}` : ""}`
            : "Ninguno"}
        </Dato>
        <Dato etiqueta="Zona">{[zonaDeEtiquetas(o.etiquetas), cliente?.corregimiento].filter(Boolean).join(", ") || "—"}</Dato>
        <Dato etiqueta="Dirección">{cliente?.direccion ?? "—"}</Dato>
        {cliente?.notas && <Dato etiqueta="Notas del cliente">{cliente.notas}</Dato>}
      </dl>
    </Tarjeta>
  );
  const productos = (
    <Tarjeta id={`t-prod-${orden.id}`} titulo="Productos">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={claseThLista}>
                En la orden
              </th>
              <th scope="col" className={claseThLista}>
                Producto nuestro
              </th>
              <th scope="col" className={`${claseThLista} text-right`}>
                Cant.
              </th>
              <th scope="col" className={`${claseThLista} text-right`}>
                Precio
              </th>
              <th scope="col" className={`${claseThLista} text-right`}>
                Costo
              </th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.linea}>
                <td className={claseTdLista}>
                  {l.producto ?? "(sin nombre)"}
                  {l.es_servicio ? <span className="text-muted-foreground"> · servicio</span> : null}
                </td>
                <td className={claseTdLista}>
                  {l.skus_maestros ? (
                    <span>
                      {l.skus_maestros.nombre} <span className="font-mono text-xs text-muted-foreground">{l.skus_maestros.codigo}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sin vincular</span>
                  )}
                </td>
                <td className={`${claseTdLista} text-right tabular-nums`}>{l.cantidad ?? "—"}</td>
                <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(l.precio)}</td>
                <td className={`${claseTdLista} text-right tabular-nums`} title={l.costo ? `${dinero(l.costo.costo)} por unidad · ${NOMBRE_FUENTE_COSTO[l.costo.fuente]}` : undefined}>
                  {l.es_servicio ? "—" : l.costo ? dinero(l.costo.costo * (Number(l.cantidad) || 0)) : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="m-0 ml-auto flex w-full max-w-xs flex-col gap-1.5">
        <Dato etiqueta="Subtotal">{dinero(o.subtotal)}</Dato>
        <Dato etiqueta="Descuentos">{dinero(o.descuento)}</Dato>
        <Dato etiqueta="Envío cobrado">{dinero(o.envio)}</Dato>
        <Dato etiqueta="Total">
          <b>{dinero(o.total)}</b>
        </Dato>
        {o.estado_pago && <Dato etiqueta="Pago">{o.estado_pago}</Dato>}
        {o.forma_pago_texto && <Dato etiqueta="Forma de pago">{o.forma_pago_texto}</Dato>}
      </dl>
    </Tarjeta>
  );
  const c = orden.cuentas;
  // «Ingresos y costos» (12 nov 2026, como en Mi Reto Digital): el costo de cada producto es el de Dropi del país o, si falta, la última compra.
  const ingresosYCostos = (
    <Tarjeta id={`t-cost-${orden.id}`} titulo="Ingresos y costos">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Caja titulo="Venta" valor={dinero(c.venta)} />
        <Caja
          titulo="Costo del producto"
          valor={c.costoProductos > 0 || c.lineasSinCosto === 0 ? dinero(c.costoProductos) : "—"}
          nota={c.lineasSinCosto ? `${c.lineasSinCosto} ${c.lineasSinCosto === 1 ? "producto sin costo" : "productos sin costo"}: falta vincular o costear` : c.fuentes.map((f) => NOMBRE_FUENTE_COSTO[f]).join(" y ") || undefined}
        />
        <Caja titulo="Fulfillment" valor={c.fulfillment === null ? "—" : dinero(c.fulfillment)} nota={c.fulfillment === null ? "sin tarifa de la tienda" : undefined} />
        <Caja titulo="Flete" valor={c.flete === null ? "—" : dinero(c.flete)} nota={c.flete === null ? "cuando tenga guía" : undefined} />
        <Caja
          titulo="Margen"
          valor={c.margen === null ? "—" : dinero(c.margen)}
          nota={c.margenPct === null ? undefined : `${c.margenPct.toLocaleString("es-PA")} % de la venta${c.lineasSinCosto || c.fulfillment === null || c.flete === null ? " · con lo que se sabe" : ""}`}
          fuerte
        />
      </div>
    </Tarjeta>
  );
  const entrega = (
    <Tarjeta id={`t-ent-${orden.id}`} titulo="Entrega">
      <dl className="m-0 flex flex-col gap-1.5">
        <Dato etiqueta="Transportista">{o.transportista ?? "—"}</Dato>
        <Dato etiqueta="Guía">{o.guia ?? "—"}</Dato>
        {o.fecha_envio && <Dato etiqueta="Enviado">{formatearFecha(o.fecha_envio)}</Dato>}
        {o.resultado_courier && <Dato etiqueta="Resultado">{o.resultado_courier}</Dato>}
        {o.fecha_devolucion && <Dato etiqueta="Devuelto">{formatearFecha(o.fecha_devolucion)}</Dato>}
        {o.motivo_cancelacion && <Dato etiqueta="Motivo">{o.motivo_cancelacion}</Dato>}
      </dl>
    </Tarjeta>
  );
  const etiquetasT =
    etiquetas.length > 0 ? (
      <Tarjeta id={`t-etq-${orden.id}`} titulo="Etiquetas">
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.map((e) => (
            <Pastilla key={e}>{e}</Pastilla>
          ))}
        </div>
      </Tarjeta>
    ) : null;
  const notasT = (
    <Tarjeta id={`t-notas-${orden.id}`} titulo="Notas del equipo">
      <NotasOrden key={orden.id} ordenId={orden.id} notas={orden.notas} puedeEscribir={puedeEscribir} />
    </Tarjeta>
  );
  const historial = (
    <Tarjeta id={`t-hist-${orden.id}`} titulo="Historial">
      <ol className="m-0 flex list-disc flex-col gap-2 pl-5 text-sm">
        {o.creado_origen ? (
          <li>
            <b>Creado en Shopify</b>{" "}
            <span className="text-muted-foreground">
              · {formatearFecha(o.creado_origen)} {hora(o.creado_origen)}
            </span>
          </li>
        ) : (
          <li>
            <b>Fecha del pedido</b> <span className="text-muted-foreground">· {formatearFecha(o.fecha)} (el Excel no trae la hora)</span>
          </li>
        )}
        {o.creado_en && (
          <li>
            <b>Llegó al sistema</b>{" "}
            <span className="text-muted-foreground">
              · {formatearFecha(o.creado_en)} {hora(o.creado_en)} · {deShopify ? "de Shopify" : "con el Excel de Finanzas"}
            </span>
          </li>
        )}
        {o.fecha_envio && (
          <li>
            <b>Enviado</b> <span className="text-muted-foreground">· {formatearFecha(o.fecha_envio)}</span>
          </li>
        )}
        {o.fecha_devolucion && (
          <li>
            <b>Devuelto</b> <span className="text-muted-foreground">· {formatearFecha(o.fecha_devolucion)}</span>
          </li>
        )}
        <li className="text-muted-foreground">Confirmación, guía y entrega se irán sumando aquí.</li>
      </ol>
    </Tarjeta>
  );
  const aviso = !deShopify ? (
    <p role="note" className="m-0 rounded-lg border border-primario/30 bg-primario-suave px-4 py-3 text-sm">
      Esta orden viene de Finanzas{o.origen ? ` (${o.origen})` : ""}: es lo que dice el Excel de gestión, que solo trae el día, no la hora.
    </p>
  ) : null;

  if (!dosColumnas)
    return (
      <div className="flex flex-col gap-4">
        {aviso}
        {clienteYDireccion}
        {productos}
        {ingresosYCostos}
        {entrega}
        {etiquetasT}
        {notasT}
        {historial}
      </div>
    );
  return (
    <div className="flex flex-col gap-5">
      {aviso}
      <div className="grid grid-cols-1 items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {productos}
          {ingresosYCostos}
          {historial}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {clienteYDireccion}
          {entrega}
          {etiquetasT}
          {notasT}
        </div>
      </div>
    </div>
  );
}

/** La página de una orden de tienda (se llega por enlace directo); la lista abre la misma ficha a un lado. */
export function DetalleOrdenFinanzas({ orden, codigoPais, puedeEscribir }: { orden: OrdenTienda; codigoPais: string; puedeEscribir: boolean }) {
  const estado = estadoDeOrden(orden.o);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <Link href="/tienda-pedidos" className="text-sm font-medium text-primario">
        ← Volver a Pedidos
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-xl font-semibold tracking-tight">Pedido {orden.o.numero ?? "—"}</h1>
        <Pastilla tono={estado.tono}>{estado.etiqueta}</Pastilla>
        <span className="text-sm text-muted-foreground">{subtituloOrden(orden.o, orden.tienda)}</span>
        {orden.enShopify && (
          <a href={orden.enShopify} target="_blank" rel="noreferrer" className="ml-auto rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">
            Abrir en Shopify ↗
          </a>
        )}
      </div>
      <ContenidoOrdenTienda orden={orden} codigoPais={codigoPais} puedeEscribir={puedeEscribir} dosColumnas />
    </Pagina>
  );
}
