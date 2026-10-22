"use client";

import type { ReactNode } from "react";
import { Bandera } from "@/components/paises/bandera";
import { Pastilla } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { detalleEstado, type EstadoRuta } from "@/lib/compras/estado-ruta";
import { etiquetaVia, VIAS_RUTA } from "@/lib/compras/rutas-envio";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { BarraUso } from "./barra-uso";
import { medidaRuta, plazoCorto, tarifasVigentes, textoTarifa, type FilaRuta } from "./def-envios";
import { IconoVia, RelojIcon, SinPlazoIcon, TrianguloIcon, VistoIcon } from "./iconos-envios";

export type Agrupar = "pais" | "agente" | "via";

// Las mismas columnas en el encabezado y en cada fila: lo que se compara (plazo, real, barra) queda alineado de una ruta a otra.
// En pantallas angostas el encabezado se oculta y cada dato lleva su nombre encima.
const COLUMNAS =
  "min-[860px]:grid-cols-[minmax(150px,1.5fr)_minmax(84px,0.7fr)_minmax(112px,0.95fr)_minmax(130px,1.05fr)_minmax(140px,1.6fr)_minmax(54px,0.5fr)_minmax(104px,0.9fr)_18px]";
const FILA = `grid grid-cols-2 gap-x-4 gap-y-2.5 min-[860px]:items-center ${COLUMNAS}`;

const ORDEN_ESTADO: Record<EstadoRuta, number> = { tarde: 0, sin_plazo: 1, ok: 2, sin_medir: 3 };

interface Grupo {
  clave: string;
  nombre: string;
  /** El país, para dibujar su bandera (solo al agrupar por país). */
  paisCodigo?: string;
  sigla: string;
  rutas: FilaRuta[];
  tarde: number;
}

/** Las rutas en grupos: los que tienen rutas fuera de plazo primero, luego los de más envíos medidos y por nombre. */
function agruparRutas(rutas: FilaRuta[], modo: Agrupar): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const r of rutas) {
    const k =
      modo === "agente"
        ? { clave: r.agente ?? "", nombre: r.agente ?? "Sin agente", sigla: (r.agente ?? "—").slice(0, 2).toUpperCase() }
        : modo === "via"
          ? { clave: r.via, nombre: etiquetaVia(r.via), sigla: etiquetaVia(r.via).slice(0, 2).toUpperCase() }
          : { clave: r.paisCodigo, nombre: r.paisNombre, sigla: r.paisCodigo, paisCodigo: r.paisCodigo };
    const g = mapa.get(k.clave) ?? { ...k, rutas: [], tarde: 0 };
    g.rutas.push(r);
    mapa.set(k.clave, g);
  }
  const medidos = (g: Grupo) => g.rutas.reduce((s, r) => s + r.real.historico.n, 0);
  const grupos = [...mapa.values()].map((g) => ({
    ...g,
    tarde: g.rutas.filter((r) => medidaRuta(r).estado === "tarde").length,
    rutas: [...g.rutas].sort(
      (a, b) =>
        ORDEN_ESTADO[medidaRuta(a).estado] - ORDEN_ESTADO[medidaRuta(b).estado] ||
        VIAS_RUTA.findIndex((v) => v.valor === a.via) - VIAS_RUTA.findIndex((v) => v.valor === b.via) ||
        (a.agente ?? "").localeCompare(b.agente ?? "", "es") ||
        (a.courier ?? "").localeCompare(b.courier ?? "", "es"),
    ),
  }));
  return grupos.sort((a, b) => b.tarde - a.tarde || medidos(b) - medidos(a) || a.nombre.localeCompare(b.nombre, "es"));
}

const modalidadDe = (r: FilaRuta) => [r.modalidad, r.courier].filter(Boolean).join(" ");

/** La segunda línea de la ruta: lo que no es el grupo (al agrupar por país, el agente; por agente, el país; por vía, los dos). */
function segundaLinea(r: FilaRuta, modo: Agrupar): string {
  const partes = modo === "pais" ? [r.agente ?? "Sin agente"] : modo === "agente" ? [r.paisNombre] : [r.paisNombre, r.agente ?? "Sin agente"];
  return [...partes, modalidadDe(r), r.activo ? "" : "Inactiva"].filter(Boolean).join(" · ");
}

