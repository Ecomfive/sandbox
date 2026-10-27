"use client";

import { useActionState, useState, useTransition } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { cerrarSesion } from "../actions";
import { pedirCodigoPorCorreo, verificarSegundoPaso, type VerificarEstado } from "./actions";

const inicial: VerificarEstado = {};

/**
 * El segundo paso del ingreso (27 oct 2026): el código de 6 dígitos de la app autenticadora (si la persona la activó) o el que llegó por
 * correo. Quien tiene app puede pedir el del correo si no la tiene a la mano; quien no, recibe el del correo al poner la contraseña.
 */
export function VerificarFormulario({ correo, conTotp }: { correo: string; conTotp: boolean }) {
  const [modo, setModo] = useState<"totp" | "correo">(conTotp ? "totp" : "correo");
  const [estado, accion, enviando] = useActionState(verificarSegundoPaso, inicial);
  const [pidiendo, pedir] = useTransition();
  const [mensaje, setMensaje] = useState<{ error?: string; aviso?: string } | null>(null);
  // Si el servidor dice que ese método ya no vale (borró la app), pasa al del correo.
  const modoActual = estado.modo ?? modo;
  const mostrado = mensaje ?? (estado.error ? { error: estado.error } : null);

  function pedirPorCorreo() {
    pedir(async () => {
      const r = await pedirCodigoPorCorreo().catch(() => ({ error: "No se pudo pedir el código. Inténtalo de nuevo." }) as VerificarEstado);
      setMensaje({ error: r.error, aviso: r.aviso });
      if (!r.error) setModo("correo");
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <Image src="/brand/ecomfive-rojo.png" alt="Ecomfive" width={161} height={44} className="mx-auto h-8 w-auto" />
        <h1 className="mt-6 text-center text-xl font-semibold tracking-tight">Verificación en dos pasos</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {modoActual === "totp" ? "Escribe el código de 6 dígitos de tu app autenticadora." : `Escribe el código de 6 dígitos que enviamos a ${correo}.`}
        </p>

        <form action={accion} className="mt-6 flex flex-col gap-4" onSubmit={() => setMensaje(null)}>
          <input type="hidden" name="modo" value={modoActual} />
          <div className="flex flex-col gap-1">
            <label htmlFor="codigo-segundo-paso" className={labelClass}>
              Código
            </label>
            <input
              id="codigo-segundo-paso"
              name="codigo"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              placeholder="123456"
              aria-invalid={mostrado?.error ? true : undefined}
              className={`${fieldClass} text-center text-lg tracking-[0.3em] tabular-nums`}
            />
          </div>
          {mostrado?.error && (
            <p role="alert" className="text-sm text-destructive">
              {mostrado.error}
            </p>
          )}
          {mostrado?.aviso && (
            <p role="status" className="text-sm text-muted-foreground">
              {mostrado.aviso}
            </p>
          )}
          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? "Verificando…" : "Verificar"}
          </Button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-sm">
          {modoActual === "totp" ? (
            <button type="button" onClick={pedirPorCorreo} disabled={pidiendo} className={`rounded font-medium text-primario hover:underline disabled:opacity-60 ${anilloFoco}`}>
              {pidiendo ? "Enviando…" : "No tengo mi app: recibir el código por correo"}
            </button>
          ) : (
            <>
              <button type="button" onClick={pedirPorCorreo} disabled={pidiendo} className={`rounded font-medium text-primario hover:underline disabled:opacity-60 ${anilloFoco}`}>
                {pidiendo ? "Enviando…" : "Enviarme otro código"}
              </button>
              {conTotp && (
                <button
                  type="button"
                  onClick={() => {
                    setMensaje(null);
                    setModo("totp");
                  }}
                  className={`rounded font-medium text-primario hover:underline ${anilloFoco}`}
                >
                  Usar mi app autenticadora
                </button>
              )}
            </>
          )}
          <form action={cerrarSesion}>
            <button type="submit" className={`rounded text-muted-foreground hover:underline ${anilloFoco}`}>
              Entrar con otra cuenta
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
