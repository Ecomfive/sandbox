"use client";

import type { ReactNode } from "react";
import { claseThLista, claseTdLista, Pastilla } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { formatearFecha, formatearFechaHora, formatearMoneda } from "@/lib/formato";
import { CheckIcon, CopiarIcon, EnvioIcon, HistorialIcon, InteligenciaIcon, MargenIcon, PersonaIcon, ProductoIcon, TareasIcon, ChatIcon } from "@/lib/nav-icons";
import type { Asistente, Nivel } from "@/lib/tienda/asistente";
import { NOMBRE_FUENTE_COSTO } from "@/lib/tienda/costos";
import { pasosDelPedido, type PasoPedido } from "@/lib/tienda/linea-tiempo";
import type { OrdenTienda } from "@/lib/tienda/orden-detalle";
import { etiquetasDe, zonaDeEtiquetas } from "@/lib/tienda/ordenes-finanzas";
import { NotasOrden } from "./notas-orden";
import { ChatTienda } from "@/components/tienda/chat-tienda";

// La ficha de un pedido de tienda (13 nov 2026, pedido de Hernán: «como la ficha de pedido de la app de Jorge»): la línea de tiempo del pedido, las
// pestañas que llevan a cada parte, el chat de WhatsApp del cliente al lado y los botones de acción abajo. Todo sale de lo registrado (la orden, Monday,
// Servientrega, el CRM); los botones están apagados mientras Shopify sea de solo lectura. Lo único que se escribe son las notas del equipo.

const SECCIONES = [
  { id: "asistente", titulo: "Asistente", icono: InteligenciaIcon },
  { id: "cliente", titulo: "Cliente y dirección", icono: PersonaIcon },
  { id: "productos", titulo: "Productos", icono: ProductoIcon },
  { id: "costos", titulo: "Ingresos y costos", icono: MargenIcon },
  { id: "entrega", titulo: "Entrega", icono: EnvioIcon },
  { id: "notas", titulo: "Notas del equipo", icono: TareasIcon },
  { id: "historial", titulo: "Historial", icono: HistorialIcon },
] as const;

const ACCIONES = ["Confirmar pedido", "Marcar despachado", "Marcar entregado", "Marcar pagado", "Anular pedido"];

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" });
const esMomento = (v: string) => /T\d{2}:\d{2}/.test(v);
/** El mediodía UTC (17:00) es el que se pone cuando solo se sabe el día (Monday, Servientrega): ahí no se muestra la hora. */
const soloDia = (v: string) => /T17:00:00(\.0+)?(Z|\+00(:00)?)$/.test(v);
const ETIQUETA_FASE: Record<string, string> = { por_confirmar: "Por confirmar", confirmada: "Confirmada", despachada: "Despachada", entregada: "Entregada", fallida: "Fallida", devuelta: "Devuelta", cancelada: "Cancelada" };

