"use client";

import { useTransition } from "react";
import { eliminarCuentaRetiro } from "./actions";
import { BotonAccion } from "@/components/ui/boton-accion";
import { useToast } from "@/components/ui/toast";
import { PapeleraIcon } from "@/lib/nav-icons";
import { mensajeErrorAlEliminar } from "@/lib/retiros/errores";

/** Eliminar una cuenta destino, desde su ficha. Pide confirmación; si no se puede (tiene retiros), el error sale como
 * aviso (toast). Al borrarse, la fila desaparece de la lista y la ficha se cierra sola. */
export function EliminarCuentaBoton({ id, nombre }: { id: string; nombre: string }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();

  function alHacerClic() {
    if (!confirm(`¿Está seguro de que desea eliminar la cuenta "${nombre}"?`)) return;
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const resultado = await eliminarCuentaRetiro(formData).catch(() => ({ error: "Inténtalo de nuevo." }));
      if (resultado?.error) mostrarToast(mensajeErrorAlEliminar(`la cuenta "${nombre}"`, resultado.error), "destructive");
    });
  }

  return (
    <BotonAccion icono={PapeleraIcon} tono="peligro" onClick={alHacerClic} disabled={pending}>
      {pending ? "Eliminando..." : "Eliminar"}
    </BotonAccion>
  );
}
