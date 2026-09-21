"use client";

import { useRef, useState, useTransition } from "react";
import { crearRol } from "./actions";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { MasIcon } from "@/lib/nav-icons";

/** Botón "Crear rol" y su ficha: nombre y descripción. Las páginas que ve se eligen después, desde la
 * ficha del rol ya creado (empieza sin ninguna). */
export function CrearRolPanel() {
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const botonAbrirRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function cerrar() {
    if (pending) return;
    setAbierto(false);
    setError(null);
    formRef.current?.reset();
    botonAbrirRef.current?.focus();
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const resultado = await crearRol(formData);
      if (resultado?.error) setError(resultado.error);
      else cerrar();
    });
  }

  return (
    <>
      <button
        ref={botonAbrirRef}
        type="button"
        onClick={() => setAbierto(true)}
        className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}
      >
        <MasIcon className="h-4 w-4" />
        Crear rol
      </button>

      <Ventana abierto={abierto} alCerrar={cerrar} lado="derecha" ancho="sm" titulo={<span className="text-lg font-semibold">Crear rol</span>}>
        <form ref={formRef} onSubmit={alEnviar} className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 p-5">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>
                Nombre
                <span aria-hidden="true" className="text-destructive"> *</span>
              </span>
              <input type="text" name="nombre" required data-enfocar placeholder="Ej. Finanzas" className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Descripción</span>
              <input type="text" name="descripcion" placeholder="Qué puede hacer alguien con este rol" className={fieldClass} />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button type="button" onClick={cerrar} disabled={pending} className={`rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
              Cancelar
            </button>
            <button type="submit" disabled={pending} className={`rounded-full bg-[#202020] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d2d2d] disabled:opacity-50 ${anilloFoco}`}>
              {pending ? "Creando..." : "Crear rol"}
            </button>
          </div>
        </form>
      </Ventana>
    </>
  );
}
