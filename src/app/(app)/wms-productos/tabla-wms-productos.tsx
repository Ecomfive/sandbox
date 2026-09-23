"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, CatalogoIcon, EstadoIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { ETIQUETA_ESTADO_PRODUCTO, TONO_ESTADO_PRODUCTO, type EstadoProducto } from "@/lib/wms/producto";
import { DEF_WMS_PRODUCTOS, type FilaProductoWms } from "./def-wms-productos";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  titulo: ProductoIcon,
  categoria: CatalogoIcon,
  tipo: CatalogoIcon,
  proveedor: ProductoIcon,
  existencias: InventarioIcon,
  creado: CalendarioIcon,
};

const urlPublica = (ruta: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wms-productos/${ruta}`;

const COLUMNAS: ColumnaTabla<FilaProductoWms>[] = [
  {
    id: "titulo",
    label: "Producto",
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
        <span className="font-medium">{p.titulo}</span>
      </span>
    ),
  },
  {
    id: "estado",
    label: "Estado",
    ocultable: true,
    render: (p) => <Badge tone={TONO_ESTADO_PRODUCTO[p.estado as EstadoProducto] ?? "neutral"}>{ETIQUETA_ESTADO_PRODUCTO[p.estado as EstadoProducto] ?? p.estado}</Badge>,
  },
  {
    id: "existencias",
    label: "Inventario",
    ocultable: true,
    clase: "tabular-nums",
    render: (p) => `${p.existencias} en existencia${p.variantes > 1 ? ` · ${p.variantes} variantes` : ""}`,
  },
  { id: "precio", label: "Precio", ocultable: true, clase: "tabular-nums", render: (p) => p.precio || "—" },
  { id: "categoria", label: "Categoría", ocultable: true, clase: "text-muted-foreground", render: (p) => p.categoria || "—" },
  { id: "tipo", label: "Tipo", ocultable: true, clase: "text-muted-foreground", render: (p) => p.tipo || "—" },
  { id: "proveedor", label: "Proveedor", ocultable: true, clase: "text-muted-foreground", render: (p) => p.proveedor || "—" },
];

/** Lista de productos de la ficha Shopify (WMS): toda la fila abre la ficha del producto; «Agregar» abre la ficha vacía. */
export function TablaWmsProductos({ productos, puedeEscribir }: { productos: FilaProductoWms[]; puedeEscribir: boolean }) {
  const router = useRouter();
  return (
    <TablaDatos
      def={DEF_WMS_PRODUCTOS}
      filas={productos}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(p) => p.id}
      anchoMinimo="52rem"
      accionPrincipal={puedeEscribir ? <BotonAgregar aria-haspopup={undefined} onClick={() => router.push("/wms-productos/nuevo")} /> : undefined}
      abrirFila={{
        etiqueta: (p) => `Abrir la ficha del producto ${p.titulo}`,
        alAbrir: (p) => router.push(`/wms-productos/${p.id}`),
      }}
      ariaLabel="Productos"
      vacio="Todavía no hay productos. Usa «Agregar» para crear el primero."
    />
  );
}
