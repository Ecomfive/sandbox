"use client";

import { useTransition } from "react";
import { togglePermiso, alternarSoloLectura } from "./actions";

export function PermisoCheckbox({
  rolId,
  modulo,
  etiqueta,
  activo,
  soloLectura,
}: {
  rolId: string;
  modulo: string;
  etiqueta: string;
  activo: boolean;
  soloLectura: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-center">
      {/* La caja se ve de 16 px, pero su zona de clic mide 24 (WCAG 2.5.8): la etiqueta que la envuelve también marca. */}
      <label className="flex h-6 w-6 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          aria-label={`Acceso al módulo ${etiqueta}`}
          defaultChecked={activo}
          disabled={pending}
          className="h-4 w-4 accent-accent disabled:opacity-50"
          onChange={(e) => {
            const formData = new FormData();
            formData.set("rol_id", rolId);
            formData.set("modulo", modulo);
            formData.set("activo", String(e.target.checked));
            startTransition(() => {
              togglePermiso(formData);
            });
          }}
        />
      </label>
      {activo && (
        <label className="flex min-h-6 cursor-pointer items-center gap-1 text-[0.65rem] whitespace-nowrap text-muted-foreground">
          <input
            type="checkbox"
            aria-label={`Solo lectura en ${etiqueta}`}
            defaultChecked={soloLectura}
            disabled={pending}
            className="h-3 w-3 accent-accent disabled:opacity-50"
            onChange={(e) => {
              const formData = new FormData();
              formData.set("rol_id", rolId);
              formData.set("modulo", modulo);
              formData.set("solo_lectura", String(e.target.checked));
              startTransition(() => {
                alternarSoloLectura(formData);
              });
            }}
          />
          Solo lectura
        </label>
      )}
    </div>
  );
}
