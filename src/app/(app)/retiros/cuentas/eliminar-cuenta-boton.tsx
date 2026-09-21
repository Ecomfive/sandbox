"use client";

import { useTransition } from "react";
import { eliminarCuentaRetiro } from "./actions";
import { BotonAccion } from "@/components/ui/boton-accion";
import { useToast } from "@/components/ui/toast";
import { PapeleraIcon } from "@/lib/nav-icons";
import { mensajeErrorAlEliminar } from "@/lib/retiros/errores";

/** Eliminar una cuenta destino, desde su ficha. Pide confirmación; en realidad la desactiva (no borra la fila, ver
 * `eliminarCuentaRetiro`), así que la ficha queda abierta mostrando su nuevo estado y solo desaparece de la tabla
 * si el filtro «Eliminadas» está apagado. Si Supabase falla, el error sale como aviso (toast). */
export function EliminarCuentaBoton({ id, nombre, yaEliminada }: { id: string; nombre: string; yaEliminada?: boolean }) {
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
    <BotonAccion icono={PapeleraIcon} tono="peligro" onClick={alHacerClic} disabled={pending || yaEliminada}>
      {pending ? "Eliminando..." : "Eliminar"}
    </BotonAccion>
  );
}
