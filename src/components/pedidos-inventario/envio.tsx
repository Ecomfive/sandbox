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

/** «Qué buscar en cada bodega»: los productos del pedido agrupados por la bodega de donde salen. */
export function PorBodega({ grupos, titulo = true }: { grupos: GrupoBodega[]; titulo?: boolean }) {
  if (!grupos.length) return <p className="m-0 text-xs text-muted-foreground">Todavía no hay cantidades que sacar de ninguna bodega.</p>;
  return (
    <div className="flex flex-col gap-2">
      {titulo && <h3 className="m-0 text-xs font-semibold text-foreground">Qué buscar en cada bodega</h3>}
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))]">
        {grupos.map((g) => (
          <section key={g.bodegaId} className="overflow-hidden rounded-lg border border-border bg-card" aria-label={g.bodega}>
            <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-2 bg-muted px-3 py-1.5 text-xs">
              <span className="font-semibold text-foreground">{g.bodega}</span>
              <span className="text-muted-foreground">
                {num(g.lineas.length)} {g.lineas.length === 1 ? "producto" : "productos"} · {num(g.unidades)} u.
              </span>
            </p>
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0 text-xs">
              {g.lineas.map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0 text-foreground">{l.producto}</span>
                  <span className="font-semibold text-foreground tabular-nums">{num(l.cantidad)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
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
