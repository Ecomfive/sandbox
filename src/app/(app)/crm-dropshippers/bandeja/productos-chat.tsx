"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { cuantoFalta, type MencionEnChat } from "@/lib/crm/productos-chat";
import { formatoMonto, monedaPublicaciones } from "@/lib/publicaciones/moneda";
import { EtapaCotizando, LlegadaCamino } from "../../publicaciones-dropi/llegada-camino";
import { avisarCuandoLlegue } from "../tareas/actions";
import { buscarProductosChat, fijarProductoChat, productosDelChat, type PrecioDropi, type ProductoDelChat, type ProductosDelChat } from "./productos-chat-actions";

const entero = (n: number) => n.toLocaleString("es-PA");
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });

/** De dónde salió el producto: «Lo pidió el 29 oct: “Para la creatina”», «Se le pasó el ID 51188 · 29 oct» o el análisis con IA. */
function textoMencion(m: MencionEnChat): string {
  const cuando = fechaCorta(m.momento);
  const veces = m.veces > 1 ? ` · ${m.veces} veces` : "";
  if (m.como === "id") return `${m.direccion === "saliente" ? "Se le pasó el" : "Preguntó por el"} ${m.cita} · ${cuando}${veces}`;
  if (m.como === "analisis") return `Lo encontró el análisis con IA del ${cuando}`;
  return `Lo pidió el ${cuando}: «${m.cita}»${veces}`;
}

/**
 * «Productos que pregunta» en la ficha del chat (pedido de Hernán, 29 oct 2026): los que se nombran en toda la conversación (por nombre, por
 * una palabra como «la creatina», por el ID de Dropi o por el análisis con IA) salen solos como sugerencia, diciendo cuándo y cómo se pidieron,
 * y cualquiera se fija con «Agregar producto». De cada uno, cuánto viene en camino a su país y cuándo llega, como la
 * columna «En camino» de Gestión de IDs Dropi; así se le responde «llega el 12 nov» sin salir del chat. Lo que viene en camino tiene
 * «Avisarme cuando llegue» (29 oct 2026): una tarea que se activa cuando llega de verdad, para avisarle al cliente. `alCambio` avisa
 * que se creó una tarea.
 */
