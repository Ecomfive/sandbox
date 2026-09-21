"use client";

import { useRef, useState } from "react";
import { FormularioCuenta } from "./formulario-cuenta";
import { Button } from "@/components/ui/button";
import { Ventana } from "@/components/ui/ventana";
import { MasIcon } from "@/lib/nav-icons";

/**
 * Botón «Agregar» y la ficha para crear una cuenta destino: un panel que sale por la derecha (como la ficha de un
 * pedido en otros sistemas), con la cabecera fija arriba, los datos en bloques con ícono y los botones fijos abajo.
 * Modificar y eliminar una cuenta existente se hacen desde su propia ficha (`FichaCuenta`), que se abre pulsando la
 * fila. El panel es `Ventana`: foco dentro, Escape y clic fuera lo cierran, y el foco vuelve al botón.
 */
export function VentanaCuentaRetiro({ paisId, paisNombre }: { paisId: string; paisNombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const botonAbrirRef = useRef<HTMLButtonElement>(null);

  /** Cierra la ficha y devuelve el foco al botón que la abrió (algunos navegadores no le dan el foco al hacer clic). */
  function cerrar() {
    setAbierto(false);
    setGuardando(false); // el formulario se desmonta: ya no avisará que terminó

    requestAnimationFrame(() => botonAbrirRef.current?.focus());
  }

  function cerrarVentana() {
    if (guardando) return;
    cerrar();
  }

  return (
    <>
      <Button
        ref={botonAbrirRef}
        type="button"
        onClick={() => setAbierto(true)}
        className="!rounded-full !bg-[#202020] !text-white hover:!bg-[#2d2d2d]"
      >
        <MasIcon className="mr-1 h-4 w-4" />
        Agregar
      </Button>

      <Ventana
        abierto={abierto}
        alCerrar={cerrarVentana}
        lado="derecha"
        ancho="lg"
        titulo={<span className="text-lg font-semibold">Nueva cuenta destino</span>}
      >
        <FormularioCuenta
          paisId={paisId}
          paisNombre={paisNombre}
          alGuardar={cerrar}
          alCancelar={cerrarVentana}
          alCambiarGuardando={setGuardando}
        />
      </Ventana>
    </>
  );
}
