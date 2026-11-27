"use client";

import { useState } from "react";
import { confirmarLineaPedido, recibirPedidoInventario } from "@/app/(app)/despacho-ciudad/pedir-inventario/actions";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, fieldClassSm } from "@/components/ui/field";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { Ventana } from "@/components/ui/ventana";
import { CheckIcon } from "@/lib/nav-icons";
import { numeroPedido, type EnvioPedido, type GrupoBodega, type ItemPedido, type Parte, type PedidoInventario, type StockPorBodegas } from "@/lib/pedidos-inventario/reglas";
import { BOTON_PEDIDO, useAccion } from "./comun";

// De qué bodega sale cada producto (inventario) y la confirmación de lo que llegó (despacho). 26 nov 2026, pedido de Dinora; migración 0368.

const num = (n: number) => n.toLocaleString("es-PA");
type Bodega = { id: string; nombre: string };

/** Lo que inventario escribe de un producto: una o varias partes (bodega y cantidad). */
export function RepartoBodegas({ item, partes, alCambiar, bodegas, stock }: { item: ItemPedido; partes: Parte[]; alCambiar: (partes: { bodegaId: string; cantidad: number | string }[]) => void; bodegas: Bodega[]; stock: StockPorBodegas }) {
  const hay = (b: string) => Math.max(0, stock[b]?.[item.skuId] ?? 0);
  const usadas = new Set(partes.map((p) => p.bodegaId));
  const libres = bodegas.filter((b) => !usadas.has(b.id) && hay(b.id) > 0);
  const total = partes.reduce((t, p) => t + (Number(p.cantidad) || 0), 0);
  const cambiar = (i: number, c: Partial<{ bodegaId: string; cantidad: number | string }>) => alCambiar(partes.map((p, j) => (j === i ? { ...p, ...c } : p)));
  return (
    <div className="flex flex-col items-start gap-1">
      {partes.map((p, i) => {
        const pasa = (Number(p.cantidad) || 0) > hay(p.bodegaId);
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <select value={p.bodegaId} onChange={(e) => cambiar(i, { bodegaId: e.target.value })} aria-label={`Bodega de donde sale ${item.producto}${partes.length > 1 ? `, parte ${i + 1}` : ""}`} className={`${fieldClassSm} w-44`}>
                {bodegas
                  .filter((b) => b.id === p.bodegaId || !usadas.has(b.id))
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre} ({num(hay(b.id))})
                    </option>
                  ))}
              </select>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={p.cantidad}
                onChange={(e) => cambiar(i, { cantidad: e.target.value as unknown as number })}
                aria-label={`Cantidad de ${item.producto} desde ${bodegas.find((b) => b.id === p.bodegaId)?.nombre ?? "la bodega"}`}
                aria-invalid={pasa || undefined}
                className={`${fieldClassSm} w-20 text-right tabular-nums`}
              />
              {partes.length > 1 && (
                <button type="button" onClick={() => alCambiar(partes.filter((_, j) => j !== i))} aria-label={`Quitar esa bodega de ${item.producto}`} className={`min-h-8 min-w-8 rounded-md text-muted-foreground hover:bg-muted ${anilloFoco}`}>
                  ×
                </button>
              )}
            </div>
            {pasa && (
              <span role="alert" className="text-xs font-semibold text-destructive">
                Solo hay {num(hay(p.bodegaId))} ahí
              </span>
            )}
          </div>
        );
      })}
      {libres.length > 0 && (
        <button type="button" onClick={() => alCambiar([...partes, { bodegaId: libres[0].id, cantidad: Math.max(0, Math.min(item.cantidadPedida - total, hay(libres[0].id))) }])} className={`rounded text-xs font-medium text-primario underline-offset-2 hover:underline ${anilloFoco}`}>
          + Sacar también de otra bodega
        </button>
      )}
      {total !== item.cantidadPedida && (
        <span className="text-xs font-semibold text-warning" aria-live="polite">
          {total < item.cantidadPedida ? `Van ${num(total)} de ${num(item.cantidadPedida)}` : `Van ${num(total - item.cantidadPedida)} más de lo pedido`}
        </span>
      )}
    </div>
  );
}

/** Qué productos van en este envío (26 nov 2026, pedido de Hernán): los que no se marcan quedan pendientes en otro pedido. */
export interface Seleccion {
  va: (itemId: string) => boolean;
  marcar: (itemIds: string[], valor: boolean) => void;
}

const CASILLA = "h-4 w-4 shrink-0 accent-primario";

