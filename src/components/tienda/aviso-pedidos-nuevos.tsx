"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { pedidosNuevos, type PedidoNuevo } from "@/app/(app)/tienda-pedidos/avisos-actions";
import { formatearMoneda } from "@/lib/formato";
import { CerrarIcon, PedidoIcon, SilencioIcon, SonidoIcon } from "@/lib/nav-icons";

/**
 * Dónde sale el aviso (16 nov 2026, pedido de Hernán): solo en Pedidos de tienda y en las páginas de despacho, para que no distraiga a quien trabaja en
 * Compras, Producto u otro panel. Fuera de estas páginas no se pregunta ni se muestra nada.
 */
const PAGINAS_DEL_AVISO = ["/tienda-pedidos", "/tienda-pedidos/logistica", "/despacho-ciudad", "/despacho-ciudad/devoluciones"];
/** Las pestañas de esos paneles que no son de pedidos por despachar (17 nov 2026: ahora cuelgan de Pedidos y de Despacho ciudad). */
const PESTANAS_SIN_AVISO = ["/tienda-pedidos/confirmacion", "/tienda-pedidos/cuanto-hay", "/despacho-ciudad/cambios", "/despacho-ciudad/cuanto-hay", "/despacho-ciudad/pedir-inventario"];

const enRuta = (ruta: string, p: string) => ruta === p || ruta.startsWith(`${p}/`);

export function paginaConAvisoDePedidos(ruta: string | null): boolean {
  return !!ruta && PAGINAS_DEL_AVISO.some((p) => enRuta(ruta, p)) && !PESTANAS_SIN_AVISO.some((p) => enRuta(ruta, p));
}

/** Cada cuánto se pregunta por pedidos nuevos (solo con la pestaña a la vista). */
const CADA_MS = 30_000;
/** Cuánto queda a la vista una tarjeta si nadie la cierra. */
const DURA_MS = 60_000;

/** Un «ding» corto con el audio del navegador (sin archivos). Si el navegador no deja sonar todavía, no pasa nada. */
export function sonar() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    o.onended = () => void ctx.close();
  } catch {
    // Sin sonido: el aviso igual se ve.
  }
}

// El sonido se puede silenciar desde el mismo aviso (14 nov 2026, pedido de Hernán): los avisos siguen cayendo, solo no suenan. Se recuerda en el navegador de cada
// persona y vale para todas sus pestañas; desde un aviso se vuelve a activar.
const CLAVE_SILENCIO = "aviso-pedidos-silenciado-v1";
const oyentes = new Set<() => void>();
// Respaldo cuando el navegador no deja guardar (ventana privada o sitio bloqueado): vale hasta recargar.
// «1» = silenciado, «0» = con sonido; sin nada, lo que toque por el rol (`sonidoPorDefecto`).
let memoria: boolean | null = null;

function leerSilencio(): boolean | null {
  try {
    const v = window.localStorage.getItem(CLAVE_SILENCIO);
    return v === "1" ? true : v === "0" ? false : memoria;
  } catch {
    return memoria;
  }
}

function guardarSilencio(silenciado: boolean) {
  memoria = silenciado;
  try {
    window.localStorage.setItem(CLAVE_SILENCIO, silenciado ? "1" : "0");
  } catch {
    // Queda en memoria hasta recargar.
  }
  for (const o of oyentes) o();
}

