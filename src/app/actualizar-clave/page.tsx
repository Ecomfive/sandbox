"use client";

import { useActionState, useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  actualizarClave,
  establecerSesionDesdeHash,
  verificarInvitacion,
  type ActualizarClaveState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { labelClass } from "@/components/ui/field";

const initialState: ActualizarClaveState = {};

export default function ActualizarClavePage() {
  const [state, formAction, pending] = useActionState(actualizarClave, initialState);
  const [preparando, setPreparando] = useState(true);
  const [errorHash, setErrorHash] = useState<string | null>(null);

  useEffect(() => {
    const buscar = new URLSearchParams(window.location.search);
    const tokenHash = buscar.get("token_hash");
    const type = buscar.get("type") as EmailOtpType | null;

    if (tokenHash && type) {
      verificarInvitacion(tokenHash, type)
        .then(() => {
          window.history.replaceState(null, "", window.location.pathname);
          setPreparando(false);
        })
        .catch(() => {
          setErrorHash("El link de invitación ya venció. Pide que te reenvíen la invitación.");
          setPreparando(false);
        });
      return;
    }

    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      // Ya había una sesión activa (o el usuario llegó aquí sin link de invitación).
      setPreparando(false);
      return;
    }

    establecerSesionDesdeHash(accessToken, refreshToken)
      .then(() => {
        window.history.replaceState(null, "", window.location.pathname);
        setPreparando(false);
      })
      .catch(() => {
        setErrorHash("El link de invitación ya venció. Pide que te reenvíen la invitación.");
        setPreparando(false);
      });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Elige tu contraseña</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Este será tu acceso a Ecomfive Business OS.
        </p>

        {preparando ? (
          <p className="mt-6 text-sm text-muted-foreground">Verificando invitación…</p>
        ) : errorHash ? (
          <p className="mt-6 text-sm text-destructive">{errorHash}</p>
        ) : (
          <form action={formAction} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className={labelClass}>Nueva contraseña</label>
              <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="confirmacion" className={labelClass}>Confirmar contraseña</label>
              <PasswordInput id="confirmacion" name="confirmacion" required minLength={8} autoComplete="new-password" />
            </div>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" disabled={pending} className="mt-2 w-full">
              {pending ? "Guardando…" : "Guardar y entrar"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
