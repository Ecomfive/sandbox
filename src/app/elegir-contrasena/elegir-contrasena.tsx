"use client";

import { useRouter } from "next/navigation";
import { FormularioContrasena } from "@/components/cuenta/formulario-contrasena";

/** El formulario de /elegir-contrasena: al guardar entra al sistema (el layout vuelve a leer la sesión, ya sin la marca de temporal). */
export function ElegirContrasena() {
  const router = useRouter();
  return (
    <FormularioContrasena
      temporal
      alGuardar={() => {
        router.replace("/");
        router.refresh();
      }}
    />
  );
}
