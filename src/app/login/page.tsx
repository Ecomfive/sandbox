"use client";

import { useActionState } from "react";
import Image from "next/image";
import { iniciarSesion, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { fieldClass, labelClass } from "@/components/ui/field";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(iniciarSesion, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <Image
          src="/brand/ecomfive-rojo.png"
          alt="Ecomfive"
          width={161}
          height={44}
          className="mx-auto h-8 w-auto"
        />
        <h1 className="mt-6 text-center text-xl font-semibold tracking-tight">
          Ecomfive Business OS
        </h1>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Correo</span>
            <input type="email" name="email" required autoComplete="email" className={fieldClass} />
          </label>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className={labelClass}>Contraseña</label>
            <PasswordInput id="password" name="password" required autoComplete="current-password" />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="mt-2 w-full">
            {pending ? "Iniciando sesión…" : "Iniciar sesión"}
          </Button>
        </form>
      </div>
    </main>
  );
}