function suscribir(alCambiar: () => void) {
  oyentes.add(alCambiar);
  window.addEventListener("storage", alCambiar);
  return () => {
    oyentes.delete(alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

/**
 * El aviso de «Nuevo pedido» (12 nov 2026, pedido de Hernán, como en la app de Jorge): cuando cae un pedido en una tienda conectada a Shopify, abajo a la
 * derecha sale una tarjeta con la tienda, el número y el total, y un sonido corto; «Ver» abre el pedido. Se pregunta cada 30 segundos mientras la pestaña
 * está a la vista. Desde el 16 nov 2026 es para el equipo de despacho (quien tiene Despacho ciudad) y sale solo en Pedidos de tienda, Logística y las
 * páginas de despacho; a Admin y CEO les llega sin sonido de entrada (`sonidoPorDefecto`), y cada uno lo activa o silencia con la cornetita.
 */
export function AvisoPedidosNuevos({ codigoPais, sonidoPorDefecto }: { codigoPais: string; sonidoPorDefecto: boolean }) {
  const [avisos, setAvisos] = useState<PedidoNuevo[]>([]);
  const desde = useRef<string>(new Date().toISOString());
  const vistos = useRef(new Set<string>());
  const activo = paginaConAvisoDePedidos(usePathname());
  const silenciado = useCallback(() => leerSilencio() ?? !sonidoPorDefecto, [sonidoPorDefecto]);
  const sinSonido = useSyncExternalStore(suscribir, silenciado, () => !sonidoPorDefecto);
  // El ciclo de revisión vive todo el tiempo: lee el estado actual y no el del momento en que se montó.
  const sinSonidoAhora = useRef(sinSonido);
  useEffect(() => {
    sinSonidoAhora.current = sinSonido;
  }, [sinSonido]);

  useEffect(() => {
    if (!activo) return;
    // Al entrar a una página del aviso se cuenta desde ahora: lo que cayó mientras estaba en otro panel ya está en la lista de Pedidos.
    desde.current = new Date().toISOString();
    let vivo = true;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    async function revisar() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await pedidosNuevos(desde.current);
        if (!vivo || "error" in r) return;
        desde.current = r.hasta;
        const nuevos = r.pedidos.filter((p) => !vistos.current.has(p.id));
        if (!nuevos.length) return;
        for (const p of nuevos) vistos.current.add(p.id);
        setAvisos((a) => [...a, ...nuevos].slice(-4));
        if (!sinSonidoAhora.current) sonar();
        for (const p of nuevos) setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== p.id)), DURA_MS);
      } catch {
        // Sin red: se vuelve a intentar en la próxima vuelta.
      }
    }
    function ciclo() {
      temporizador = setTimeout(async () => {
        await revisar();
        if (vivo) ciclo();
      }, CADA_MS);
    }
    ciclo();
    const alVolver = () => void revisar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activo]);

  if (!activo || !avisos.length) return null;
  return (
    <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      {avisos.map((p) => (
        <div key={p.id} role="status" className="flex items-center gap-3 rounded-xl border border-primario/40 bg-card px-3.5 py-3 shadow-lg">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primario-suave text-primario">
            <PedidoIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="m-0 font-semibold">Nuevo pedido · {p.tienda}</p>
            <p className="m-0 truncate text-muted-foreground">
              {p.numero} · {formatearMoneda(p.total, codigoPais)}
            </p>
          </div>
          <Tooltip texto={sinSonido ? "Activar sonido" : "Silenciar avisos"}>
            <button
              type="button"
              aria-label={sinSonido ? "Activar el sonido de los avisos de pedidos nuevos" : "Silenciar el sonido de los avisos de pedidos nuevos"}
              aria-pressed={sinSonido}
              onClick={() => {
                guardarSilencio(!sinSonido);
                // Al volver a activarlo suena una vez, para saber que funciona.
                if (sinSonido) sonar();
              }}
              className={`shrink-0 rounded-md p-1 hover:bg-muted ${sinSonido ? "text-warning" : "text-muted-foreground"} ${anilloFoco}`}
            >
              {sinSonido ? <SilencioIcon className="h-4 w-4" /> : <SonidoIcon className="h-4 w-4" />}
            </button>
          </Tooltip>
          <Link href={`/tienda-pedidos?pedido=${p.id}`} className={`shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-primario hover:bg-primario-suave ${anilloFoco}`}>
            Ver
          </Link>
          <button
            type="button"
            aria-label={`Cerrar el aviso del pedido ${p.numero}`}
            onClick={() => setAvisos((a) => a.filter((x) => x.id !== p.id))}
            className={`shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted ${anilloFoco}`}
          >
            <CerrarIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
