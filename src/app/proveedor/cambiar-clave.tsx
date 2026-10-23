"use client";

import { useState } from "react";
import { cerrarSesion } from "@/app/login/actions";
import { PasswordInput } from "@/components/password-input";
import { IdiomaProveedor, useIdioma } from "@/components/proveedor/idioma-contexto";
import { botonNormal, botonPrincipal } from "@/components/proveedor/piezas-proveedor";
import { labelClass } from "@/components/ui/field";
import { errorEn, type Idioma } from "@/lib/proveedor/textos";
import { cambiarClaveProveedor } from "./actions";

/**
 * El formulario para que la cuenta del proveedor cambie su clave: la actual (o la temporal), la nueva y otra vez la nueva. Sale en
 * «Cambiar clave» de la cabecera del portal y, mientras la cuenta tenga una clave temporal, en lugar del portal (`ElegirClave`).
 */
export function FormularioClave({ temporal, alGuardar, alCancelar }: { temporal: boolean; alGuardar: () => void; alCancelar?: () => void }) {
  const { t, idioma } = useIdioma();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        setError(null);
        setGuardando(true);
        const r = await cambiarClaveProveedor(String(datos.get("actual") ?? ""), String(datos.get("nueva") ?? ""), String(datos.get("repetida") ?? ""));
        setGuardando(false);
        if (r.error) return setError(errorEn(r.error, idioma));
        alGuardar();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="clave-actual" className={labelClass}>
          {temporal ? t.claveTemporal : t.claveActual}
        </label>
        <PasswordInput id="clave-actual" name="actual" required autoComplete="current-password" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="clave-nueva" className={labelClass}>
          {t.claveNueva}
        </label>
        <PasswordInput id="clave-nueva" name="nueva" required minLength={8} autoComplete="new-password" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="clave-repetida" className={labelClass}>
          {t.claveRepetir}
        </label>
        <PasswordInput id="clave-repetida" name="repetida" required minLength={8} autoComplete="new-password" />
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={botonPrincipal} disabled={guardando}>
          {guardando ? t.guardandoClave : t.guardarClave}
        </button>
        {alCancelar && (
          <button type="button" className={botonNormal} disabled={guardando} onClick={alCancelar}>
            {t.cancelar}
          </button>
        )}
      </div>
    </form>
  );
}

/** La pantalla que ve la cuenta mientras entra con la clave temporal: elige la suya y pasa a su portal. */
export function ElegirClave({ idioma, nombre }: { idioma: Idioma; nombre: string }) {
  return (
    <IdiomaProveedor idioma={idioma} traducciones={{}}>
      <ElegirClaveContenido nombre={nombre} />
    </IdiomaProveedor>
  );
}

function ElegirClaveContenido({ nombre }: { nombre: string }) {
  const { t, idioma } = useIdioma();
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10" lang={idioma === "zh" ? "zh-CN" : "es"}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <p className="m-0 text-[13px] text-muted-foreground">{t.marca}</p>
        <h1 className="mt-1 mb-0 text-xl font-semibold tracking-tight">{t.elegirClave}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          {nombre} · {t.elegirClaveTexto}
        </p>
        <FormularioClave temporal alGuardar={() => window.location.reload()} />
        <form action={cerrarSesion} className="mt-4">
          <button type="submit" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            {t.salir}
          </button>
        </form>
      </div>
    </main>
  );
}
