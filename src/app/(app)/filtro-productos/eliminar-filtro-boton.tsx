"use client";

import { useTransition } from "react";
import { eliminarFiltro } from "./actions";
import { BotonAccion } from "@/components/ui/boton-accion";
import { useToast } from "@/components/ui/toast";
import { PapeleraIcon } from "@/lib/nav-icons";

/** Botón «Eliminar» de la ficha de un producto candidato: pide confirmación y borra de verdad. */
export function EliminarFiltroBoton({ id, nombre, alEliminar }: { id: string; nombre: string; alEliminar: () => void }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();

  function alHacerClic() {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return;
    const formData = new FormData();
    formData.set("id", id);
    formData.set("nombre", nombre);
    startTransition(async () => {
      try {
        await eliminarFiltro(formData);
        alEliminar();
      } catch {
        mostrarToast("No se pudo eliminar. Inténtalo de nuevo.", "destructive");
      }
    });
  }

  return (
    <BotonAccion icono={PapeleraIcon} tono="peligro" onClick={alHacerClic} disabled={pending}>
      {pending ? "Eliminando..." : "Eliminar"}
    </BotonAccion>
  );
}
