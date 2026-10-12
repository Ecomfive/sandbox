"use client";

import { useRef, useState, type ReactNode } from "react";
import { FormularioProductoTest } from "./formulario-producto-test";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { Ventana } from "@/components/ui/ventana";

/**
 * Botón «Agregar» y la ficha para crear un producto en test: un panel que sale por la derecha, igual que
 * «Nuevo producto» de Filtros. Modificar y eliminar uno ya creado se hacen desde su propia ficha.
 */
export function CrearProductoTestPanel({ paisId, boton }: { paisId: string; /** Otro botón que abre la ficha en vez de «Agregar». */ boton?: (abrir: () => void) => ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const botonAbrirRef = useRef<HTMLButtonElement>(null);

  function cerrar() {
    setAbierto(false);
    setGuardando(false);
    requestAnimationFrame(() => botonAbrirRef.current?.focus());
  }

  function cerrarVentana() {
    if (guardando) return;
    cerrar();
  }

  return (
    <>
      {boton ? boton(() => setAbierto(true)) : <BotonAgregar ref={botonAbrirRef} onClick={() => setAbierto(true)} />}

      <Ventana abierto={abierto} alCerrar={cerrarVentana} lado="derecha" ancho="lg" titulo={<span className="text-lg font-semibold">Nuevo producto</span>}>
        <FormularioProductoTest paisId={paisId} alGuardar={cerrar} alCambiarGuardando={setGuardando} />
      </Ventana>
    </>
  );
}
