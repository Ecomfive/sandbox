"use client";

import { useRef, useState } from "react";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { FormularioSeleccion, type Responsable } from "./formulario-seleccion";

/** «Agregar»: una fila nueva a mano, en un panel que sale por la derecha (como «Nuevo producto» de Filtro de productos). */
export function CrearSeleccionPanel({ responsables, categorias }: { responsables: Responsable[]; categorias: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const botonAbrirRef = useRef<HTMLButtonElement>(null);
  const { mostrarToast } = useToast();

  function cerrar() {
    setAbierto(false);
    setGuardando(false);
    requestAnimationFrame(() => botonAbrirRef.current?.focus());
  }

  return (
    <>
      <BotonAgregar ref={botonAbrirRef} onClick={() => setAbierto(true)} />
      <Ventana abierto={abierto} alCerrar={() => !guardando && cerrar()} lado="derecha" ancho="lg" titulo={<span className="text-lg font-semibold">Nuevo producto para seleccionar</span>}>
        <FormularioSeleccion
          responsables={responsables}
          categorias={categorias}
          alGuardar={() => {
            cerrar();
            mostrarToast("Agregado a Selección de productos");
          }}
          alCambiarGuardando={setGuardando}
        />
      </Ventana>
    </>
  );
}
