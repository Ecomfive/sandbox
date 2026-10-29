"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { cuantoFalta, type MencionEnChat } from "@/lib/crm/productos-chat";
import { EtapaCotizando, LlegadaCamino } from "../../publicaciones-dropi/llegada-camino";
import { buscarProductosChat, fijarProductoChat, productosDelChat, type ProductoDelChat, type ProductosDelChat } from "./productos-chat-actions";

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
 * columna «En camino» de Gestión de IDs Dropi; así se le responde «llega el 12 nov» sin salir del chat.
 */
export function ProductosDelChatFicha({ conversacionId, escribe, alAviso }: { conversacionId: string; escribe: boolean; alAviso: (texto: string) => void }) {
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
    if ("error" in r) return alAviso(r.error);
    setBuscar("");
    setResultados([]);
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
                <EnCamino p={p} hoy={hoy} />
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
