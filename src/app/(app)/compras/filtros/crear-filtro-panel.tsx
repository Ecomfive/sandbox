"use client";

import { useRef, useState } from "react";
import { FormularioFiltro } from "./formulario-filtro";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { Ventana } from "@/components/ui/ventana";

/**
 * Botón «Agregar» y la ficha para crear un producto candidato: un panel que sale por la derecha, igual que
 * «Nueva compra». Modificar y eliminar uno ya creado se hacen desde su propia ficha (`FichaFiltro`).
 */
export function CrearFiltroPanel({ paisId }: { paisId: string }) {
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

      <Ventana abierto={abierto} alCerrar={cerrarVentana} lado="derecha" ancho="lg" titulo={<span className="text-lg font-semibold">Nuevo producto</span>}>
        <FormularioFiltro paisId={paisId} alGuardar={cerrar} alCambiarGuardando={setGuardando} />
      </Ventana>
    </>
  );
}
