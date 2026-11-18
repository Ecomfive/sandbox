"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { AnunciosIcon, ChevronRightIcon, EtiquetaIcon, EstadoIcon, MargenIcon, PersonaIcon, ProductoIcon, TiendaIcon, CalendarioIcon, FiltroIcon } from "@/lib/nav-icons";
import { cpa, ctr, dolares, nivelDeCpa, nivelDeCtr } from "@/lib/meta-ads/metricas";
import type { CuentaVista } from "@/lib/meta-ads/datos";
import type { AnuncioVista, CampanaVista } from "@/lib/meta-ads/vistas";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_CAMPANAS, NOMBRE_VEREDICTO, veredictoDe } from "./def-campanas";
import { FichaCampana } from "./ficha-campana";
import { InsigniaEstructura, InsigniaEtapa, Nivel, nombreEstado, porcentaje, Resultado, valorCpa } from "./piezas";

const NOMBRE: NombreFilas = { singular: "campaña", plural: "campañas" };
const ICONOS: Record<string, IconoComp> = { nombre: ProductoIcon, veredicto: MargenIcon, etapa: EtiquetaIcon, estado: EstadoIcon, estructura: FiltroIcon, puja: FiltroIcon, mercado: TiendaIcon, videos: AnunciosIcon, producto: ProductoIcon, angulo: EtiquetaIcon, cuenta: TiendaIcon, persona: PersonaIcon, meta: EstadoIcon, gasto: MargenIcon, compras: MargenIcon, creada: CalendarioIcon };

const COLUMNAS = "lg:grid-cols-[minmax(0,2.6fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_1rem]";

function EncabezadoFilas() {
  return (
    <div aria-hidden="true" className={`hidden gap-3 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid ${COLUMNAS}`}>
      <span>Campaña</span>
      <span>Tipo</span>
      <span className="text-right">Gasto</span>
      <span className="text-right">Compras</span>
      <span className="text-right">CPA</span>
      <span className="text-right">Resultado estimado</span>
      <span />
    </div>
  );
}

function FilaCampana({ c, alAbrir }: { c: CampanaVista; alAbrir: () => void }) {
  const v = veredictoDe(c);
  const punto = v === "pierde" ? "bg-destructive" : v === "deja" ? "bg-success" : "bg-muted-foreground";
  return (
    <button type="button" onClick={alAbrir} className={`grid w-full cursor-pointer grid-cols-1 gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground ${COLUMNAS}`}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span role="img" aria-label={NOMBRE_VEREDICTO[v]} className={`h-2 w-2 shrink-0 rounded-full ${punto}`} />
          <span className="truncate text-sm font-medium">{c.nombre}</span>
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {c.mercado ?? c.cuentaNombre}
          {c.videos ? ` · ${c.videos}` : ""}
          {c.persona ? ` · la montó ${c.persona}` : ""}
          {c.creadaEn ? ` · ${c.creadaEn.slice(0, 10)}` : ""}
          {c.activa ? "" : ` · ${nombreEstado(c.estado)}`}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <InsigniaEtapa etapa={c.etapa} />
        <InsigniaEstructura estructura={c.estructura} puja={c.puja} />
      </span>
      <span className="text-sm tabular-nums lg:text-right">
        <span className="sr-only">Gasto: </span>
        {c.r.gasto > 0 ? dolares(c.r.gasto) : "—"}
      </span>
      <span className="text-sm tabular-nums lg:text-right">
        <span className="sr-only">Compras: </span>
        {c.r.gasto > 0 ? c.r.compras : "—"}
      </span>
      <span className="text-sm lg:text-right">
        <span className="sr-only">CPA: </span>
        {c.r.compras > 0 ? <Nivel nivel={nivelDeCpa(cpa(c.r), c.tope)}>{valorCpa(c.r)}</Nivel> : "—"}
        {c.r.impresiones > 0 && <span className="block text-xs text-muted-foreground">CTR <Nivel nivel={nivelDeCtr(ctr(c.r))}>{porcentaje(ctr(c.r))}</Nivel></span>}
      </span>
      <span className="lg:text-right">
        <span className="sr-only">Resultado estimado: </span>
        <Resultado r={c.r} tope={c.tope} />
        {!c.topeDefinido && c.r.gasto > 0 && <span className="block text-xs text-muted-foreground">con tope {dolares(c.tope)}</span>}
      </span>
      <ChevronRightIcon aria-hidden="true" className="hidden h-4 w-4 text-muted-foreground lg:block" />
    </button>
  );
}

/** Todas las campañas con la barra común (buscar, filtrar, agrupar, descargar). Tocar una fila abre su ficha, que queda en la dirección (`?abrir=<id>`). */
export function CampanasLista({ campanas, anuncios, cuentas, productos, escribe, abrirInicial }: { campanas: CampanaVista[]; anuncios: AnuncioVista[]; cuentas: CuentaVista[]; productos: string[]; escribe: boolean; abrirInicial: string | null }) {
  const [abierta, setAbierta] = useState<string | null>(() => (abrirInicial && campanas.some((c) => c.id === abrirInicial) ? abrirInicial : null));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (abierta) url.searchParams.set("abrir", abierta);
    else url.searchParams.delete("abrir");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [abierta]);
  const [orden, setOrden] = useState<string[]>([]);
  // La ficha se dibuja en `<body>` (portal): con `?abrir=` arranca abierta, así que solo se monta ya en el navegador.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const campana = enNavegador ? campanas.find((c) => c.id === abierta) : undefined;
  const i = campana ? orden.indexOf(campana.id) : -1;
  return (
    <>
      <ListaDatos
        def={DEF_CAMPANAS}
        filas={campanas}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(c) => c.id}
        variante="filas"
        encabezado={<EncabezadoFilas />}
        formatearTotal={dolares}
        renderFila={(c, enOrden) => (
          <FilaCampana
            c={c}
            alAbrir={() => {
              setOrden(enOrden.map((x) => x.id));
              setAbierta(c.id);
            }}
          />
        )}
        vacio="Todavía no hay campañas leídas. Pulsa «Leer ahora» arriba."
      />
      <FichaCampana
        key={abierta ?? "cerrada"}
        campana={campana}
        anuncios={anuncios.filter((a) => a.campanaId === campana?.id)}
        actId={cuentas.find((x) => x.id === campana?.cuentaId)?.actId ?? null}
        productos={productos}
        escribe={escribe}
        alCerrar={() => setAbierta(null)}
        anterior={i > 0 ? () => setAbierta(orden[i - 1]) : undefined}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierta(orden[i + 1]) : undefined}
      />
    </>
  );
}
