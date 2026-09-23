"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, CatalogoIcon, EstadoIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { ETIQUETA_TIPO_DROPI, type Bodega, type TipoDropi } from "@/lib/wms/producto-dropi";
import { DEF_WMS_DROPI, type FilaProductoDropi } from "./def-wms-dropi";
import { FichaProductoDropi } from "./ficha-producto-dropi";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  privado: EstadoIcon,
  aprobado: EstadoIcon,
  tipo: CatalogoIcon,
  categoria: CatalogoIcon,
  bodega: InventarioIcon,
  nombre: ProductoIcon,
  stock: InventarioIcon,
  precio: ProductoIcon,
  creado: CalendarioIcon,
};

const urlPublica = (ruta: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wms-productos/${ruta}`;

const COLUMNAS: ColumnaTabla<FilaProductoDropi>[] = [
  { id: "numero", label: "ID", ocultable: true, clase: "tabular-nums text-muted-foreground", render: (p) => p.numero },
  {
    id: "nombre",
    label: "Nombre",
    ocultable: false,
    render: (p) => (
      <span className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
          {p.portada ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urlPublica(p.portada)} alt="" className="h-full w-full object-cover" />
          ) : (
            <ProductoIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
        <span className="font-medium">{p.nombre}</span>
      </span>
    ),
  },
  { id: "tipo", label: "Tipo", ocultable: true, clase: "text-muted-foreground", render: (p) => ETIQUETA_TIPO_DROPI[p.tipo as TipoDropi] ?? p.tipo },
  { id: "stock", label: "Stock", ocultable: true, clase: "tabular-nums", render: (p) => p.stock },
  { id: "precio", label: "Precio", ocultable: true, clase: "tabular-nums", render: (p) => p.precio || "—" },
  { id: "sugerido", label: "Precio sugerido", ocultable: true, clase: "tabular-nums", render: (p) => p.precioSugerido || "—" },
  { id: "creado", label: "Creado", ocultable: true, clase: "text-muted-foreground tabular-nums", render: (p) => p.creado },
  { id: "bodega", label: "Bodega", ocultable: true, clase: "text-muted-foreground", render: (p) => (p.bodegas.length > 0 ? p.bodegas.join(" · ") : "—") },
  { id: "aprobado", label: "Aprobado", ocultable: true, render: (p) => <Badge tone={p.aprobado ? "success" : "neutral"}>{p.aprobado ? "Sí" : "No"}</Badge> },
  { id: "privado", label: "Privado", ocultable: true, render: (p) => <Badge tone={p.privado ? "warning" : "neutral"}>{p.privado ? "Sí" : "No"}</Badge> },
];

/**
 * Lista de productos de Dropi con la barra de herramientas común (agrupar, «Archivados», filtros, columnas, descargar y
 * «Agregar»). **La tabla no tiene columna de acciones**: toda la fila abre la ficha del producto, donde están sus
 * opciones (actualizar, historial de existencia, archivar…), como en Retiros. «Agregar» abre la misma ficha vacía.
 */
export function TablaWmsDropi({
  productos,
  paisId,
  codigoPais,
  bodegasIniciales,
  puedeEscribir,
}: {
  productos: FilaProductoDropi[];
  paisId: string;
  codigoPais: string;
  bodegasIniciales: Bodega[];
  puedeEscribir: boolean;
}) {
  // undefined = cerrada; null = producto nuevo; texto = el id del producto abierto.
  const [abierto, setAbierto] = useState<string | null | undefined>(undefined);
  const [bodegas, setBodegas] = useState<Bodega[]>(bodegasIniciales);

  return (
    <>
      <TablaDatos
        def={DEF_WMS_DROPI}
        filas={productos}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(p) => p.id}
        anchoMinimo="60rem"
        accionPrincipal={puedeEscribir ? <BotonAgregar aria-haspopup="dialog" onClick={() => setAbierto(null)} /> : undefined}
        abrirFila={{ etiqueta: (p) => `Abrir la ficha del producto ${p.nombre}`, alAbrir: (p) => setAbierto(p.id) }}
        ariaLabel="Productos de Dropi"
        vacio="Todavía no hay productos. Usa «Agregar» para crear el primero."
      />
      <FichaProductoDropi
        id={abierto ?? null}
        abierto={abierto !== undefined}
        paisId={paisId}
        codigoPais={codigoPais}
        bodegas={bodegas}
        puedeEscribir={puedeEscribir}
        alAgregarBodega={(b) => setBodegas((actuales) => [...actuales, b])}
        alCerrar={() => setAbierto(undefined)}
      />
    </>
  );
}
