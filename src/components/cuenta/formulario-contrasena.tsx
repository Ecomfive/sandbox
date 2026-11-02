"use client";

import { useId, useState } from "react";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { labelClass } from "@/components/ui/field";
import { cambiarMiContrasena } from "@/lib/cuenta/contrasena-actions";
import { MIN_CONTRASENA } from "@/lib/cuenta/contrasena";

/**
 * Cambiar la contraseña propia: la actual (o la temporal), la nueva y otra vez la nueva. Sale en «Cambiar contraseña» del menú
 * de la cuenta (`VentanaContrasena`) y en /elegir-contrasena, mientras la persona entra con una temporal.
 */
export function FormularioContrasena({ temporal = false, alGuardar, alCancelar }: { temporal?: boolean; alGuardar: () => void; alCancelar?: () => void }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  return (
    // `method="post"`: si se envía antes de que cargue la página, las contraseñas no quedan en la dirección.
    <form
      method="post"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        setError(null);
        setGuardando(true);
        const r = await cambiarMiContrasena(String(datos.get("actual") ?? ""), String(datos.get("nueva") ?? ""), String(datos.get("repetida") ?? "")).catch(() => ({
          error: "No se pudo cambiar la contraseña. Intenta de nuevo.",
        }));
        setGuardando(false);
        if (r.error) return setError(r.error);
        alGuardar();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-actual`} className={labelClass}>
          {temporal ? "Contraseña temporal" : "Contraseña actual"}
        </label>
        <PasswordInput id={`${id}-actual`} name="actual" required autoComplete="current-password" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-nueva`} className={labelClass}>
          Contraseña nueva
        </label>
        <PasswordInput id={`${id}-nueva`} name="nueva" required minLength={MIN_CONTRASENA} autoComplete="new-password" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-repetida`} className={labelClass}>
          Repite la contraseña nueva
        </label>
        <PasswordInput id={`${id}-repetida`} name="repetida" required minLength={MIN_CONTRASENA} autoComplete="new-password" />
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={guardando} className={alCancelar ? "" : "w-full"}>
          {guardando ? "Guardando…" : "Guardar contraseña"}
        </Button>
        {alCancelar && (
          <Button type="button" variant="secondary" disabled={guardando} onClick={alCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
