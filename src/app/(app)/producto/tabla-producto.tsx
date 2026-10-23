"use client";

import type { OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { CalendarioIcon, CatalogoIcon, ComprasIcon, EstadoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearProductoPanel, type CompuestoInicial } from "./crear-producto-panel";
import { DEF_PRODUCTO, type FilaProducto, type ReferenciasTest } from "./def-producto";
import { FichaProducto } from "./ficha-producto";
import { FilaProductoLista } from "./fila-producto";
import { TableroProducto } from "./tablero-producto";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  producto: ProductoIcon,
  clase: EstadoIcon,
  categoria: CatalogoIcon,
  categoriaPrincipal: CatalogoIcon,
  categoriaRevisar: EstadoIcon,
  tipo: CatalogoIcon,
  codigo: ProductoIcon,
  nombre: ProductoIcon,
  componentes: ProductoIcon,
  barras: ProductoIcon,
  vencimiento: CalendarioIcon,
  creado: CalendarioIcon,
  comprado: ComprasIcon,
  test: EstadoIcon,
  oferta: ComprasIcon,
  decidir: EstadoIcon,
};

/**
 * Lista de productos con la barra de herramientas común (agrupar por clase o tipo, filtros y «Agregar»). Desde el 23 oct 2026 va
 * por filas, como Gestión de IDs Dropi (`FilaProductoLista`): toda la fila abre la ficha del producto, donde se cambia su clase y
 * se ven sus fichas enlazadas, su test y su actividad.
 */
export function TablaProducto({
  productos,
  opcionesSimples,
  codigoPais,
  abrirInicial = null,
  compuestoInicial = null,
  puedeEscribir,
  puedeEliminar,
  referenciasTest,
}: {
  productos: FilaProducto[];
  opcionesSimples: OpcionSkuMaestro[];
  codigoPais: string;
  /** El producto que se abre al cargar (`?abrir=`, desde la ficha de una publicación de Dropi); si no existe, nada. */
  abrirInicial?: string | null;
  /** Con `?nuevo=1&componente=&cantidad=`: la ficha «Nuevo producto» se abre sola, como compuesto con ese componente. */
  compuestoInicial?: CompuestoInicial | null;
  puedeEscribir: boolean;
  /** Solo un administrador: elimina el producto de verdad (si nada depende de él). */
  puedeEliminar: boolean;
  referenciasTest: ReferenciasTest;
}) {
  // Qué producto está abierto y en qué orden se veían las filas al abrirlo (para las flechas de anterior y siguiente).
  const [abierto, setAbierto] = useState<{ id: string; orden: string[] } | null>(() =>
    abrirInicial && productos.some((p) => p.id === abrirInicial) ? { id: abrirInicial, orden: productos.map((p) => p.id) } : null,
  );
  // La ficha se dibuja en `<body>` (portal): con `?abrir=` arranca abierta, así que solo se monta ya en el navegador.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  // Ya abierta, el parámetro sobra: se quita de la dirección para que cerrar y recargar no la abra otra vez.
  const router = useRouter();
  const ruta = usePathname();
  useEffect(() => {
    if (abrirInicial) router.replace(ruta, { scroll: false });
  }, [abrirInicial, router, ruta]);
  const producto = abierto ? productos.find((p) => p.id === abierto.id) : undefined;

  return (
    <>
      <TableroProducto productos={productos} />
      <ListaDatos
        def={DEF_PRODUCTO}
        filas={productos}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(p) => p.id}
        variante="filas"
        renderFila={(p, enOrden) => <FilaProductoLista p={p} alAbrir={() => setAbierto({ id: p.id, orden: enOrden.map((x) => x.id) })} />}
        accionPrincipal={puedeEscribir ? <CrearProductoPanel opcionesSimples={opcionesSimples} abrirConNuevo compuestoInicial={compuestoInicial} /> : undefined}
        vacio="Todavía no hay productos. Usa «Agregar» para crear el primero."
      />
      {enNavegador && (
        <FichaProducto
          producto={producto}
          orden={abierto?.orden ?? []}
          codigoPais={codigoPais}
          puedeEscribir={puedeEscribir}
          puedeEliminar={puedeEliminar}
          referenciasTest={referenciasTest}
          alIr={(id) => setAbierto((a) => (a ? { ...a, id } : a))}
          alCerrar={() => setAbierto(null)}
        />
      )}
    </>
  );
}
