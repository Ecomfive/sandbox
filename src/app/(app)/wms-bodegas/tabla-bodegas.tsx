"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, EstadoIcon, InventarioIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearBodegaPanel } from "./crear-bodega-panel";
import { DEF_BODEGAS, ETIQUETA_TIPO_BODEGA, type FilaBodega, type TipoBodega } from "./def-bodegas";
import { FichaBodega } from "./ficha-bodega";

const NOMBRE: NombreFilas = { singular: "bodega", plural: "bodegas" };
const ICONOS: Record<string, IconoComp> = { estado: EstadoIcon, tipo: InventarioIcon, nombre: InventarioIcon, direccion: InventarioIcon, creado: CalendarioIcon };

const COLUMNAS: ColumnaTabla<FilaBodega>[] = [
  { id: "nombre", label: "Bodega", ocultable: false, clase: "font-medium", render: (b) => b.nombre },
  { id: "tipo", label: "Tipo", ocultable: true, render: (b) => <Badge tone={b.tipo === "propia" ? "info" : "neutral"}>{ETIQUETA_TIPO_BODEGA[b.tipo as TipoBodega] ?? b.tipo}</Badge> },
  { id: "direccion", label: "Dirección", ocultable: true, clase: "text-muted-foreground", render: (b) => b.direccion || "—" },
  { id: "contacto", label: "Contacto", ocultable: true, clase: "text-muted-foreground", render: (b) => b.contacto || "—" },
  { id: "estado", label: "Estado", ocultable: true, render: (b) => <Badge tone={b.activa ? "success" : "warning"}>{b.activa ? "Activa" : "Inactiva"}</Badge> },
];

/** Lista de bodegas del país con la barra de herramientas común y «Agregar». Toda la fila abre la ficha de la bodega. */
export function TablaBodegas({ bodegas, paisId, codigoPais, puedeEscribir }: { bodegas: FilaBodega[]; paisId: string; codigoPais: string; puedeEscribir: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <>
      <TablaDatos
        def={DEF_BODEGAS}
        filas={bodegas}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(b) => b.id}
        anchoMinimo="44rem"
        accionPrincipal={puedeEscribir ? <CrearBodegaPanel paisId={paisId} /> : undefined}
        abrirFila={{ etiqueta: (b) => `Abrir la ficha de la bodega ${b.nombre}`, alAbrir: (b) => setAbierta(b.id) }}
        ariaLabel="Bodegas"
        vacio="Todavía no hay bodegas."
      />
      <FichaBodega bodega={bodegas.find((b) => b.id === abierta)} codigoPais={codigoPais} puedeEscribir={puedeEscribir} alCerrar={() => setAbierta(null)} />
    </>
  );
}
