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
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <Image
          src="/brand/ecomfive-rojo.png"
          alt="Ecomfive"
          width={161}
          height={44}
          className="mx-auto h-8 w-auto"
        />
        <h1 className="mt-6 text-center text-lg font-semibold tracking-tight">
          Gestión de Proveeduría
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Inicia sesión con la cuenta que te invitaron.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Correo</label>
            <input type="email" name="email" required autoComplete="email" className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Contraseña</label>
            <PasswordInput name="password" required autoComplete="current-password" />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="mt-2 w-full">
            {pending ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </div>
    </main>
  );
}