/** «En proceso» por producto (27 nov 2026, pedido de Hernán): lo que ya se está preparando se oculta de lo pendiente. */
export interface EnProceso {
  esta: (itemId: string) => boolean;
  marcar: (itemIds: string[], valor: boolean) => void;
  /** «Ver pedido completo»: se muestra también lo que está en proceso. */
  completo: boolean;
  ocupado: boolean;
}

const BOTON_CHICO = `inline-flex min-h-7 items-center rounded-md border px-2 text-[11px] font-semibold whitespace-nowrap disabled:opacity-50 ${anilloFoco}`;
const EN_PROCESO = `${BOTON_CHICO} border-primario/30 bg-primario-suave text-primario hover:brightness-95`;
const A_PENDIENTE = `${BOTON_CHICO} border-border-control bg-card text-muted-foreground hover:bg-muted`;
const ENLACE = `w-full border-t border-border px-3 py-1.5 text-left text-[11px] font-medium text-primario hover:bg-muted ${anilloFoco}`;

/**
 * «Qué buscar en cada bodega»: los productos del pedido agrupados por la bodega de donde salen. Con `seleccion`, cada producto y cada bodega llevan su casilla de «va ahora».
 * Con `enProceso`, cada bodega y cada producto tienen «En proceso»: lo que ya se está preparando se oculta (salvo con «Ver pedido completo»), y una bodega toda en proceso queda
 * plegada y se despliega con «Mostrar».
 */
