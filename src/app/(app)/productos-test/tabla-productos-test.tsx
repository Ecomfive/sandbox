"use client";

import { useState } from "react";
import { IconoMetricasMeta } from "@/components/metricas-meta/popover";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CheckIcon, EstadoIcon, EtiquetaIcon, FiltroIcon, TestIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { Grupo } from "@/lib/tabla/vista";
import { CrearProductoTestPanel } from "./crear-producto-test-panel";
import {
  colorEstado,
  colorExplotacion,
  colorTestNumero,
  DEF_PRODUCTOS_TEST,
  etiquetaEstado,
  etiquetaExplotacion,
  etiquetaTestNumero,
  type FilaProductoTest,
} from "./def-productos-test";
import { FichaProductoTest } from "./ficha-producto-test";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  testNumero: TestIcon,
  explotacion: FiltroIcon,
  categoria: EtiquetaIcon,
  anguloVenta: EtiquetaIcon,
  observacion: EstadoIcon,
};

const COLUMNAS: ColumnaTabla<FilaProductoTest, string>[] = [
  {
    id: "nombre",
    label: "Nombre",
    ocultable: false,
    clase: "font-medium",
    render: (f) => (
      <div className="flex min-w-0 items-center gap-2">
        <IconoMetricasMeta metricas={{ ...f, landingUrl: f.paginaProductoUrl }} />
        <span className="block max-w-[20rem] truncate" title={f.nombre}>
          {f.nombre}
        </span>
      </div>
    ),
  },
  { id: "categoria", label: "Categoría", ocultable: true, clase: "text-muted-foreground", render: (f) => f.categoria || "—" },
  { id: "worldwide", label: "Worldwide", ocultable: true, clase: "text-muted-foreground", render: (f) => f.worldwide || "—" },
  { id: "estado", label: "Estado", ocultable: true, render: (f) => <Badge color={colorEstado(f.estado)}>{etiquetaEstado(f.estado)}</Badge> },
  {
    id: "testNumero",
    label: "Test #",
    ocultable: true,
    render: (f) => (f.testNumero ? <Badge color={colorTestNumero(f.testNumero)}>{etiquetaTestNumero(f.testNumero)}</Badge> : "—"),
  },
  { id: "fechaTest", label: "Fecha Test", ocultable: true, clase: "text-muted-foreground tabular-nums", render: (f) => f.fechaTest ?? "—" },
  {
    id: "explotacion",
    label: "Explotación",
    ocultable: true,
    render: (f) => (f.explotacion ? <Badge color={colorExplotacion(f.explotacion)}>{etiquetaExplotacion(f.explotacion)}</Badge> : "—"),
  },
  {
    id: "revisado",
    label: "Revisado",
    ocultable: true,
    render: (f) => (f.revisado ? <CheckIcon className="h-4 w-4 text-success" /> : <span className="text-muted-foreground">—</span>),
  },
];

/** Junto al nombre de cada grupo de Categoría, cuántos de sus productos son Winner y cuántos Fallido — lo
 * primero que se quiere saber para decidir qué categorías siguen dando resultado. */
function etiquetaGrupo(campo: string, grupo: Grupo<FilaProductoTest>) {
  if (campo !== "categoria") return <span className="font-semibold">{grupo.etiqueta}</span>;
  const winners = grupo.filas.filter((f) => f.estado === "winner").length;
  const fallidos = grupo.filas.filter((f) => f.estado === "fallido").length;
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <span className="font-semibold">{grupo.etiqueta}</span>
      {winners > 0 && <span className="text-xs font-medium text-success tabular-nums">{winners} Winner</span>}
      {fallidos > 0 && <span className="text-xs font-medium text-destructive tabular-nums">{fallidos} Fallido{fallidos === 1 ? "" : "s"}</span>}
    </span>
  );
}

/** Tabla de Productos Test (Sistema WMS): el paso previo a Filtros, calcado de la hoja de cálculo "Control
 * de Testing en Países", con la barra de herramientas común. Por ahora solo se usa para Panamá. */
export function TablaProductosTest({
  productos,
  paisId,
  puedeEscribir,
}: {
  productos: FilaProductoTest[];
  paisId: string;
  puedeEscribir: boolean;
}) {
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  const producto = abierta ? productos.find((p) => p.id === abierta.id) : undefined;

  return (
    <>
      <TablaDatos
        def={DEF_PRODUCTOS_TEST}
        filas={productos}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        etiquetaGrupo={etiquetaGrupo}
        anchoMinimo="52rem"
        abrirFila={{
          etiqueta: (f) => `Abrir la ficha del producto ${f.nombre}`,
          alAbrir: (f, orden) => setAbierta({ id: f.id, orden }),
        }}
        accionPrincipal={puedeEscribir ? <CrearProductoTestPanel paisId={paisId} /> : undefined}
        ariaLabel="Tabla de productos test"
        vacio="Todavía no hay productos en test."
      />
      <FichaProductoTest
        producto={producto}
        orden={abierta?.orden ?? []}
        paisId={paisId}
        puedeEscribir={puedeEscribir}
        alIr={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}
