"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, CatalogoIcon, EstadoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearProductoPanel } from "./crear-producto-panel";
import { DEF_PRODUCTO, ETIQUETA_CLASE, ETIQUETA_TIPO, TONO_CLASE, type FilaProducto } from "./def-producto";
import { FichaProducto } from "./ficha-producto";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  producto: ProductoIcon,
  clase: EstadoIcon,
  tipo: CatalogoIcon,
  codigo: ProductoIcon,
  nombre: ProductoIcon,
  componentes: ProductoIcon,
  barras: ProductoIcon,
  vencimiento: CalendarioIcon,
  creado: CalendarioIcon,
};

const COLUMNAS: ColumnaTabla<FilaProducto>[] = [
  { id: "codigo", label: "SKU", ocultable: false, clase: "font-medium", render: (p) => p.codigo },
  { id: "foto", label: "Foto", ocultable: true, render: (p) => <MiniaturaFoto url={p.foto} nombre={p.nombre} /> },
  { id: "nombre", label: "Producto", ocultable: true, render: (p) => p.nombre },
  { id: "tipo", label: "Tipo", ocultable: true, clase: "text-muted-foreground", render: (p) => ETIQUETA_TIPO[p.tipo] ?? p.tipo },
  { id: "clase", label: "Estado", ocultable: true, render: (p) => <Badge tone={TONO_CLASE[p.clase]}>{ETIQUETA_CLASE[p.clase] ?? p.clase}</Badge> },
  { id: "barras", label: "Código de barras", ocultable: true, clase: "text-muted-foreground tabular-nums", render: (p) => p.codigoBarras ?? "—" },
  { id: "vencimiento", label: "Vencimiento", ocultable: true, clase: "text-muted-foreground", render: (p) => (p.manejaVencimiento ? "Por lote" : "—") },
  { id: "componentes", label: "Componentes", ocultable: true, clase: "text-muted-foreground", render: (p) => p.componentes || "—" },
  { id: "asociaciones", label: "Fichas", ocultable: true, clase: "text-muted-foreground tabular-nums", render: (p) => p.asociaciones.length },
];

/**
 * Lista de productos con la barra de herramientas común (agrupar por clase o tipo, filtros y «Agregar»). **La tabla no
 * tiene columna de acciones**: toda la fila abre la ficha del producto, donde se cambia su clase y se ven sus fichas
 * enlazadas y su actividad — mismo patrón que Cuentas destino.
 */
export function TablaProducto({
  productos,
  opcionesSimples,
  codigoPais,
  puedeEscribir,
}: {
  productos: FilaProducto[];
  opcionesSimples: { id: string; codigo: string; nombre: string }[];
  codigoPais: string;
  puedeEscribir: boolean;
}) {
  // Qué producto está abierto y en qué orden se veían las filas al abrirlo (para las flechas de anterior y siguiente).
  const [abierto, setAbierto] = useState<{ id: string; orden: string[] } | null>(null);
  const producto = abierto ? productos.find((p) => p.id === abierto.id) : undefined;

  return (
    <>
      <TablaDatos
        def={DEF_PRODUCTO}
        filas={productos}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(p) => p.id}
        anchoMinimo="48rem"
        accionPrincipal={puedeEscribir ? <CrearProductoPanel opcionesSimples={opcionesSimples} /> : undefined}
        abrirFila={{
          etiqueta: (p) => `Abrir la ficha del producto ${p.codigo}`,
          alAbrir: (p, orden) => setAbierto({ id: p.id, orden }),
        }}
        ariaLabel="Productos"
        vacio="Todavía no hay productos. Usa «Agregar» para crear el primero."
      />
      <FichaProducto
        producto={producto}
        orden={abierto?.orden ?? []}
        codigoPais={codigoPais}
        puedeEscribir={puedeEscribir}
        alIr={(id) => setAbierto((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierto(null)}
      />
    </>
  );
}
