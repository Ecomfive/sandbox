"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { renombrarProducto } from "./actions";

/**
 * El nombre del producto en su ficha: con permiso de escritura es un campo que se guarda al salir de él o con Enter (Escape
 * lo deja como estaba). El cambio queda en la actividad del producto.
 */
export function NombreProducto({ id, nombre, puedeEscribir }: { id: string; nombre: string; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [texto, setTexto] = useState(nombre);
  const [pendiente, startTransition] = useTransition();
  if (!puedeEscribir) return <>{nombre}</>;

  function guardar() {
    const limpio = texto.trim().replace(/\s+/g, " ");
    if (limpio === nombre) return setTexto(nombre);
    if (!limpio) {
      setTexto(nombre);
      return mostrarToast("El nombre no puede quedar vacío.", "destructive");
    }
    startTransition(async () => {
      const r = await renombrarProducto(id, limpio);
      if (r.error) {
        setTexto(nombre);
        return mostrarToast(r.error, "destructive");
      }
      mostrarToast("Nombre guardado.");
      router.refresh();
    });
  }

  return (
    <input
      aria-label="Nombre del producto"
      value={texto}
      maxLength={200}
      disabled={pendiente}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setTexto(nombre);
        }
      }}
      className={`${fieldClassSm} w-full`}
    />
  );
}