/** Cómo se dice el estado de una ruta: ícono + palabra (nunca solo el color). */
function EstadoPastilla({ estado }: { estado: EstadoRuta }) {
  switch (estado) {
    case "tarde":
      return (
        <Pastilla tono="peligro">
          <TrianguloIcon />
          Fuera de plazo
        </Pastilla>
      );
    case "ok":
      return (
        <Pastilla tono="exito">
          <VistoIcon />
          En plazo
        </Pastilla>
      );
    case "sin_medir":
      return (
        <Pastilla>
          <RelojIcon />
          Sin medir
        </Pastilla>
      );
    case "sin_plazo":
      return (
        <Pastilla tono="aviso">
          <SinPlazoIcon />
          Sin plazo
        </Pastilla>
      );
  }
}

/** El nombre de un dato: visible encima en pantallas angostas, solo para lectores de pantalla en las anchas (ahí lo dice el encabezado). */
function Nombre({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase min-[860px]:sr-only">{children}</span>;
}

function FilaRutaLista({ ruta, modo, abierta, alAbrir }: { ruta: FilaRuta; modo: Agrupar; abierta: boolean; alAbrir: () => void }) {
  const { real, estado, delta } = medidaRuta(ruta);
  const plazo = plazoCorto(ruta);
  const tarifa = tarifasVigentes(ruta.tarifas)[0];
  const n = ruta.real.historico.n;
  const etiqueta = [
    `${ruta.agente ?? "Sin agente"}, ${etiquetaVia(ruta.via)}, ${ruta.paisNombre}.`,
    plazo ? `Plazo ${plazo}.` : "Sin plazo definido.",
    real !== null ? `Real ${real} días.` : "Sin envíos medidos.",
    estado === "tarde" ? `Fuera de plazo por ${delta} días.` : estado === "ok" ? "En plazo." : "",
    ruta.activo ? "" : "Ruta inactiva.",
    "Abrir la ficha.",
  ]
    .filter(Boolean)
    .join(" ");
  const barra =
    ruta.diasMax !== null
      ? `Plazo ${plazo}. ${real !== null ? `Real ${real} días${estado === "tarde" ? `, ${delta} por encima del máximo` : ", dentro del plazo"}.` : "Sin envíos medidos."}`
      : "";
  return (
    <button
      type="button"
      onClick={alAbrir}
      aria-label={etiqueta}
      className={`${FILA} min-h-14 w-full cursor-pointer px-4 py-2.5 text-left hover:bg-muted ${anilloFoco} focus-visible:-outline-offset-2 ${abierta ? "bg-primario-suave shadow-[inset_3px_0_0_var(--primario)]" : ""} ${ruta.activo ? "" : "opacity-60"}`}
    >
      <span className="col-span-2 flex min-w-0 flex-col gap-px min-[860px]:col-span-1">
        <span className="inline-flex items-center gap-2 font-semibold">
          <IconoVia via={ruta.via} className="shrink-0 text-muted-foreground" />
          {etiquetaVia(ruta.via)}
        </span>
        <span className="text-xs text-muted-foreground">{segundaLinea(ruta, modo)}</span>
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <Nombre>Plazo prometido</Nombre>
        {plazo ? <span className="font-semibold">{plazo}</span> : <span className="text-muted-foreground">Sin definir</span>}
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <Nombre>Real, últimos 12 meses</Nombre>
        {real !== null ? (
          <>
            <span className="text-[15px] font-semibold">{real} d</span>
            {ruta.real.ultimos2.promedio !== null && <span className="text-xs text-muted-foreground">Últ. 2 meses: {ruta.real.ultimos2.promedio} d</span>}
          </>
        ) : (
          <span className="text-muted-foreground">Sin envíos</span>
        )}
      </span>
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <Nombre>Estado</Nombre>
        <EstadoPastilla estado={estado} />
        <span className="text-xs text-muted-foreground">{detalleEstado(estado, delta)}</span>
      </span>
      <span className="col-span-2 flex min-w-0 flex-col gap-1 min-[860px]:col-span-1">
        <Nombre>Uso del plazo</Nombre>
        {ruta.diasMax !== null ? <BarraUso min={ruta.diasMin ?? ruta.diasMax} max={ruta.diasMax} real={real} etiqueta={barra} /> : <span className="text-muted-foreground">—</span>}
      </span>
      <span className="flex min-w-0 flex-col gap-px min-[860px]:items-end">
        <Nombre>Envíos medidos</Nombre>
        <span className="font-semibold">{n || "—"}</span>
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <Nombre>Tarifa</Nombre>
        <span>{tarifa ? textoTarifa(tarifa) : "—"}</span>
      </span>
      <ChevronRightIcon aria-hidden="true" className="hidden h-4 w-4 justify-self-end text-muted-foreground min-[860px]:block" />
    </button>
  );
}

function Leyenda() {
  return (
    <div role="group" aria-label="Cómo leer la barra" className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2 w-5 rounded-[2px] bg-foreground/80" />
        Lo que tardó (12 meses)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2 w-5 rounded-[2px]" style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--destructive) 0 3px, var(--destructive-soft) 3px 6px)" }} />
        Lo que se pasó del plazo
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-5 rounded-[2px] border border-success/55 bg-success-soft" />
        Plazo prometido
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3.5 w-0.5 bg-foreground" />
        Plazo máximo
      </span>
    </div>
  );
}

