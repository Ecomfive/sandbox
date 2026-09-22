"use client";

import { useTransition } from "react";
import { cancelarRetiro } from "./actions";
import { BotonAccion } from "@/components/ui/boton-accion";
import { useToast } from "@/components/ui/toast";
import { CerrarIcon } from "@/lib/nav-icons";

/** Botón para cancelar un retiro — mismo patrón que EliminarRetiroBoton (confirm() antes de
 * enviar, useTransition, error como toast). Solo se usa como botón grande en la fila de
 * acciones de la ficha del retiro (no hay ícono suelto en la tabla para esto). */
export function CancelarRetiroBoton({ id, correlativo }: { id: string; correlativo: number }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();
  const numero = `#${String(correlativo).padStart(4, "0")}`;

  function alHacerClic() {
    if (!confirm(`¿Está seguro de que desea cancelar el retiro ${numero}?`)) return;
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      try {
        await cancelarRetiro(formData);
      } catch (err) {
        mostrarToast(err instanceof Error ? err.message : `No se pudo cancelar el retiro ${numero}.`, "destructive");
      }
    });
  }

  return (
    <BotonAccion icono={CerrarIcon} tono="peligro" onClick={alHacerClic} disabled={pending}>
      {pending ? "Cancelando..." : "Cancelar"}
    </BotonAccion>
  );
}
