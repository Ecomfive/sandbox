"use client";

import { useRef } from "react";
import { claseOpcionMenu, MenuDesplegable } from "@/components/ui/menu-desplegable";
import { MasIcon, ProductoIcon, BuscarIcon } from "@/lib/nav-icons";
import type { OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { CrearProductoPanel } from "../producto/crear-producto-panel";
import { crearProductoNuevoEnTest } from "./actions";
import { CrearProductoTestPanel } from "./crear-producto-test-panel";

/**
 * «+ Agregar» de Test productos: un menú con las dos formas de agregar un producto en test. «Producto existente» abre la
 * ficha de siempre (se elige de Producto con su buscador); «Producto nuevo» abre la misma ficha de Producto, que lo crea
 * allá y lo deja aquí vinculado (solo a quien puede modificar Producto).
 */
export function AgregarProductoTest({ paisId, puedeCrearProducto, opcionesSimples }: { paisId: string; puedeCrearProducto: boolean; opcionesSimples: OpcionSkuMaestro[] }) {
  // Las dos fichas se abren desde el menú: cada una entrega aquí su función de abrir.
  const abrirExistente = useRef<() => void>(() => {});
  const abrirNuevo = useRef<() => void>(() => {});

  return (
    <>
      <MenuDesplegable
        etiqueta="Agregar producto en test"
        claseMenu="w-64"
        claseBoton="inline-flex items-center justify-center gap-1 boton-neon border border-transparent px-4 py-2 text-sm font-medium text-white !rounded-md"
        contenidoBoton={
          <>
            <MasIcon className="h-4 w-4" />
            Agregar
          </>
        }
      >
        {(cerrar) => (
          <>
            <button
              type="button"
              role="menuitem"
              className={claseOpcionMenu}
              onClick={() => {
                cerrar();
                abrirExistente.current();
              }}
            >
              <BuscarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              Producto existente
            </button>
            {puedeCrearProducto && (
              <button
                type="button"
                role="menuitem"
                className={claseOpcionMenu}
                onClick={() => {
                  cerrar();
                  abrirNuevo.current();
                }}
              >
                <ProductoIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                Producto nuevo
              </button>
            )}
          </>
        )}
      </MenuDesplegable>
      <CrearProductoTestPanel
        paisId={paisId}
        boton={(abrir) => {
          abrirExistente.current = abrir;
          return null;
        }}
      />
      {puedeCrearProducto && (
        <CrearProductoPanel
          opcionesSimples={opcionesSimples}
          action={crearProductoNuevoEnTest}
          mensajeExito="Producto creado y agregado a Test productos"
          ocultos={{ pais_id: paisId }}
          boton={(abrir) => {
            abrirNuevo.current = abrir;
            return null;
          }}
        />
      )}
    </>
  );
}
