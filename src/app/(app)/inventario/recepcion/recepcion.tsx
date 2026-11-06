"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { useToast } from "@/components/ui/toast";
import { formatearFecha } from "@/lib/formato";
import { BuscarIcon } from "@/lib/nav-icons";
import { diferenciaRecepcion } from "@/lib/wms/recepcion";
import { recibirCompra } from "./actions";

export interface LineaPorRecibir {
  id: string;
  codigo: string;
  nombre: string;
  foto: string | null;
  pedida: number;
  lote: number;
  manejaVencimiento: boolean;
  /** Por qué no se puede recibir (un compuesto, un producto en Test…), o `null`. */
  bloqueo: string | null;
}

export interface CompraPorRecibir {
  id: string;
  codigo: string;
  nombre: string;
  etapa: string;
  proveedor: string | null;
  llegada: string | null;
  lineas: LineaPorRecibir[];
}

interface Escrito {
  llego: string;
  nota: string;
  lote: string;
  vencimiento: string;
}

const VACIO: Escrito = { llego: "", nota: "", lote: "", vencimiento: "" };
const sinAcentos = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const entero = (n: number) => n.toLocaleString("es-PA");
const cantidadDe = (t: string) => {
  const n = t.trim() === "" ? null : Number(t);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * Recepción de una compra (migración 0241, flujograma de Costa Rica): se elige la compra, se escribe cuánto llegó de cada producto y lo que no cuadra lleva una nota. Lo escrito entra
 * al inventario de la bodega elegida en un solo paso, y el faltante queda en la compra. Un producto en blanco sigue pendiente, y una línea se recibe una sola vez.
 */
export function Recepcion({
  compras,
  bodegas,
  ubicaciones,
  puedeEscribir,
}: {
  compras: CompraPorRecibir[];
  bodegas: { id: string; nombre: string }[];
  ubicaciones: { id: string; bodegaId: string; codigo: string }[];
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, startTransition] = useTransition();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [bodega, setBodega] = useState(bodegas[0]?.id ?? "");
  const [ubicacion, setUbicacion] = useState("");
  const [escritos, setEscritos] = useState<Record<string, Escrito>>({});
  const [error, setError] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const q = sinAcentos(buscar.trim());
    return compras.filter((c) => !q || sinAcentos(`${c.codigo} ${c.nombre} ${c.lineas.map((l) => `${l.codigo} ${l.nombre}`).join(" ")}`).includes(q));
  }, [compras, buscar]);
  const compra = compras.find((c) => c.id === abierta) ?? null;
  const delaBodega = ubicaciones.filter((u) => u.bodegaId === bodega);

  const escritoDe = (id: string) => escritos[id] ?? VACIO;
  const cambiar = (id: string, cambio: Partial<Escrito>) => setEscritos((x) => ({ ...x, [id]: { ...escritoDe(id), ...cambio } }));
  const lineasEscritas = (compra?.lineas ?? []).filter((l) => !l.bloqueo && cantidadDe(escritoDe(l.id).llego) !== null);
  const faltaNota = lineasEscritas.some((l) => cantidadDe(escritoDe(l.id).llego) !== l.pedida && !escritoDe(l.id).nota.trim());
  const faltaLote = lineasEscritas.some((l) => l.manejaVencimiento && cantidadDe(escritoDe(l.id).llego) !== 0 && (!escritoDe(l.id).lote.trim() || !escritoDe(l.id).vencimiento));
  const unidades = lineasEscritas.reduce((t, l) => t + (cantidadDe(escritoDe(l.id).llego) ?? 0), 0);
  const nombreBodega = bodegas.find((b) => b.id === bodega)?.nombre ?? "";

  const recibir = () => {
    if (!compra) return;
    setError(null);
    const items = lineasEscritas.map((l) => {
      const e = escritoDe(l.id);
      return { item: l.id, cantidad: cantidadDe(e.llego), nota: e.nota, ubicacion: ubicacion || null, lote_codigo: l.manejaVencimiento ? e.lote : null, vencimiento: l.manejaVencimiento ? e.vencimiento : null };
    });
    startTransition(async () => {
      const r = await recibirCompra(compra.id, bodega, items);
      if (r.error) {
        setError(r.error);
        return;
      }
      mostrarToast(`${compra.codigo}: ${entero(r.unidades ?? 0)} u. recibidas en ${nombreBodega}${r.faltan ? ` · faltaron ${entero(r.faltan)} u.` : ""}`);
      setEscritos({});
      setAbierta(null);
      router.refresh();
    });
  };

  if (compra) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex min-w-0 flex-1 basis-72 flex-col gap-0.5">
            <button type="button" onClick={() => { setAbierta(null); setError(null); }} className={`w-fit text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}>
              ← Todas las compras
            </button>
            <h2 className="m-0 text-base font-semibold">{compra.codigo}</h2>
            <p className="m-0 text-sm text-muted-foreground">{compra.nombre}</p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Entra a</span>
            <select value={bodega} onChange={(e) => { setBodega(e.target.value); setUbicacion(""); }} disabled={pendiente} className={`${fieldClassSm} min-w-40`}>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </label>
          {delaBodega.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted-foreground">Ubicación (opcional)</span>
              <select value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} disabled={pendiente} className={`${fieldClassSm} min-w-36`}>
                <option value="">Sin ubicación</option>
                {delaBodega.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <ContenedorTabla ariaLabel={`Recepción de ${compra.codigo}`}>
          <table className="tabla-datos w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className={claseFilaEncabezado}>
                <th scope="col" className={claseEncabezadoColumna}>Foto</th>
                <th scope="col" className={claseEncabezadoColumna}>Producto</th>
                <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Pedidas</th>
                <th scope="col" className={claseEncabezadoColumna}>Llegaron</th>
                <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {compra.lineas.map((l) => {
                const e = escritoDe(l.id);
                const llego = cantidadDe(e.llego);
                const dif = llego === null ? null : diferenciaRecepcion(l.pedida, llego);
                return (
                  <tr key={l.id} className="border-b border-border align-top">
                    <td className={claseCeldaColumna}>
                      <MiniaturaFoto url={l.foto} nombre={l.nombre} />
                    </td>
                    <td className={claseCeldaColumna}>
                      <span className="block font-medium">{l.codigo}</span>
                      <span className="block text-xs text-muted-foreground">{l.nombre}</span>
                      <span className="block text-xs text-muted-foreground">Lote #{l.lote}</span>
                    </td>
                    <td className={`${claseCeldaColumna} text-right tabular-nums`}>{entero(l.pedida)}</td>
                    <td className={claseCeldaColumna}>
                      {l.bloqueo ? (
                        <span className="text-xs text-warning">{l.bloqueo}</span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              aria-label={`Llegaron de ${l.codigo}`}
                              disabled={!puedeEscribir || pendiente}
                              value={e.llego}
                              onChange={(ev) => cambiar(l.id, { llego: ev.target.value })}
                              placeholder="—"
                              className={`${fieldClassSm} w-28 text-right tabular-nums`}
                            />
                            {puedeEscribir && llego === null && (
                              <button type="button" disabled={pendiente} onClick={() => cambiar(l.id, { llego: String(l.pedida) })} className="rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                                Llegó todo
                              </button>
                            )}
                          </div>
                          {dif !== null && dif !== 0 && (
                            <input
                              aria-label={`Qué pasó con ${l.codigo}`}
                              disabled={!puedeEscribir || pendiente}
                              value={e.nota}
                              onChange={(ev) => cambiar(l.id, { nota: ev.target.value })}
                              maxLength={300}
                              placeholder="Qué pasó (obligatorio)"
                              className={`${fieldClassSm} w-full max-w-72`}
                            />
                          )}
                          {l.manejaVencimiento && llego !== null && llego > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <input aria-label={`Lote de ${l.codigo}`} disabled={!puedeEscribir || pendiente} value={e.lote} onChange={(ev) => cambiar(l.id, { lote: ev.target.value })} maxLength={80} placeholder="Lote" className={`${fieldClassSm} w-28`} />
                              <input type="date" aria-label={`Vencimiento de ${l.codigo}`} disabled={!puedeEscribir || pendiente} value={e.vencimiento} onChange={(ev) => cambiar(l.id, { vencimiento: ev.target.value })} className={`${fieldClassSm} w-36`} />
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`${claseCeldaColumna} text-right`}>
                      {dif === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : dif === 0 ? (
                        <span className="text-success">Cuadra</span>
                      ) : (
                        <span className={`font-semibold tabular-nums ${dif > 0 ? "text-success" : "text-destructive"}`}>
                          {dif > 0 ? `+${entero(dif)}` : `Faltan ${entero(-dif)}`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ContenedorTabla>

        {puedeEscribir && (
          <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
            <p className="m-0 text-sm">
              <strong className="tabular-nums">{lineasEscritas.length}</strong> de {compra.lineas.length} {compra.lineas.length === 1 ? "producto" : "productos"} · <strong className="tabular-nums">{entero(unidades)}</strong> unidades. Lo que dejes en blanco sigue pendiente.
            </p>
            {faltaNota && <p className="m-0 text-sm text-warning">Anota qué pasó con lo que no cuadra.</p>}
            {faltaLote && <p className="m-0 text-sm text-warning">Falta el lote y su vencimiento.</p>}
            {error && (
              <p role="alert" className="m-0 text-sm text-destructive">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={recibir}
              disabled={pendiente || lineasEscritas.length === 0 || faltaNota || faltaLote || !bodega}
              className="ml-auto min-h-10 rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
            >
              {pendiente ? "Guardando…" : `Recibir en ${nombreBodega}`}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">Buscar</span>
          <span className="relative">
            <BuscarIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Compra o producto" className={`${fieldClassSm} w-64 pl-8`} />
          </span>
        </label>
        <p className="m-0 text-xs text-muted-foreground">Las compras en camino o que ya llegaron, con lo que falta por recibir. Las completadas no salen: ya están en el levantamiento.</p>
      </div>
      <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
        {visibles.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{compras.length ? "Ninguna compra coincide." : "No hay compras por recibir."}</li>}
        {visibles.map((c) => {
          const pedidas = c.lineas.reduce((t, l) => t + l.pedida, 0);
          return (
            <li key={c.id}>
              <button type="button" onClick={() => setAbierta(c.id)} className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/50 ${anilloFoco}`}>
                <span className="min-w-0 flex-1 basis-72">
                  <span className="block truncate text-sm font-medium">{c.codigo}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.lineas.map((l) => l.nombre).join(" · ")}</span>
                </span>
                {c.etapa === "arribo_mercancia" ? <Badge tone="success">Llegó</Badge> : <Badge tone="azul">En camino</Badge>}
                <span className="w-28 text-right text-xs text-muted-foreground">{c.llegada ? formatearFecha(c.llegada) : "Sin fecha"}</span>
                <span className="w-24 text-right text-sm tabular-nums">{entero(pedidas)} u.</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
