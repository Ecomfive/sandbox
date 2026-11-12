import Link from "next/link";
import type { ReactNode } from "react";
import { claseThLista, claseTdLista, Pastilla } from "@/components/panel/piezas-panel";
import { Pagina } from "@/components/ui/pagina";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { estadoDesdeFinanzas, etiquetasDe, zonaDeEtiquetas } from "@/lib/tienda/ordenes-finanzas";
import { ESTADOS_PEDIDO } from "@/lib/tienda/resumen";

export interface OrdenFinanzas {
  numero: string | null;
  fecha: string;
  estado_entrega: string | null;
  etiquetas: string | null;
  subtotal: number | null;
  descuento: number | null;
  envio: number | null;
  total: number | null;
  estado_pago: string | null;
  forma_pago_texto: string | null;
  transportista: string | null;
  guia: string | null;
  fecha_envio: string | null;
  fecha_devolucion: string | null;
  resultado_courier: string | null;
  motivo_cancelacion: string | null;
  origen: string | null;
  /** La hora en que se creó en Shopify (migración 0275); null en las del Excel. */
  creado_origen?: string | null;
  /** Cuándo entró al sistema. */
  creado_en?: string | null;
}

export interface ClienteOrdenFinanzas {
  nombre: string | null;
  telefono: string | null;
  direccion: string | null;
  corregimiento: string | null;
  notas: string | null;
}

export interface LineaOrdenFinanzas {
  linea: number;
  producto: string | null;
  cantidad: number | null;
  precio: number | null;
  es_servicio: boolean | null;
  skus_maestros: { codigo: string; nombre: string } | null;
}

function Tarjeta({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <h2 id={id} className="m-0 text-[15px] font-semibold">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </div>
  );
}

/**
 * El detalle de una orden que viene de Finanzas (tienda sin conectar a Shopify, 11 nov 2026): lo que trae su Excel de gestión, con el cliente y la
 * dirección (`ven_ordenes_clientes`). No lleva notas del equipo (las notas son de los pedidos que llegan de Shopify). Solo lectura.
 */
export function DetalleOrdenFinanzas({
  o,
  lineas,
  cliente,
  anteriores = [],
  enShopify = null,
  tienda,
  codigoPais,
}: {
  o: OrdenFinanzas;
  lineas: LineaOrdenFinanzas[];
  cliente: ClienteOrdenFinanzas | null;
  /** El estado de entrega de los otros pedidos del mismo cliente. */
  anteriores?: (string | null)[];
  enShopify?: string | null;
  tienda: string;
  codigoPais: string;
}) {
  const deShopify = o.origen === "shopify";
  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-PA", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/Panama",
    });
  // Cuánto tardó en llegar desde que se creó en Shopify (el aviso de Shopify), si se sabe y fue al instante.
  const tardo = deShopify && o.creado_origen && o.creado_en ? Math.round((Date.parse(o.creado_en) - Date.parse(o.creado_origen)) / 1000) : null;
  const entregados = anteriores.filter((e) => e === "entregada").length;
  const estado = ESTADOS_PEDIDO.find((e) => e.id === estadoDesdeFinanzas(o.estado_entrega, o.etiquetas))!;
  const dinero = (n: number | null) => (n === null ? "—" : formatearMoneda(Number(n), codigoPais));
  const etiquetas = etiquetasDe(o.etiquetas);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <Link href="/tienda-pedidos" className="text-sm font-medium text-primario">
        ← Volver a Pedidos
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-xl font-semibold tracking-tight">Pedido {o.numero ?? "—"}</h1>
        <Pastilla tono={estado.tono}>{estado.etiqueta}</Pastilla>
        <span className="text-sm text-muted-foreground">
          {tienda} · {formatearFecha(o.fecha)}
          {o.creado_origen
            ? ` ${new Date(o.creado_origen).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" })}`
            : ""}
          {tardo !== null && tardo >= 0 && tardo < 600 ? ` · llegó de Shopify en ${tardo} s` : ""}
        </span>
        {enShopify && (
          <a
            href={enShopify}
            target="_blank"
            rel="noreferrer"
            className="ml-auto rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Abrir en Shopify ↗
          </a>
        )}
      </div>
      {!deShopify && (
        <p role="note" className="m-0 rounded-lg border border-primario/30 bg-primario-suave px-4 py-3 text-sm">
          Esta orden viene de Finanzas{o.origen ? ` (${o.origen})` : ""}: es lo que dice el Excel de gestión, que solo trae el día, no la hora.
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Tarjeta id="t-prod" titulo="Productos">
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
          <Tarjeta id="t-hist" titulo="Historial">
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
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Tarjeta id="t-cli" titulo="Cliente y dirección">
            <dl className="m-0 flex flex-col gap-1.5">
              <Dato etiqueta="Nombre">{cliente?.nombre ?? "—"}</Dato>
              <Dato etiqueta="Teléfono">{cliente?.telefono ?? "—"}</Dato>
              <Dato etiqueta="Pedidos anteriores">
                {anteriores.length ? `${anteriores.length} · ${entregados} ${entregados === 1 ? "entregado" : "entregados"}` : "Ninguno"}
              </Dato>
              <Dato etiqueta="Zona">{[zonaDeEtiquetas(o.etiquetas), cliente?.corregimiento].filter(Boolean).join(", ") || "—"}</Dato>
              <Dato etiqueta="Dirección">{cliente?.direccion ?? "—"}</Dato>
              {cliente?.notas && <Dato etiqueta="Notas">{cliente.notas}</Dato>}
            </dl>
          </Tarjeta>
          <Tarjeta id="t-ent" titulo="Entrega">
            <dl className="m-0 flex flex-col gap-1.5">
              <Dato etiqueta="Transportista">{o.transportista ?? "—"}</Dato>
              <Dato etiqueta="Guía">{o.guia ?? "—"}</Dato>
              {o.fecha_envio && <Dato etiqueta="Enviado">{formatearFecha(o.fecha_envio)}</Dato>}
              {o.resultado_courier && <Dato etiqueta="Resultado">{o.resultado_courier}</Dato>}
              {o.fecha_devolucion && <Dato etiqueta="Devuelto">{formatearFecha(o.fecha_devolucion)}</Dato>}
              {o.motivo_cancelacion && <Dato etiqueta="Motivo">{o.motivo_cancelacion}</Dato>}
            </dl>
          </Tarjeta>
          {etiquetas.length > 0 && (
            <Tarjeta id="t-etq" titulo="Etiquetas de la orden">
              <div className="flex flex-wrap gap-1.5">
                {etiquetas.map((e) => (
                  <Pastilla key={e}>{e}</Pastilla>
                ))}
              </div>
            </Tarjeta>
          )}
        </div>
      </div>
    </Pagina>
  );
}
