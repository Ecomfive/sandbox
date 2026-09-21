"use client";

import { useState, useTransition } from "react";
import { actualizarRol, alternarSoloLectura, eliminarRol, togglePermiso } from "./actions";
import type { Rol } from "./def-usuarios";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { MODULOS } from "@/lib/modulos";

function FilaModulo({
  rolId,
  clave,
  etiqueta,
  activo,
  soloLectura,
}: {
  rolId: string;
  clave: string;
  etiqueta: string;
  activo: boolean;
  soloLectura: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-0">
      <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          defaultChecked={activo}
          disabled={pending}
          className="h-4 w-4 accent-foreground disabled:opacity-50"
          onChange={(e) => {
            const formData = new FormData();
            formData.set("rol_id", rolId);
            formData.set("modulo", clave);
            formData.set("activo", String(e.target.checked));
            startTransition(() => togglePermiso(formData));
          }}
        />
        {etiqueta}
      </label>
      {activo && (
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            defaultChecked={soloLectura}
            disabled={pending}
            className="h-3.5 w-3.5 accent-foreground disabled:opacity-50"
            onChange={(e) => {
              const formData = new FormData();
              formData.set("rol_id", rolId);
              formData.set("modulo", clave);
              formData.set("solo_lectura", String(e.target.checked));
              startTransition(() => alternarSoloLectura(formData));
            }}
          />
          Solo lectura
        </label>
      )}
    </div>
  );
}

/**
 * Ficha de un rol: nombre y descripción (se guardan con su propio botón) y qué páginas ve — un checkbox por
 * módulo, con "Solo lectura" al lado cuando está prendido (cada uno guarda solo, sin botón Guardar aparte).
 * Al final, eliminar el rol — bloqueado mientras todavía tenga personas.
 */
export function FichaRol({
  rol,
  modulosActivos,
  modulosSoloLectura,
  personas,
  alCerrar,
}: {
  rol: Rol | undefined;
  modulosActivos: Set<string>;
  modulosSoloLectura: Set<string>;
  /** Cuántas personas tienen este rol hoy (para bloquear el borrado). */
  personas: number;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function alEnviarDatos(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rol) return;
    const formData = new FormData(e.currentTarget);
    formData.set("id", rol.id);
    setError(null);
    startTransition(async () => {
      const resultado = await actualizarRol(formData);
      if (resultado?.error) setError(resultado.error);
      else mostrarToast("Cambios guardados");
    });
  }

  function alEliminar() {
    if (!rol) return;
    if (!confirm(`¿Está seguro de que desea eliminar el rol "${rol.nombre}"?`)) return;
    const formData = new FormData();
    formData.set("id", rol.id);
    startTransition(async () => {
      const resultado = await eliminarRol(formData);
      if (resultado?.error) mostrarToast(resultado.error, "destructive");
      else {
        mostrarToast("Rol eliminado");
        alCerrar();
      }
    });
  }

  return (
    <Ventana abierto={!!rol} alCerrar={alCerrar} lado="derecha" titulo={rol && <span className="text-lg font-semibold">{rol.nombre}</span>}>
      {rol && (
        <div className="flex flex-1 flex-col divide-y divide-border">
          <section className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Datos</h3>
            <form onSubmit={alEnviarDatos} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Nombre</span>
                <input type="text" name="nombre" required data-enfocar defaultValue={rol.nombre} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Descripción</span>
                <input type="text" name="descripcion" defaultValue={rol.descripcion ?? ""} placeholder="Qué puede hacer alguien con este rol" className={fieldClass} />
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={pending}
                className={`self-start rounded-md bg-[#202020] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d2d2d] disabled:opacity-50 ${anilloFoco}`}
              >
                {pending ? "Guardando..." : "Guardar"}
              </button>
            </form>
          </section>

          <section className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Páginas que ve</h3>
            <div className="rounded-lg border border-border">
              {MODULOS.map((m) => (
                <FilaModulo
                  key={m.clave}
                  rolId={rol.id}
                  clave={m.clave}
                  etiqueta={m.etiqueta}
                  activo={modulosActivos.has(m.clave)}
                  soloLectura={modulosSoloLectura.has(m.clave)}
                />
              ))}
            </div>
          </section>

          <section className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Personas</h3>
            <p className="text-sm text-muted-foreground">
              {personas === 0 ? "Nadie tiene este rol todavía." : `${personas} persona${personas === 1 ? "" : "s"} con este rol.`}
            </p>
            <button
              type="button"
              onClick={alEliminar}
              disabled={pending || personas > 0}
              className={`mt-3 inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive-soft disabled:opacity-50 disabled:hover:bg-transparent ${anilloFoco}`}
            >
              Eliminar rol
            </button>
          </section>
        </div>
      )}
    </Ventana>
  );
}