/**
 * La lista de rutas de Compras › Envíos: grupos (por país, agente o vía) con una fila por ruta y siempre las mismas columnas.
 * Pulsar una fila abre su ficha.
 */
export function ListaRutas({ rutas, modo, abierta, alAbrir, totalRutas }: { rutas: FilaRuta[]; modo: Agrupar; abierta: string | null; alAbrir: (id: string) => void; totalRutas: number }) {
  const grupos = agruparRutas(rutas, modo);
  return (
    <section aria-label="Rutas de envío" className="min-w-0 rounded-[10px] border border-border bg-card">
      <Leyenda />
      <div aria-hidden="true" className={`hidden border-b border-border bg-muted px-4 py-2 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase gap-x-4 min-[860px]:grid min-[860px]:items-center ${COLUMNAS}`}>
        <span>Ruta</span>
        <span>Plazo</span>
        <span>Real · 12 m</span>
        <span>Estado</span>
        <span>Uso del plazo</span>
        <span className="text-right">Envíos</span>
        <span>Tarifa</span>
        <span />
      </div>
      {grupos.map((g) => {
        const id = `grupo-envios-${g.clave || "sin"}`;
        return (
          <section key={g.clave} aria-labelledby={id} className="border-b border-border last:border-b-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border bg-card px-4 py-2.5">
              {g.paisCodigo ? (
                <Bandera codigo={g.paisCodigo} className="!h-4 !w-6" />
              ) : (
                <span aria-hidden="true" className="grid h-5 min-w-[26px] place-items-center rounded border border-border bg-muted px-1 text-[11px] font-semibold text-muted-foreground">
                  {g.sigla}
                </span>
              )}
              <h3 id={id} className="text-sm font-semibold">
                {g.nombre}
              </h3>
              <span className="rounded-full bg-muted px-2 py-px text-xs text-muted-foreground">
                {g.rutas.length} {g.rutas.length === 1 ? "ruta" : "rutas"}
              </span>
              {g.tarde > 0 && <Pastilla tono="peligro">{g.tarde} fuera de plazo</Pastilla>}
            </div>
            <ul className="m-0 list-none p-0">
              {g.rutas.map((r) => (
                <li key={r.id} className="border-t border-border first:border-t-0">
                  <FilaRutaLista ruta={r} modo={modo} abierta={abierta === r.id} alAbrir={() => alAbrir(r.id)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {grupos.length === 0 && <p className="m-0 px-4 py-4 text-sm text-muted-foreground">No hay rutas con estos filtros.</p>}
      <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        Mostrando {rutas.length} de {totalRutas} {totalRutas === 1 ? "ruta" : "rutas"}
      </div>
    </section>
  );
}
