"use client";

import { useState } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { ETIQUETA_METODO, type MetodoPago } from "@/lib/deliverys/liquidacion";
import { EnvioIcon, EstadoIcon, PersonaIcon, WalletIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearRepartidorPanel } from "./crear-repartidor-panel";
import { FichaRepartidor } from "./ficha-repartidor";

export interface FilaRepartidor {
  id: string;
  nombre: string;
  /** Enmascarados. */
  documento: string;
  telefono: string;
  alias: string[];
  medioPago: MetodoPago | null;
  activo: boolean;
}

const NOMBRE: NombreFilas = { singular: "repartidor", plural: "repartidores" };

const DEF: DefTabla<FilaRepartidor> = {
  clave: "deliverys-repartidores",
  campos: [
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [f.activo ? "Activo" : "Inactivo"], agrupable: true },
    { id: "medio", etiqueta: "Forma de pago", tipo: "seleccion", valores: (f) => [f.medioPago ? ETIQUETA_METODO[f.medioPago] : "Sin dato"], agrupable: true },
    { id: "nombre", etiqueta: "Repartidor", tipo: "texto", valor: (f) => f.nombre },
    { id: "zonas", etiqueta: "Zonas", tipo: "texto", valor: (f) => f.alias.join(", ") },
  ],
  cerrados: { etiqueta: "Inactivos", esCerrado: (f) => !f.activo, campoEstado: "estado", valoresCerrados: ["Inactivo"], ocultosPorDefecto: true, exclusivo: true },
};

const ICONOS: Record<string, IconoComp> = { estado: EstadoIcon, medio: WalletIcon, nombre: PersonaIcon, zonas: EnvioIcon };

const COLUMNAS: ColumnaTabla<FilaRepartidor, null>[] = [
  {
    id: "nombre",
    label: "Repartidor",
    ocultable: false,
    render: (f) => (
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {!f.documento && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
          {f.nombre}
          {!f.documento && <span className="sr-only"> (sin documento para el recibo)</span>}
        </span>
        {f.documento && <span className="text-xs text-muted-foreground tabular-nums">{f.documento}</span>}
      </span>
    ),
  },
  { id: "telefono", label: "Teléfono", ocultable: true, clase: "whitespace-nowrap tabular-nums text-muted-foreground", render: (f) => f.telefono || "—" },
  { id: "zonas", label: "Zonas en la hoja", ocultable: true, clase: "max-w-80 truncate text-muted-foreground", render: (f) => f.alias.join(", ") || "—" },
  { id: "medio", label: "Forma de pago", ocultable: true, clase: "whitespace-nowrap", render: (f) => (f.medioPago ? ETIQUETA_METODO[f.medioPago] : "—") },
  { id: "estado", label: "Estado", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => (f.activo ? "Activo" : "Inactivo") },
];

export function TablaRepartidores({ filas, puedeEscribir }: { filas: FilaRepartidor[]; puedeEscribir: boolean }) {
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  const i = abierta ? abierta.orden.indexOf(abierta.id) : -1;
  const ir = (k: number) => (abierta?.orden[k] ? () => setAbierta((a) => (a ? { ...a, id: a.orden[k] } : a)) : undefined);
  return (
    <>
      <TablaDatos
        def={DEF}
        filas={filas}
        columnas={COLUMNAS}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        abrirFila={{ etiqueta: (f) => `Abrir la ficha de ${f.nombre}`, alAbrir: (f, orden) => setAbierta({ id: f.id, orden }) }}
        accionPrincipal={puedeEscribir ? <CrearRepartidorPanel /> : undefined}
        ariaLabel="Repartidores"
        vacio="Todavía no hay repartidores: se crean al importar la hoja o con «Agregar»."
      />
      {abierta && (
        <FichaRepartidor key={abierta.id} id={abierta.id} puedeEscribir={puedeEscribir} anterior={ir(i - 1)} siguiente={ir(i + 1)} alCerrar={() => setAbierta(null)} />
      )}
    </>
  );
}
