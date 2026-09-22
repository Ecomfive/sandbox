"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, CatalogoIcon, EstadoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { cambiarEstadoSku } from "./actions";
import { CrearSkuPanel } from "./crear-sku-panel";
import { DEF_CATALOGO, ETIQUETA_ESTADO, ETIQUETA_TIPO, TONO_ESTADO, type FilaSku } from "./def-catalogo";

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

/** Pasos que se pueden dar desde cada estado (todo pasa por revisión antes de aprobarse). */
function siguientes(estado: string): { etiqueta: string; valor: string }[] {
  if (estado === "propuesto") return [{ etiqueta: "Enviar a revisión", valor: "en_revision" }];
  if (estado === "en_revision") {
    return [
      { etiqueta: "Aprobar", valor: "aprobado" },
      { etiqueta: "Regresar a propuesto", valor: "propuesto" },
    ];
  }
  return [{ etiqueta: "Regresar a revisión", valor: "en_revision" }];
}

/** Catálogo de SKU maestros con la barra de herramientas común (agrupar por estado o tipo, aprobados, filtros y «Agregar»). */
export function TablaCatalogo({
  skus,
  opcionesSimples,
  puedeEscribir,
}: {
  skus: FilaSku[];
  opcionesSimples: { id: string; codigo: string; nombre: string }[];
  puedeEscribir: boolean;
}) {
  return (
    <TablaDatos
      def={DEF_CATALOGO}
      filas={skus}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(s) => s.id}
      anchoMinimo="48rem"
      accionPrincipal={puedeEscribir ? <CrearSkuPanel opcionesSimples={opcionesSimples} /> : undefined}
      accion={
        puedeEscribir
          ? {
              etiqueta: "Acción",
              render: (s) => (
                <div className="flex flex-wrap gap-2">
                  {siguientes(s.estado).map((paso) => (
                    <form key={paso.valor} action={cambiarEstadoSku}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="nuevo_estado" value={paso.valor} />
                      <Button type="submit" variant="secondary" className="text-xs">
                        {paso.etiqueta}
                      </Button>
                    </form>
                  ))}
                </div>
              ),
            }
          : undefined
      }
      ariaLabel="Catálogo de SKU maestros"
      vacio="Todavía no hay SKUs maestros propuestos."
    />
  );
}
