"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cerrarSesion } from "@/app/login/actions";
import { cambiarClaveRepartidor } from "@/app/repartidor/actions";
import { PasswordInput } from "@/components/password-input";

/**
 * Elegir su clave (como en el portal del proveedor): mientras la cuenta entre con la clave temporal que le dio un administrador, el panel muestra esto
 * en lugar de la ruta. También sirve para cambiarla después («Cambiar clave»).
 */
export function ElegirClave({ temporal, nombre, alCancelar }: { temporal: boolean; nombre: string; alCancelar?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const etiqueta = "text-[13px] font-semibold text-[#3f3f46]";
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-col gap-1 bg-primario px-[18px] py-[18px] text-white">
        <span className="text-[13px] opacity-90">Hola, {nombre}</span>
        <b className="text-xl">{temporal ? "Elige tu clave" : "Cambiar clave"}</b>
      </header>
      <form
        method="post"
        className="flex flex-col gap-4 p-[18px]"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          setError(null);
          setGuardando(true);
          const r = await cambiarClaveRepartidor(String(d.get("actual") ?? ""), String(d.get("nueva") ?? ""), String(d.get("repetida") ?? ""));
          setGuardando(false);
          if (r.error) return setError(r.error);
          if (alCancelar) alCancelar();
          router.refresh();
        }}
      >
        {temporal && <p className="m-0 text-sm text-[#3f3f46]">Entraste con una clave temporal. Elige la tuya para empezar tu ruta.</p>}
        <div className="flex flex-col gap-1">
          <label htmlFor="clave-actual" className={etiqueta}>
            {temporal ? "Clave temporal" : "Clave actual"}
          </label>
          <PasswordInput id="clave-actual" name="actual" required autoComplete="current-password" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="clave-nueva" className={etiqueta}>
            Clave nueva (8 o más)
          </label>
          <PasswordInput id="clave-nueva" name="nueva" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="clave-repetida" className={etiqueta}>
            Repite la clave nueva
          </label>
          <PasswordInput id="clave-repetida" name="repetida" required minLength={8} autoComplete="new-password" />
        </div>
        {error && (
          <p role="alert" className="m-0 rounded-lg bg-[#ffe4e6] px-3 py-2 text-sm text-[#be123c]">
            {error}
          </p>
        )}
        <button type="submit" disabled={guardando} className="min-h-[52px] rounded-xl bg-primario text-base font-bold text-white disabled:opacity-60">
          {guardando ? "Guardando…" : "Guardar clave"}
        </button>
        {alCancelar ? (
          <button type="button" onClick={alCancelar} className="min-h-11 rounded-xl border border-[#e3e3e3] bg-white text-sm font-semibold text-[#3f3f46]">
            Cancelar
          </button>
        ) : (
          <button type="button" onClick={() => cerrarSesion()} className="min-h-11 text-sm font-medium text-[#636363]">
            Salir
          </button>
        )}
      </form>
    </div>
  );
}
