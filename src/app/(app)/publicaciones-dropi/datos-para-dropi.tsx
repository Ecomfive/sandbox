"use client";

import { useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CheckIcon } from "@/lib/nav-icons";
import type { OpcionesCrear } from "@/lib/publicaciones/crear-dropi";
import { guardarDatosDropi } from "./actions";
import { CamposDatosDropi } from "./campos-datos-dropi";
import type { FilaPublicacion } from "./def-publicaciones";

/**
 * Los datos que Dropi pide para publicar una publicación «Sin publicar» (peso, medidas, categoría, descripción, stock inicial y fotos), en su
 * propio formulario aparte del de la ficha (un formulario no va dentro de otro). Si la publicación ya está pendiente para Dropi, guardar
 * también actualiza lo pendiente. El nombre y el precio son los de la ficha.
 */
export function DatosParaDropi({ p, opciones }: { p: FilaPublicacion; opciones: OpcionesCrear }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const datos = new FormData(e.currentTarget);
    empezar(async () => {
      const r = await guardarDatosDropi(datos).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Datos para Dropi guardados");
        setVersion((v) => v + 1);
      }
    });
  }

  return (
    <form onSubmit={guardar} aria-busy={pendiente} aria-label="Datos para Dropi" className="flex flex-col divide-y divide-border border-b border-border px-5 pb-5">
      <input type="hidden" name="id" value={p.id} />
      {/* `key`: al guardar se vuelven a tomar los datos que llegan del servidor. */}
      <CamposDatosDropi key={version} opciones={opciones} inicial={p.datosDropi} idBase="ficha-dd" />
      <div className="flex flex-col gap-2 pt-4">
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
        <button type="submit" disabled={pendiente} className={`inline-flex w-fit items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
          <CheckIcon className="h-4 w-4" />
          {pendiente ? "Guardando..." : "Guardar datos para Dropi"}
        </button>
      </div>
    </form>
  );
}
