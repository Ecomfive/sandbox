"use client";

import { useRef, useState } from "react";
import { FormularioCompra } from "./formulario-compra";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { Ventana } from "@/components/ui/ventana";

/**
 * Botón «Agregar» y la ficha para crear una compra: un panel que sale por la derecha, igual que «Nueva
 * cuenta destino». Modificar y eliminar una compra ya creada se hacen desde su propia ficha (`FichaCompra`).
 */
export function CrearCompraPanel({ paisId }: { paisId: string }) {
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
      <BotonAgregar ref={botonAbrirRef} onClick={() => setAbierto(true)} />

      <Ventana abierto={abierto} alCerrar={cerrarVentana} lado="derecha" ancho="lg" titulo={<span className="text-lg font-semibold">Nueva compra</span>}>
        <FormularioCompra paisId={paisId} alGuardar={cerrar} alCambiarGuardando={setGuardando} />
      </Ventana>
    </>
  );
}
