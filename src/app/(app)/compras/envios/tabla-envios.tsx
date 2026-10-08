"use client";

import { useState } from "react";
import { Punto } from "@/components/panel/piezas-panel";
import { Bandera } from "@/components/paises/bandera";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { etiquetaVia, textoPrometido, type ResumenReal } from "@/lib/compras/rutas-envio";
import { ComprasIcon, EstadoIcon, PersonaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
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
  { id: "prometido", label: "Prometido", ocultable: true, clase: "whitespace-nowrap tabular-nums", render: (r) => textoPrometido(r.diasMin, r.diasMax) },
  { id: "historico", label: "Real histórico", ocultable: true, render: (r) => <Real r={r.real.historico} /> },
  { id: "ultimos12", label: "Últimos 12 meses", ocultable: true, render: (r) => <Real r={r.real.ultimos12} alerta={r.incumple} /> },
  { id: "anio", label: "Año actual", ocultable: true, render: (r) => <Real r={r.real.anioActual} /> },
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
 * está activo. Toda la fila abre la ficha de la ruta.
 */
export function TablaEnvios({ rutas, agentes, tipos, puedeEscribir }: { rutas: FilaRuta[]; agentes: string[]; tipos: string[]; puedeEscribir: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <>
      <TablaDatos
        def={DEF_ENVIOS}
        filas={rutas}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(r) => r.id}
        anchoMinimo="64rem"
        accionPrincipal={puedeEscribir ? <CrearRutaPanel agentes={agentes} /> : undefined}
        abrirFila={{ etiqueta: (r) => `Abrir la ruta ${r.agente ?? "sin agente"} · ${r.paisNombre} · ${etiquetaVia(r.via)}`, alAbrir: (r) => setAbierta(r.id) }}
        ariaLabel="Rutas de envío"
        vacio="Todavía no hay rutas de envío."
      />
      <FichaRuta ruta={rutas.find((r) => r.id === abierta)} agentes={agentes} tipos={tipos} puedeEscribir={puedeEscribir} alCerrar={() => setAbierta(null)} />
    </>
  );
}
