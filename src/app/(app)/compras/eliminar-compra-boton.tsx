"use client";

import { useTransition } from "react";
import { eliminarCompra } from "./actions";
import { BotonAccion } from "@/components/ui/boton-accion";
import { useToast } from "@/components/ui/toast";
import { PapeleraIcon } from "@/lib/nav-icons";

/** Botón «Eliminar» de la ficha de una compra: pide confirmación y borra de verdad (a diferencia de Cuentas
 * destino, una compra no queda referenciada desde otra tabla, así que no hace falta desactivarla en su lugar). */
export function EliminarCompraBoton({ id, nombre, alEliminar }: { id: string; nombre: string; alEliminar: () => void }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();

  function alHacerClic() {
    if (!confirm(`¿Eliminar la compra "${nombre}"?`)) return;
    const formData = new FormData();
    formData.set("id", id);
    formData.set("nombre", nombre);
    startTransition(async () => {
      try {
        await eliminarCompra(formData);
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
