"use client";

import { ListaDatos } from "@/components/tabla/lista-datos";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { DesconectadoIcon, EnlaceIcon, EstadoIcon, InventarioIcon, MargenIcon, ProductoIcon } from "@/lib/nav-icons";
import type { OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import type { MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearProductoDropPanel } from "./crear-producto-drop-panel";
import { DEF_PUBLICACIONES_DROP, type FilaPublicacionDrop } from "./def-publicaciones-drop";
import { FilaPublicacionDropLista } from "./fila-publicacion-drop";

const NOMBRE: NombreFilas = { singular: "publicación", plural: "publicaciones" };
const ICONOS: Record<string, IconoComp> = {
  nombre: ProductoIcon,
  skuDrop: ProductoIcon,
  idDrop: DesconectadoIcon,
  estado: EstadoIcon,
  vinculo: EnlaceIcon,
  stock: InventarioIcon,
  margen: MargenIcon,
  precio: MargenIcon,
  inventario: InventarioIcon,
};

/**
 * La lista de publicaciones de Drop: la misma barra de herramientas que la de Dropi (buscar, filtrar, agrupar, descargar); las tarjetas de arriba la filtran. «Crear producto» es el «Agregar» de
 * Drop (el botón negro de su pantalla).
 */
export function ListaPublicacionesDrop({ publicaciones, moneda, puedeEscribir, opcionesSku, vacio }: { publicaciones: FilaPublicacionDrop[]; moneda: MonedaPublicaciones; puedeEscribir: boolean; opcionesSku: OpcionSkuMaestro[]; vacio: string }) {
  return (
    <ListaDatos
      def={DEF_PUBLICACIONES_DROP}
      filas={publicaciones}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      variante="filas"
      renderFila={(f) => <FilaPublicacionDropLista f={f} moneda={moneda} puedeEscribir={puedeEscribir} />}
      accionPrincipal={puedeEscribir ? <CrearProductoDropPanel opcionesSku={opcionesSku} /> : undefined}
      vacio={vacio}
    />
  );
}
