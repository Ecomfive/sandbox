"use client";

import { Ventana } from "@/components/ui/ventana";
import { useToast } from "@/components/ui/toast";
import { FormularioContrasena } from "./formulario-contrasena";

/** «Cambiar contraseña» del menú de la cuenta: una ventana al centro con el formulario. */
export function VentanaContrasena({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  return (
    <Ventana abierto={abierto} alCerrar={alCerrar} titulo="Cambiar contraseña" ancho="sm">
      <FormularioContrasena
        alCancelar={alCerrar}
        alGuardar={() => {
          alCerrar();
          mostrarToast("Tu contraseña se cambió.");
        }}
      />
    </Ventana>
  );
}