function Seccion({ id, titulo, icono: Icono, extra, children }: { id: string; titulo: string; icono: (typeof SECCIONES)[number]["icono"]; extra?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="flex min-w-0 scroll-mt-28 flex-col gap-3 border-b border-border px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-t`} className="m-0 flex items-center gap-2 text-[15px] font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primario-suave text-primario">
            <Icono className="h-4 w-4" aria-hidden="true" />
          </span>
          {titulo}
        </h3>
        {extra}
      </div>
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

/** Una fila de «Cliente y dirección»: el nombre del dato, su campo y el valor (vacío se dice). */
function Campo({ etiqueta, campo, valor, enlace }: { etiqueta: string; campo: string; valor: string | null | undefined; enlace?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] border-b border-border last:border-b-0">
      <div className="flex flex-col justify-center bg-muted/40 px-3 py-2">
        <span className="text-[13px] font-medium">{etiqueta}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{campo}</span>
      </div>
      <div className="flex min-w-0 items-center px-3 py-2 text-sm break-words">
        {valor ? (
          enlace ? (
            <a href={enlace} className="text-primario hover:underline">
              {valor}
            </a>
          ) : (
            valor
          )
        ) : (
          <span className="text-muted-foreground">Sin dato</span>
        )}
      </div>
    </div>
  );
}

/** La línea de tiempo: Entró → Confirmado → Despachado → Entregado (o Volvió / Cancelado) → Pagado. */
function LineaTiempo({ pasos }: { pasos: PasoPedido[] }) {
  const color = (t: PasoPedido["tono"]) => (t === "hecho" ? "bg-primario text-background" : t === "malo" ? "bg-destructive text-background" : "border-2 border-border-control bg-card");
  return (
    <ol className="m-0 grid list-none grid-cols-5 gap-0 px-5 pt-4 pb-3" aria-label="Recorrido del pedido">
      {pasos.map((p, i) => (
        <li key={p.clave} className="relative flex min-w-0 flex-col items-center text-center">
          {i > 0 && <span aria-hidden="true" className={`absolute top-2.5 right-1/2 h-0.5 w-full ${pasos[i].tono === "pendiente" ? "bg-border" : pasos[i].tono === "malo" ? "bg-destructive" : "bg-primario"}`} />}
          <span className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full ${color(p.tono)}`}>
            {p.tono === "hecho" ? <CheckIcon className="h-3 w-3" aria-hidden="true" /> : p.tono === "malo" ? <span className="text-[11px] leading-none font-bold">!</span> : null}
          </span>
          <span className={`mt-1.5 text-[13px] font-semibold ${p.tono === "malo" ? "text-destructive" : p.tono === "pendiente" ? "text-muted-foreground" : ""}`}>{p.etiqueta}</span>
          {p.fecha && (
            <span className="text-[11px] leading-tight text-muted-foreground">
              {formatearFecha(p.fecha.slice(0, 10))}
              {esMomento(p.fecha) && !soloDia(p.fecha) ? <> · {hora(p.fecha)}</> : null}
            </span>
          )}
          {p.nota && <span className={`line-clamp-2 text-[11px] leading-tight ${p.tono === "malo" ? "text-destructive" : "text-muted-foreground"}`}>{p.nota}</span>}
        </li>
      ))}
    </ol>
  );
}

const COLOR_NIVEL: Record<Nivel, string> = { bien: "bg-success", aviso: "bg-warning", mal: "bg-destructive", gris: "bg-border-control" };
const TEXTO_NIVEL: Record<Nivel, string> = { bien: "", aviso: "text-warning", mal: "text-destructive", gris: "text-muted-foreground" };

/** El asistente de confirmación: cuatro partes con lo registrado (riesgo y zona, dirección, transportadora, pedido y conversación). */
function AsistenteConfirmacion({ a }: { a: Asistente }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border">
        {a.partes.map((p, i) => (
          <div key={p.titulo} className="flex flex-col gap-1.5 border-b border-border px-4 py-3 last:border-b-0">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COLOR_NIVEL[p.nivel]}`} />
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {i + 1} · {p.titulo}
              </span>
              {i === 0 && <Pastilla tono={a.riesgo === "alto" ? "peligro" : a.riesgo === "medio" ? "aviso" : "exito"}>Riesgo {a.riesgo}</Pastilla>}
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-4">
              {p.lineas.map((l, j) => (
                <li key={j} className={`flex gap-2 text-sm ${TEXTO_NIVEL[l.nivel]}`}>
                  <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_NIVEL[l.nivel]}`} />
                  <span>{l.texto}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="m-0 text-sm font-medium">{a.resumen}</p>
      <p className="m-0 text-[11px] text-muted-foreground">Reglas sobre lo registrado: pedidos de la tienda (últimos 6 meses), Monday, Servientrega, etiquetas de Shopify y el chat del CRM.</p>
    </div>
  );
}

/** El chat del cliente en el CRM (solo lectura): los últimos mensajes y el enlace a la Bandeja. Desde el 13 nov 2026 es el respaldo: si la tienda está conectada a iComfly, la ficha muestra su chat (`ChatTienda`). */
function ChatCliente({ orden }: { orden: OrdenTienda }) {
  const w = orden.whatsapp;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ChatIcon className="h-4 w-4 text-primario" aria-hidden="true" />
          WhatsApp{w?.nombre ? ` · ${w.nombre}` : ""}
        </span>
        {w && (
          <a href={`/crm-dropshippers/bandeja?abrir=${w.conversacionId}`} className="text-xs font-medium text-primario hover:underline">
            Abrir en la Bandeja
          </a>
        )}
      </div>
      {!w || !w.mensajes.length ? (
        <p className="m-0 flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">Este cliente todavía no ha escrito por WhatsApp a ningún número del sistema.</p>
      ) : (
        <ol className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto bg-muted/30 p-3">
          {w.mensajes.map((m) => (
            <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.entrante ? "self-start bg-card" : "self-end bg-primario-suave"}`}>
              <p className="m-0 break-words whitespace-pre-wrap">{m.texto || <span className="text-muted-foreground">({m.tipo ?? "adjunto"})</span>}</p>
              <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">
                {!m.entrante && m.autor ? `${m.autor} · ` : ""}
                {formatearFechaHora(m.momento)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="m-0 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">Solo lectura: se responde desde la Bandeja del CRM.</p>
    </div>
  );
}

export function FichaOrdenTienda({ orden, codigoPais, puedeEscribir }: { orden: OrdenTienda; codigoPais: string; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const { o, lineas, cliente, anteriores, entrega } = orden;
  const deShopify = o.origen === "shopify";
  const entregados = anteriores.filter((e) => e === "entregada").length;
  const devueltos = anteriores.filter((e) => e === "devuelta").length;
  const dinero = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatearMoneda(Number(n), codigoPais));
  const etiquetas = etiquetasDe(o.etiquetas);
  const zona = zonaDeEtiquetas(o.etiquetas);
  const pasos = pasosDelPedido(o, entrega ? { fuente: entrega.fuente, grupo: entrega.grupo, fecha: entrega.fecha, repartidor: entrega.repartidor, causa: entrega.causa } : null);
  const c = orden.cuentas;
  const telefono = cliente?.telefono ?? null;

  const ir = (id: string) => document.getElementById(`${id}-${orden.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  async function copiarDatos() {
    const texto = [cliente?.nombre, telefono, [cliente?.corregimiento, zona].filter(Boolean).join(", "), cliente?.direccion, cliente?.notas].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      mostrarToast("Datos del cliente copiados");
    } catch {
      mostrarToast("No se pudieron copiar los datos", "destructive");
    }
  }
  const sid = (id: string) => `${id}-${orden.id}`;
  const S = (id: (typeof SECCIONES)[number]["id"]) => SECCIONES.find((x) => x.id === id)!;

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 @2xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] @5xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="flex min-w-0 flex-col">
          <LineaTiempo pasos={pasos} />
          {/* Las pestañas llevan a cada parte de la ficha (como en la app de Jorge): se quedan arriba al desplazarse. */}
          <nav aria-label="Partes del pedido" className="sticky top-[var(--alto-cabecera,0px)] z-[5] flex gap-1 overflow-x-auto border-y border-border bg-card px-3">
            {SECCIONES.map((s) => (
              <button key={s.id} type="button" onClick={() => ir(s.id)} className={`flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground hover:border-primario hover:text-foreground ${anilloFoco}`}>
                <s.icono className="h-3.5 w-3.5" aria-hidden="true" />
                {s.titulo}
              </button>
            ))}
          </nav>

          {orden.asistente && (
            <Seccion id={sid("asistente")} titulo="Asistente de confirmación" icono={S("asistente").icono}>
              <AsistenteConfirmacion a={orden.asistente} />
            </Seccion>
          )}

          {!deShopify && (
            <p role="note" className="m-0 mx-5 mt-4 rounded-lg border border-primario/30 bg-primario-suave px-4 py-3 text-sm">
              Esta orden viene de Finanzas{o.origen ? ` (${o.origen})` : ""}: es lo que dice el Excel de gestión, que solo trae el día, no la hora.
            </p>
          )}

          <Seccion
            id={sid("cliente")}
            titulo={S("cliente").titulo}
            icono={S("cliente").icono}
            extra={
              <button type="button" onClick={copiarDatos} className={`flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted ${anilloFoco}`}>
                <CopiarIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Copiar datos
              </button>
            }
          >
            <div className="overflow-hidden rounded-lg border border-border">
              <Campo etiqueta="Nombre completo" campo="name" valor={cliente?.nombre} />
              <Campo etiqueta="WhatsApp" campo="phone" valor={telefono} enlace={telefono ? `tel:${telefono.replace(/[^\d+]/g, "")}` : undefined} />
              <Campo etiqueta="Zona" campo="tags" valor={zona} />
              <Campo etiqueta="Corregimiento" campo="address2" valor={cliente?.corregimiento} />
              <Campo etiqueta="Dirección exacta" campo="address1" valor={cliente?.direccion} />
              <Campo etiqueta="Nota del cliente" campo="note" valor={cliente?.notas} />
            </div>
            <p className="m-0 text-sm">
              <span className="text-muted-foreground">Pedidos anteriores del cliente: </span>
              {anteriores.length ? `${anteriores.length} · ${entregados} ${entregados === 1 ? "entregado" : "entregados"}${devueltos ? ` · ${devueltos} ${devueltos === 1 ? "devuelto" : "devueltos"}` : ""}` : "ninguno"}
            </p>
          </Seccion>

          <Seccion id={sid("productos")} titulo={S("productos").titulo} icono={S("productos").icono} extra={<span className="text-xs text-muted-foreground">{lineas.reduce((t, l) => t + (Number(l.cantidad) || 0), 0)} unidades</span>}>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className={claseThLista}>
                      En el pedido
                    </th>
                    <th scope="col" className={claseThLista}>
                      Producto nuestro
                    </th>
                    <th scope="col" className={`${claseThLista} w-14 text-right`}>
                      Cant.
                    </th>
                    <th scope="col" className={`${claseThLista} w-24 text-right`}>
                      Precio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => (
                    <tr key={l.linea}>
                      <td className={`${claseTdLista} !whitespace-normal break-words`}>
                        {l.producto ?? "(sin nombre)"}
                        {l.es_servicio ? <span className="text-muted-foreground"> · servicio</span> : null}
                      </td>
                      <td className={`${claseTdLista} !whitespace-normal break-words`}>
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
              {(o.forma_pago_texto || o.metodo_pago) && <Dato etiqueta="Forma de pago">{o.forma_pago_texto ?? o.metodo_pago}</Dato>}
              {o.estado_pago && <Dato etiqueta="Pago en Shopify">{/^paid$/i.test(o.estado_pago) ? "Pagado" : /^pending$/i.test(o.estado_pago) ? "Pendiente" : o.estado_pago}</Dato>}
              {Number(o.cod_esperado ?? 0) > 0 && <Dato etiqueta="Contra entrega">{o.cod_cobrado !== null && o.cod_cobrado !== undefined ? `cobrado ${dinero(o.cod_cobrado)}` : `por cobrar ${dinero(o.cod_esperado)}`}</Dato>}
            </dl>
          </Seccion>

          <Seccion id={sid("costos")} titulo={S("costos").titulo} icono={S("costos").icono}>
            <div className="grid grid-cols-2 gap-2 @xl:grid-cols-3">
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
          </Seccion>

          <Seccion id={sid("entrega")} titulo={S("entrega").titulo} icono={S("entrega").icono} extra={zona ? <span className="text-xs text-muted-foreground">{zona === "Interior" ? "Interior · por transportadora" : "Ciudad · repartidor"}</span> : undefined}>
            {entrega ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <b>{entrega.fuente === "siscore" ? `Servientrega · guía ${entrega.guia}` : `Monday${entrega.repartidor ? ` · ${entrega.repartidor}` : ""}`}</b>
                  <Pastilla tono={entrega.grupo === "entregado" ? "exito" : entrega.grupo === "rechazado" || entrega.grupo === "devuelto" ? "peligro" : entrega.grupo === "novedad" ? "aviso" : "neutro"}>{entrega.estado ?? entrega.grupo}</Pastilla>
                  {entrega.fecha && <span className="text-muted-foreground">{formatearFecha(entrega.fecha)}</span>}
                </div>
                {entrega.destino && <span className="text-xs text-muted-foreground">Destino: {entrega.destino}</span>}
                {entrega.causa && <span className="text-xs text-muted-foreground">Último motivo: {entrega.causa}</span>}
                {!!entrega.visitas && <span className="text-xs text-warning">{entrega.visitas} {entrega.visitas === 1 ? "visita" : "visitas"} sin entregar</span>}
                {entrega.rastreo && entrega.rastreo.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-primario">Ver el rastreo ({entrega.rastreo.length} movimientos)</summary>
                    <ol className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                      {[...entrega.rastreo].reverse().map((r, i) => (
                        <li key={i} className="flex gap-3 text-xs">
                          <span className="w-28 shrink-0 text-muted-foreground tabular-nums">
                            {r.fecha ? formatearFecha(r.fecha) : ""} {r.hora?.slice(0, 5) ?? ""}
                          </span>
                          <span>{r.estado}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">Ni Monday ni Servientrega tienen registrado este pedido todavía.</p>
            )}
            <dl className="m-0 flex flex-col gap-1.5">
              <Dato etiqueta="Transportista">{o.transportista ?? "—"}</Dato>
              {o.guia && <Dato etiqueta="Guía">{o.guia}</Dato>}
              {(o.despachada_en || o.fecha_envio) && <Dato etiqueta="Despachado">{formatearFecha((o.despachada_en ?? o.fecha_envio)!.slice(0, 10))}</Dato>}
              {o.entregada_en && <Dato etiqueta="Entregado">{formatearFecha(o.entregada_en.slice(0, 10))}</Dato>}
              {o.fecha_devolucion && <Dato etiqueta="Devuelto">{formatearFecha(o.fecha_devolucion)}</Dato>}
              {o.motivo_cancelacion && <Dato etiqueta="Motivo">{o.motivo_cancelacion}</Dato>}
            </dl>
            {etiquetas.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Etiquetas de Shopify:</span>
                {etiquetas.map((e) => (
                  <Pastilla key={e}>{e}</Pastilla>
                ))}
              </div>
            )}
          </Seccion>

          <Seccion id={sid("notas")} titulo={S("notas").titulo} icono={S("notas").icono} extra={<span className="text-xs text-muted-foreground">quedan en el sistema, no en Shopify</span>}>
            <NotasOrden key={orden.id} ordenId={orden.id} notas={orden.notas} puedeEscribir={puedeEscribir} />
          </Seccion>

          <Seccion id={sid("historial")} titulo={S("historial").titulo} icono={S("historial").icono} extra={<span className="text-xs text-muted-foreground">del más nuevo al más viejo</span>}>
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm">
              {orden.eventos.map((e, i) => (
                <li key={i} className="flex gap-2.5">
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.fase_despues === "devuelta" || e.fase_despues === "cancelada" || e.fase_despues === "fallida" ? "bg-destructive" : "bg-primario"}`} />
                  <span className="flex min-w-0 flex-col">
                    <span>
                      {e.tipo === "fase" && e.fase_despues ? (
                        <>
                          <b>{ETIQUETA_FASE[e.fase_despues] ?? e.fase_despues}</b>
                          {e.fase_antes ? <span className="text-muted-foreground"> (antes {ETIQUETA_FASE[e.fase_antes]?.toLowerCase() ?? e.fase_antes})</span> : null}
                        </>
                      ) : (
                        <b>{e.tipo}</b>
                      )}
                      {e.detalle ? <span className="text-muted-foreground"> · {e.detalle}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.usuario ?? "Sistema"} · {formatearFechaHora(e.creado_en)}
                    </span>
                  </span>
                </li>
              ))}
              {o.creado_en && (
                <li className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-border-control" />
                  <span className="flex flex-col">
                    <b>Llegó al sistema</b>
                    <span className="text-xs text-muted-foreground">
                      {deShopify ? "de Shopify" : "con el Excel de Finanzas"} · {formatearFechaHora(o.creado_en)}
                    </span>
                  </span>
                </li>
              )}
              <li className="flex gap-2.5">
                <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-border-control" />
                <span className="flex flex-col">
                  <b>{o.creado_origen ? "Creado en Shopify" : "Fecha del pedido"}</b>
                  <span className="text-xs text-muted-foreground">{o.creado_origen ? formatearFechaHora(o.creado_origen) : `${formatearFecha(o.fecha)} (el Excel no trae la hora)`}</span>
                </span>
              </li>
            </ol>
          </Seccion>

          {/* Los botones de acción, como en la app de Jorge: apagados mientras Shopify sea de solo lectura (nada cambia de estado sin registro). */}
          <div className="sticky bottom-0 z-[5] mt-auto flex flex-wrap items-center gap-2 border-t border-border bg-card px-4 py-3">
            {ACCIONES.map((a) => (
              <Tooltip key={a} texto="Todavía no: por ahora Shopify es de solo lectura y el estado sale de lo registrado (Shopify, Monday, Servientrega).">
                <button type="button" aria-disabled="true" className="cursor-not-allowed rounded-md border border-border bg-muted/50 px-3 py-1.5 text-[13px] font-medium text-muted-foreground">
                  {a}
                </button>
              </Tooltip>
            ))}
            {orden.enShopify && (
              <a href={orden.enShopify} target="_blank" rel="noreferrer" className={`ml-auto rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-muted ${anilloFoco}`}>
                Ver en Shopify ↗
              </a>
            )}
          </div>
        </div>
        {/* El chat del cliente (13 nov 2026, pedido de Hernán): a la derecha de la ficha, tenga o no chat; un solo chat montado (cada uno se lee cada 8 s).
            Solo en una ficha muy angosta (celular) baja al final. */}
        <aside aria-label="WhatsApp del cliente" className="flex h-[28rem] min-h-0 flex-col border-t border-border @2xl:sticky @2xl:top-[var(--alto-cabecera,0px)] @2xl:h-[calc(92vh-var(--alto-cabecera,0px))] @2xl:self-start @2xl:border-t-0 @2xl:border-l">
          <ChatTienda destino={{ pedido: orden.id }} nombreCliente={orden.cliente?.nombre ?? null} puedeEscribir={puedeEscribir} respaldo={<ChatCliente orden={orden} />} />
        </aside>
      </div>
    </div>
  );
}
