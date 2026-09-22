"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, CatalogoIcon, EstadoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearSkuPanel } from "./crear-sku-panel";
import { DEF_CATALOGO, ETIQUETA_ESTADO, ETIQUETA_TIPO, TONO_ESTADO, type FilaSku } from "./def-catalogo";
import { FichaSku } from "./ficha-sku";

const NOMBRE: NombreFilas = { singular: "SKU", plural: "SKUs" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  tipo: CatalogoIcon,
  codigo: ProductoIcon,
  nombre: ProductoIcon,
  componentes: ProductoIcon,
  creado: CalendarioIcon,
};

const COLUMNAS: ColumnaTabla<FilaSku>[] = [
  { id: "codigo", label: "Código", ocultable: false, clase: "font-medium", render: (s) => s.codigo },
  { id: "nombre", label: "Nombre", ocultable: true, render: (s) => s.nombre },
  { id: "tipo", label: "Tipo", ocultable: true, clase: "text-muted-foreground", render: (s) => ETIQUETA_TIPO[s.tipo] ?? s.tipo },
  { id: "componentes", label: "Componentes", ocultable: true, clase: "text-muted-foreground", render: (s) => s.componentes || "—" },
  {
    id: "estado",
    label: "Estado",
    ocultable: true,
    render: (s) => <Badge tone={TONO_ESTADO[s.estado]}>{ETIQUETA_ESTADO[s.estado]}</Badge>,
  },
];

/**
 * Catálogo de SKU maestros con la barra de herramientas común (agrupar por estado o tipo, aprobados, filtros y
 * «Agregar»). **La tabla no tiene columna de acciones**: toda la fila abre la ficha del SKU, donde se cambia el
 * estado y se ve su actividad — mismo patrón que Cuentas destino.
 */
export function TablaCatalogo({
  skus,
  opcionesSimples,
  codigoPais,
  puedeEscribir,
}: {
  skus: FilaSku[];
  opcionesSimples: { id: string; codigo: string; nombre: string }[];
  codigoPais: string;
  puedeEscribir: boolean;
}) {
  // Qué SKU está abierto y en qué orden se veían las filas al abrirlo (para las flechas de anterior y siguiente).
  const [abierto, setAbierto] = useState<{ id: string; orden: string[] } | null>(null);
  const sku = abierto ? skus.find((s) => s.id === abierto.id) : undefined;

  return (
    <>
      <TablaDatos
        def={DEF_CATALOGO}
        filas={skus}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(s) => s.id}
        anchoMinimo="48rem"
        accionPrincipal={puedeEscribir ? <CrearSkuPanel opcionesSimples={opcionesSimples} /> : undefined}
        abrirFila={{
          etiqueta: (s) => `Abrir la ficha del SKU ${s.codigo}`,
          alAbrir: (s, orden) => setAbierto({ id: s.id, orden }),
        }}
        ariaLabel="Catálogo de SKU maestros"
        vacio="Todavía no hay SKUs maestros propuestos."
      />
      <FichaSku
        sku={sku}
        orden={abierto?.orden ?? []}
        codigoPais={codigoPais}
        puedeEscribir={puedeEscribir}
        alIr={(id) => setAbierto((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierto(null)}
      />
    </>
  );
}