export function PorBodega({ grupos, titulo = true, seleccion, enProceso }: { grupos: GrupoBodega[]; titulo?: boolean; seleccion?: Seleccion; enProceso?: EnProceso }) {
  const [desplegadas, setDesplegadas] = useState<Set<string>>(() => new Set());
  if (!grupos.length) return <p className="m-0 text-xs text-muted-foreground">Todavía no hay cantidades que sacar de ninguna bodega.</p>;
  const alternar = (bodegaId: string) =>
    setDesplegadas((x) => {
      const y = new Set(x);
      if (y.has(bodegaId)) y.delete(bodegaId);
      else y.add(bodegaId);
      return y;
    });
  return (
    <div className="flex flex-col gap-2">
      {titulo && (
        <h3 className="m-0 text-xs font-semibold text-foreground">
          Qué buscar en cada bodega
          {seleccion && <span className="font-normal text-muted-foreground"> · marca lo que envías ahora; lo que no, queda pendiente en otro pedido</span>}
          {enProceso && <span className="font-normal text-muted-foreground"> · «En proceso» oculta lo que ya se está preparando</span>}
        </h3>
      )}
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))]">
        {grupos.map((g) => {
          const ids = [...new Set(g.lineas.flatMap((l) => (l.itemId ? [l.itemId] : [])))];
          const enCurso = enProceso ? ids.filter((x) => enProceso.esta(x)) : [];
          const porHacer = ids.filter((x) => !enCurso.includes(x));
          const todaEnProceso = ids.length > 0 && porHacer.length === 0;
          const abierta = !enProceso || enProceso.completo || desplegadas.has(g.bodegaId);
          // Las líneas que se ven: desplegada (o «Ver pedido completo»), todas; si no, solo las pendientes.
          const lineas = abierta ? g.lineas : g.lineas.filter((l) => !l.itemId || !enCurso.includes(l.itemId));
          const ocultas = g.lineas.length - lineas.length;
          const marcados = seleccion ? ids.filter((x) => seleccion.va(x)).length : ids.length;
          return (
            <section key={g.bodegaId} className={`overflow-hidden rounded-lg border bg-card ${todaEnProceso ? "border-primario/30" : "border-border"}`} aria-label={g.bodega}>
              <div className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1.5 text-xs ${todaEnProceso ? "bg-primario-suave" : "bg-muted"}`}>
                {seleccion && ids.length ? (
                  <label className="flex cursor-pointer items-center gap-2 font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={marcados === ids.length}
                      ref={(el) => {
                        if (el) el.indeterminate = marcados > 0 && marcados < ids.length;
                      }}
                      onChange={(e) => seleccion.marcar(ids, e.target.checked)}
                      aria-label={`Enviar ahora todo lo de ${g.bodega}`}
                      className={CASILLA}
                    />
                    {g.bodega}
                  </label>
                ) : (
                  <span className="font-semibold text-foreground">{g.bodega}</span>
                )}
                <span className="text-muted-foreground">
                  {todaEnProceso
                    ? `En proceso · ${num(ids.length)} ${ids.length === 1 ? "producto" : "productos"}`
                    : seleccion && marcados < ids.length
                      ? `${num(marcados)} de ${num(ids.length)} van ahora`
                      : `${num(g.lineas.length)} ${g.lineas.length === 1 ? "producto" : "productos"} · ${num(g.unidades)} u.`}
                </span>
                {enProceso && ids.length > 0 && (
                  <span className="flex basis-full flex-wrap items-center gap-1.5">
                    {porHacer.length > 0 && (
                      <button type="button" disabled={enProceso.ocupado} onClick={() => enProceso.marcar(porHacer, true)} className={EN_PROCESO}>
                        {porHacer.length === ids.length ? "Pasar la bodega a «En proceso»" : `Pasar ${num(porHacer.length)} pendientes a «En proceso»`}
                      </button>
                    )}
                    {todaEnProceso && !enProceso.completo && (
                      <button type="button" onClick={() => alternar(g.bodegaId)} aria-expanded={abierta} className={A_PENDIENTE}>
                        {abierta ? "Ocultar" : "Mostrar"}
                      </button>
                    )}
                    {todaEnProceso && abierta && (
                      <button type="button" disabled={enProceso.ocupado} onClick={() => enProceso.marcar(ids, false)} className={A_PENDIENTE}>
                        Volver la bodega a pendiente
                      </button>
                    )}
                  </span>
                )}
              </div>
              {lineas.length > 0 && (
                <ul className="m-0 flex list-none flex-col divide-y divide-border p-0 text-xs">
                  {lineas.map((l, i) => {
                    const va = !seleccion || !l.itemId || seleccion.va(l.itemId);
                    const curso = !!(enProceso && l.itemId && enCurso.includes(l.itemId));
                    const fila = (
                      <>
                        <span className={`min-w-0 flex-1 ${va ? (curso ? "text-muted-foreground" : "text-foreground") : "text-muted-foreground line-through"}`}>{l.producto}</span>
                        <span className={`font-semibold tabular-nums ${va && !curso ? "text-foreground" : "text-muted-foreground"}`}>{va ? num(l.cantidad) : "Pendiente"}</span>
                      </>
                    );
                    return (
                      <li key={i} className={`flex items-start gap-1 pr-2 ${curso ? "bg-primario-suave/40" : ""}`}>
                        {seleccion && l.itemId ? (
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 py-1.5 pl-3 hover:bg-muted/60">
                            <input type="checkbox" checked={va} onChange={(e) => seleccion.marcar([l.itemId!], e.target.checked)} aria-label={`Enviar ahora ${l.producto} desde ${g.bodega}`} className={`${CASILLA} mt-px`} />
                            {fila}
                          </label>
                        ) : (
                          <span className="flex min-w-0 flex-1 items-start justify-between gap-3 py-1.5 pl-3">{fila}</span>
                        )}
                        {enProceso && l.itemId && (
                          <button
                            type="button"
                            disabled={enProceso.ocupado}
                            onClick={() => enProceso.marcar([l.itemId!], !curso)}
                            aria-label={curso ? `Volver ${l.producto} a pendiente` : `Pasar ${l.producto} a «En proceso»`}
                            title={curso ? "Volver a pendiente" : "Pasar a «En proceso»"}
                            className={`mt-1 ${curso ? A_PENDIENTE : EN_PROCESO}`}
                          >
                            {curso ? "En proceso ✓" : "En proceso"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {ocultas > 0 && !todaEnProceso && (
                <button type="button" onClick={() => alternar(g.bodegaId)} className={ENLACE}>
                  + {num(ocultas)} en proceso (mostrar)
                </button>
              )}
              {!enProceso?.completo && desplegadas.has(g.bodegaId) && !todaEnProceso && enCurso.length > 0 && (
                <button type="button" onClick={() => alternar(g.bodegaId)} className={ENLACE}>
                  Ocultar lo que está en proceso
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Un producto por confirmar: «Llegó completo» o escribir cuánto llegó y qué pasó. */
function FilaConfirmar({ envio, item, foto }: { envio: EnvioPedido; item: ItemPedido; foto: string | null }) {
  const { ocupado, correr } = useAccion();
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const confirmado = envio.cantidadRecibida !== null;
  const igual = envio.cantidadRecibida === envio.cantidadEnviada;
  const distinta = cantidad.trim() !== "" && Number(cantidad) !== envio.cantidadEnviada;
  const corregir = () => {
    setCantidad(String(envio.cantidadRecibida ?? envio.cantidadEnviada));
    setNota(envio.nota ?? "");
    setCorrigiendo(true);
  };
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-2">
        <MiniaturaFoto url={foto} nombre={item.producto} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-medium">{item.producto}</p>
          <p className="m-0 text-xs text-muted-foreground">
            Enviado: <span className="font-semibold text-foreground tabular-nums">{num(envio.cantidadEnviada)}</span>
            {item.codigo ? ` · ${item.codigo}` : ""}
          </p>
        </div>
      </div>
      {corrigiendo ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            correr(() => confirmarLineaPedido(envio.id, cantidad, nota), () => setCorrigiendo(false));
          }}
        >
          <label className="flex w-28 flex-col gap-1 text-xs font-semibold">
            Llegaron
            <input type="number" inputMode="numeric" min={0} step={1} required value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`${fieldClass} w-full`} />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold">
            Qué pasó{distinta ? "" : " (opcional)"}
            <input type="text" maxLength={300} required={distinta} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: faltaron dos en la caja" className={`${fieldClass} w-full`} />
          </label>
          <button type="submit" disabled={ocupado} className={`${BOTON_PEDIDO.principal} min-h-11`}>
            {ocupado ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" disabled={ocupado} onClick={() => setCorrigiendo(false)} className={`${BOTON_PEDIDO.secundario} min-h-11`}>
            Cancelar
          </button>
        </form>
      ) : confirmado ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={igual ? "success" : "warning"}>Llegaron {num(envio.cantidadRecibida!)}</Badge>
          {envio.nota && <span className="text-xs text-muted-foreground">{envio.nota}</span>}
          <button type="button" onClick={corregir} className={`${BOTON_PEDIDO.secundario} ml-auto min-h-11`}>
            Cambiar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={ocupado} onClick={() => correr(() => confirmarLineaPedido(envio.id, envio.cantidadEnviada, ""))} className={`${BOTON_PEDIDO.principal} min-h-11 flex-1 gap-1.5 sm:flex-none`}>
            <CheckIcon className="h-4 w-4" aria-hidden="true" />
            {ocupado ? "Guardando…" : `Llegaron ${num(envio.cantidadEnviada)}`}
          </button>
          <button type="button" disabled={ocupado} onClick={corregir} className={`${BOTON_PEDIDO.secundario} min-h-11 flex-1 sm:flex-none`}>
            Llegó otra cantidad
          </button>
        </div>
      )}
    </li>
  );
}

/** Despacho: la lista de lo que viene, por bodega, para confirmar producto por producto y, al final, «Recibir y transferir». */
export function ConfirmarRecepcion({ p, fotos }: { p: PedidoInventario; fotos: Record<string, string> }) {
  const [abierto, setAbierto] = useState(false);
  const { ocupado, correr } = useAccion();
  const envios = p.envios ?? [];
  const items = new Map(p.items.map((it) => [it.id, it]));
  const confirmados = envios.filter((e) => e.cantidadRecibida !== null).length;
  const bodegas = [...new Set(envios.map((e) => e.bodega))];
  const sinEnviar = p.items.filter((it) => !envios.some((e) => e.itemId === it.id));
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} aria-haspopup="dialog" className={`${BOTON_PEDIDO.principal} min-h-11`}>
        Confirmar lo que llegó ({confirmados}/{envios.length})
      </button>
      <Ventana abierto={abierto} alCerrar={() => setAbierto(false)} titulo={`Recibir ${numeroPedido(p.numero)}`} ancho="lg">
        <div className="flex flex-col gap-4 p-5">
          {bodegas.map((bodega) => (
            <section key={bodega} className="flex flex-col">
              <h3 className="m-0 rounded-md bg-muted px-3 py-1.5 text-xs font-semibold">Desde {bodega}</h3>
              <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                {envios
                  .filter((e) => e.bodega === bodega && items.has(e.itemId))
                  .map((e) => (
                    <FilaConfirmar key={e.id} envio={e} item={items.get(e.itemId)!} foto={fotos[items.get(e.itemId)!.skuId] ?? null} />
                  ))}
              </ul>
            </section>
          ))}
          {sinEnviar.length > 0 && (
            <p className="m-0 text-xs text-muted-foreground">
              No vienen en este envío: {sinEnviar.map((it) => `${it.producto}${it.observacion ? ` (${it.observacion})` : ""}`).join("; ")}.
            </p>
          )}
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card py-3">
            <p className="m-0 text-sm" aria-live="polite">
              <strong className="tabular-nums">{confirmados}</strong> de {envios.length} confirmados
            </p>
            <button type="button" disabled={ocupado || confirmados < envios.length} onClick={() => correr(() => recibirPedidoInventario(p.id), () => setAbierto(false))} className={`${BOTON_PEDIDO.principal} min-h-11`}>
              {ocupado ? "Transfiriendo…" : "Recibir y transferir"}
            </button>
          </div>
        </div>
      </Ventana>
    </>
  );
}