export function ProductosDelChatFicha({
  conversacionId,
  escribe,
  puedeAvisar = escribe,
  alAviso,
  alCambio,
}: {
  conversacionId: string;
  /** Fijar y quitar productos (no supervisando). */
  escribe: boolean;
  /** «Avisarme cuando llegue»: también supervisando, como «Tarea». */
  puedeAvisar?: boolean;
  alAviso: (texto: string, error?: boolean) => void;
  alCambio?: () => void;
}) {
  const [datos, setDatos] = useState<ProductosDelChat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [resultados, setResultados] = useState<{ id: string; nombre: string; codigo: string | null }[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // La bandeja lo monta de nuevo con cada chat (`key`), así que lo que llega siempre es de este chat.
  const vigente = useRef(true);

  const aplicar = (r: ProductosDelChat | { error: string }) => {
    if (!vigente.current) return;
    if ("error" in r) setError(r.error);
    else {
      setError(null);
      setDatos(r);
    }
  };

  useEffect(() => {
    vigente.current = true;
    productosDelChat(conversacionId)
      .then(aplicar)
      .catch(() => vigente.current && setError("No se pudieron cargar los productos."));
    return () => {
      vigente.current = false;
    };
  }, [conversacionId]);

  useEffect(() => {
    const t = buscar.trim();
    if (t.length < 2) return;
    let mio = true;
    const espera = setTimeout(() => {
      buscarProductosChat(conversacionId, t)
        .then((r) => mio && setResultados("error" in r ? [] : r.productos))
        .catch(() => mio && setResultados([]));
    }, 300);
    return () => {
      mio = false;
      clearTimeout(espera);
    };
  }, [buscar, conversacionId]);

  const fijar = async (skuId: string, si: boolean) => {
    setOcupado(skuId);
    const r = await fijarProductoChat(conversacionId, skuId, si);
    setOcupado(null);
    if ("error" in r) return alAviso(r.error, true);
    setBuscar("");
    setResultados([]);
    aplicar(await productosDelChat(conversacionId));
  };

  const avisar = async (p: ProductoDelChat) => {
    setOcupado(p.id);
    const r = await avisarCuandoLlegue(conversacionId, p.id).catch(() => ({ error: "No se pudo crear el aviso." }));
    setOcupado(null);
    if ("error" in r) return alAviso(r.error, true);
    alAviso(`Listo: cuando llegue ${p.nombre}, te sale la tarea de avisarle (y la campana te avisa).`);
    alCambio?.();
    aplicar(await productosDelChat(conversacionId));
  };

  const hoy = new Date().toISOString().slice(0, 10);
  const ofrecidos = buscar.trim().length >= 2 ? resultados : [];
  const puedeFijar = escribe && !!datos?.sePuedeFijar;

  return (
    <div className="flex flex-col gap-2 border-b-8 border-[var(--wa-panel)] px-5 py-4">
      <h3 className="m-0 text-[13px] font-normal text-[var(--wa-sec)]">{`Productos que pregunta${datos?.pais ? ` · llegada a ${datos.pais.nombre}` : ""}`}</h3>
      {error ? (
        <span className="text-[13px] text-destructive">{error}</span>
      ) : !datos ? (
        <span className="text-[13px] text-[var(--wa-sec)]">Buscando qué productos nombra…</span>
      ) : (
        <>
          {!datos.pais && <span className="text-[12.5px] text-[var(--wa-sec)]">No se sabe de qué país es: vincúlalo a un dropshipper con país para ver cuándo llega lo que pregunta.</span>}
          {datos.productos.length === 0 && <span className="text-[13px] text-[var(--wa-sec)]">No nombra ningún producto del catálogo. Agrégalo abajo si pregunta por uno.</span>}
          {datos.productos.map((p) => (
            <div key={p.id} className="flex gap-2.5 rounded-lg border border-[var(--wa-borde)] bg-[var(--wa-fondo)] px-2.5 py-2">
              {p.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.foto} alt="" className="h-10 w-10 flex-none rounded-md object-cover" />
              ) : (
                <span aria-hidden="true" className="h-10 w-10 flex-none rounded-md bg-[var(--wa-panel)]" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px] [overflow-wrap:anywhere]">
                <span className="font-medium leading-tight">{p.nombre}</span>
                {p.codigo && <span className="text-[11.5px] text-[var(--wa-sec)]">{p.codigo}</span>}
                {p.mencion ? (
                  <span className="text-[11.5px] text-[var(--wa-sec)] italic">{textoMencion(p.mencion)}</span>
                ) : (
                  !p.fijado && <span className="text-[11.5px] text-[var(--wa-sec)]">Lo nombra en el chat</span>
                )}
                {datos.pais && <PreciosDropi precios={p.precios} pais={datos.pais} />}
                <EnCamino p={p} hoy={hoy} />
                {p.aviso ? (
                  <span className="mt-0.5 text-[12px] font-medium text-[var(--wa-acento)]">Te avisamos cuando llegue para que le escribas.</span>
                ) : (
                  puedeAvisar &&
                  p.enCamino > 0 && (
                    <button
                      type="button"
                      disabled={ocupado === p.id}
                      onClick={() => void avisar(p)}
                      className={`mt-0.5 self-start rounded-md border border-[var(--wa-borde)] px-2 py-0.5 text-[12px] font-medium text-[var(--wa-acento)] hover:bg-[var(--wa-panel)] disabled:opacity-50 ${anilloFoco}`}
                    >
                      Avisarme cuando llegue
                    </button>
                  )
                )}
              </div>
              {puedeFijar && (
                <button
                  type="button"
                  disabled={ocupado === p.id}
                  onClick={() => void fijar(p.id, !p.fijado)}
                  title={p.fijado ? "Quitarlo de la ficha" : "Dejarlo en la ficha de este chat"}
                  className={`self-start rounded-md px-1.5 py-0.5 text-[12px] font-medium disabled:opacity-50 ${p.fijado ? "text-[var(--wa-sec)] hover:bg-[var(--wa-panel)]" : "text-[var(--wa-acento)] hover:bg-[var(--wa-panel)]"} ${anilloFoco}`}
                >
                  {p.fijado ? "Quitar" : "Fijar"}
                </button>
              )}
            </div>
          ))}
          {puedeFijar && (
            <div className="relative mt-1">
              <input
                type="search"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Agregar producto (nombre o código)"
                aria-label="Agregar un producto a la ficha"
                className={`w-full rounded-lg border border-[var(--wa-borde)] bg-[var(--wa-fondo)] px-2.5 py-1.5 text-[13px] ${anilloFoco}`}
              />
              {ofrecidos.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-10 m-0 mt-1 max-h-64 list-none overflow-y-auto rounded-lg border border-[var(--wa-borde)] bg-[var(--wa-fondo)] p-1 shadow-lg">
                  {ofrecidos.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        disabled={ocupado === r.id}
                        onClick={() => void fijar(r.id, true)}
                        className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[var(--wa-panel)] disabled:opacity-50 ${anilloFoco}`}
                      >
                        {r.nombre}
                        {r.codigo && <span className="text-[11.5px] text-[var(--wa-sec)]">{r.codigo}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {escribe && !datos.sePuedeFijar && <span className="text-[12px] text-[var(--wa-sec)]">Para fijar productos falta correr la migración 0180 en la base.</span>}
        </>
      )}
    </div>
  );
}

/**
 * El precio actual en Dropi de cada ID del producto en el país del chat (31 oct 2026, pedido de Hernán): «ID 51188 · $12.50», primero el ID que
 * se nombró en el chat (resaltado). Así se le contesta el precio sin salir del chat. Sin publicación allá, lo dice.
 */
function PreciosDropi({ precios, pais }: { precios: PrecioDropi[]; pais: { nombre: string; codigo: string } }) {
  if (!precios.length) return <span className="text-[12.5px] text-[var(--wa-sec)]">{`No está publicado en Dropi ${pais.nombre}.`}</span>;
  const moneda = monedaPublicaciones(pais.codigo, {});
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[12.5px]" aria-label={`Precio actual en Dropi ${pais.nombre}`}>
      {precios.map((x, i) => (
        <li key={`${x.dropiId ?? "sin-id"}-${i}`} className={`flex flex-wrap items-baseline gap-x-1.5 ${x.nombrado ? "font-semibold text-[var(--wa-texto)]" : "text-[var(--wa-sec)]"}`}>
          <span>{x.dropiId ? `ID ${x.dropiId}` : "Sin ID"}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums font-semibold text-[var(--wa-texto)]">{x.precio === null ? "sin precio" : formatoMonto(x.precio, moneda)}</span>
          {x.nombrado && <span className="rounded-full bg-[var(--wa-acento-suave)] px-1.5 text-[11px] font-medium text-[var(--wa-acento-suave-texto)]">el que nombró</span>}
          {x.enEspera && <span className="text-[11.5px] font-normal text-warning">en espera</span>}
          {x.cambio && <span className="text-[11.5px] font-normal text-[var(--wa-sec)]">{`· precio desde el ${fechaCorta(`${x.cambio}T12:00:00Z`)}`}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Lo que viene en camino de un producto: unidades y cuándo llega («llega 12 nov · en 14 días»), y lo que todavía se cotiza. */
function EnCamino({ p, hoy }: { p: ProductoDelChat; hoy: string }) {
  if (p.enCamino === 0 && p.cotizando === 0) return <span className="text-[12.5px] text-[var(--wa-sec)]">Nada en camino a este país.</span>;
  return (
    <div className="flex flex-col gap-0.5 text-[12.5px]">
      {p.enCamino > 0 && (
        <span className="flex flex-wrap items-center gap-1.5 font-medium text-success">
          <span className="tabular-nums">{entero(p.enCamino)} en camino</span>
          {p.llegada && <span>· llega</span>}
          <LlegadaCamino llegada={p.llegada} sinFecha={p.sinFecha} sinEnvio={p.sinEnvio} />
          {p.llegada && <span className="font-normal text-[var(--wa-sec)]">({cuantoFalta(p.llegada, hoy)})</span>}
        </span>
      )}
      {p.cotizando > 0 && (
        <span className="flex flex-wrap items-center gap-1.5 text-warning">
          <span className="tabular-nums">{`${p.enCamino > 0 ? "+ " : ""}${entero(p.cotizando)} en cotización`}</span>
          {p.etapa && <EtapaCotizando c={p.etapa} />}
        </span>
      )}
    </div>
  );
}
