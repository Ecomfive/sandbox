"use client";

import { useState } from "react";
import { Punto } from "@/components/panel/piezas-panel";
import { Bandera } from "@/components/paises/bandera";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { etiquetaVia, prometidoJunto, textoPrometido, type ResumenReal, type ResumenesReales } from "@/lib/compras/rutas-envio";
import { ComprasIcon, EstadoIcon, PersonaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { BarraTiempos, hoyPanama, porVia, realJunto, ResumenGlobal } from "./barra-tiempos";
import { CrearRutaPanel } from "./crear-ruta-panel";
import { DEF_ENVIOS, tarifasVigentes, textoTarifa, type FilaRuta } from "./def-envios";
import { FichaRuta } from "./ficha-ruta";

const NOMBRE: NombreFilas = { singular: "ruta", plural: "rutas" };
const ICONOS: Record<string, IconoComp> = { pais: ComprasIcon, agente: PersonaIcon, via: ComprasIcon, estado: EstadoIcon, cumple: EstadoIcon };

/** «58 d» con cuántos envíos debajo; «—» sin envíos. */
function Real({ r, alerta = false }: { r: ResumenReal; alerta?: boolean }) {
  if (r.promedio === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col leading-tight">
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        {alerta && <Punto tono="peligro" />}
        {r.promedio} d
      </span>
      <span className="text-xs text-muted-foreground">
        {r.n} envío{r.n === 1 ? "" : "s"}
      </span>
    </span>
  );
}

/** Abreviatura de la vía para los subtotales («Mar», «Aire», «Tierra»). */
const CORTA: Record<string, string> = { mar: "Mar", aire: "Aire", tierra: "Tierra" };

/**
 * El subtotal de una columna (el de un país al agrupar, o el de todo lo que se ve abajo): una línea por vía, juntando a todos
 * los agentes de esas rutas.
 */
function subtotalPorVia(filas: FilaRuta[], dibujar: (vias: FilaRuta[], real: ResumenesReales) => React.ReactNode) {
  const hoy = hoyPanama();
  return (
    <span className="flex flex-col gap-0.5 text-xs font-normal">
      {porVia(filas).map(({ via, filas: deVia }) => (
        <span key={via} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-9 text-muted-foreground">{CORTA[via]}</span>
          {dibujar(deVia, realJunto(deVia, hoy))}
        </span>
      ))}
    </span>
  );
}
const numeroReal = (r: ResumenReal) => (r.promedio === null ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{r.promedio} d <span className="text-muted-foreground">({r.n})</span></span>);

const COLUMNAS: ColumnaTabla<FilaRuta>[] = [
  {
    id: "pais",
    label: "País",
    ocultable: false,
    clase: "font-medium whitespace-nowrap",
    render: (r) => (
      <span className="inline-flex items-center gap-2">
        <Bandera codigo={r.paisCodigo} />
        {r.paisNombre}
      </span>
    ),
    total: (filas) => (new Set(filas.map((f) => f.paisCodigo)).size === 1 ? `Total ${filas[0].paisNombre}` : "Todos los países"),
  },
  { id: "agente", label: "Agente", ocultable: true, render: (r) => r.agente ?? <span className="text-muted-foreground">Sin agente</span> },
  {
    id: "via",
    label: "Vía",
    ocultable: true,
    clase: "whitespace-nowrap",
    render: (r) => (
      <span className="flex flex-col leading-tight">
        {etiquetaVia(r.via)}
        <span className="text-xs text-muted-foreground">{[r.modalidad, r.courier].filter(Boolean).join(" · ") || "—"}</span>
      </span>
    ),
  },
  {
    id: "prometido",
    label: "Prometido",
    ocultable: true,
    clase: "whitespace-nowrap tabular-nums",
    render: (r) => textoPrometido(r.diasMin, r.diasMax),
    total: (filas) => subtotalPorVia(filas, (deVia) => {
      const p = prometidoJunto(deVia);
      return <span className="tabular-nums">{p ? textoPrometido(p.min, p.max) : "—"}</span>;
    }),
  },
  {
    id: "comparacion",
    label: "Prometido vs. real",
    ocultable: true,
    render: (r) => <BarraTiempos compacta prometido={r.diasMin !== null && r.diasMax !== null ? { min: r.diasMin, max: r.diasMax } : null} real={r.real} />,
    total: (filas) => subtotalPorVia(filas, (deVia, real) => <BarraTiempos compacta prometido={prometidoJunto(deVia)} real={real} />),
  },
  { id: "historico", label: "Real histórico", ocultable: true, render: (r) => <Real r={r.real.historico} />, total: (filas) => subtotalPorVia(filas, (_, real) => numeroReal(real.historico)) },
  { id: "ultimos12", label: "Últimos 12 meses", ocultable: true, render: (r) => <Real r={r.real.ultimos12} alerta={r.incumple} />, total: (filas) => subtotalPorVia(filas, (_, real) => numeroReal(real.ultimos12)) },
  { id: "ultimos2", label: "Últimos 2 meses", ocultable: true, render: (r) => <Real r={r.real.ultimos2} />, total: (filas) => subtotalPorVia(filas, (_, real) => numeroReal(real.ultimos2)) },
  { id: "anio", label: "Año actual", ocultable: true, render: (r) => <Real r={r.real.anioActual} />, total: (filas) => subtotalPorVia(filas, (_, real) => numeroReal(real.anioActual)) },
  {
    id: "tarifa",
    label: "Tarifa",
    ocultable: true,
    render: (r) => {
      const vigentes = tarifasVigentes(r.tarifas);
      if (vigentes.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="flex flex-col leading-tight">
          {vigentes.map((t) => (
            <span key={t.id} className="whitespace-nowrap">
              <span className="text-muted-foreground">{t.tipo}:</span> <span className="tabular-nums">{textoTarifa(t)}</span>
            </span>
          ))}
        </span>
      );
    },
  },
  { id: "estado", label: "Estado", ocultable: true, render: (r) => <Badge tone={r.activo ? "success" : "neutral"}>{r.activo ? "Activa" : "Inactiva"}</Badge> },
];

/**
 * Las rutas de envío agrupadas por país: qué agente lleva a cada país por qué vía, lo que promete, lo que de verdad tardó
 * (toda la vida, los últimos 12 meses y el año en curso; punto rojo si tarda más de lo prometido), su tarifa y si el canal
 * está activo. Toda la fila abre la ficha de la ruta. Arriba, todos los países juntos con una barra por vía; en la fila de cada
 * país, lo que tarda por vía juntando a sus agentes, y al final del grupo su subtotal con las mismas columnas.
 */
export function TablaEnvios({ rutas, agentes, tipos, puedeEscribir, sinResumen = false }: { rutas: FilaRuta[]; agentes: string[]; tipos: string[]; puedeEscribir: boolean; /** Sin el resumen de arriba (ya lo da el panel). */ sinResumen?: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const hoy = hoyPanama();
  return (
    <>
      {!sinResumen && <ResumenGlobal rutas={rutas} />}
      <TablaDatos
        def={DEF_ENVIOS}
        filas={rutas}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(r) => r.id}
        anchoMinimo="84rem"
        accionPrincipal={puedeEscribir ? <CrearRutaPanel agentes={agentes} /> : undefined}
        abrirFila={{ etiqueta: (r) => `Abrir la ruta ${r.agente ?? "sin agente"} · ${r.paisNombre} · ${etiquetaVia(r.via)}`, alAbrir: (r) => setAbierta(r.id) }}
        ariaLabel="Rutas de envío"
        // Agrupada por país, el título del grupo dice en pequeño cuánto tarda cada vía (todos sus agentes juntos).
        etiquetaGrupo={(campo, grupo) =>
          campo === "pais" ? (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="inline-flex items-center gap-2 font-semibold">
                <Bandera codigo={grupo.filas[0]?.paisCodigo ?? ""} />
                {grupo.etiqueta}
              </span>
              {porVia(grupo.filas).map(({ via, filas }) => {
                const real = realJunto(filas, hoy).historico;
                return (
                  <span key={via} className="text-xs font-normal text-muted-foreground">
                    {etiquetaVia(via)} <span className="font-medium text-foreground tabular-nums">{real.promedio === null ? "—" : `${real.promedio} d`}</span>
                  </span>
                );
              })}
            </span>
          ) : (
            <span className="font-semibold">{grupo.etiqueta}</span>
          )
        }
        vacio="Todavía no hay rutas de envío."
      />
      <FichaRuta ruta={rutas.find((r) => r.id === abierta)} agentes={agentes} tipos={tipos} puedeEscribir={puedeEscribir} alCerrar={() => setAbierta(null)} />
    </>
  );
}
