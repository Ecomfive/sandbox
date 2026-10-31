"use client";

import { useActionState, useState, useTransition } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { cerrarSesion } from "../actions";
import { confirmarActivacionObligatoria, iniciarActivacionObligatoria, verificarSegundoPaso, type VerificarEstado } from "./actions";

const inicial: VerificarEstado = {};

function Marco({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <Image src="/brand/ecomfive-rojo.png" alt="Ecomfive" width={161} height={44} className="mx-auto h-8 w-auto" />
        <h1 className="mt-6 text-center text-xl font-semibold tracking-tight">{titulo}</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">{subtitulo}</p>
        {children}
        <form action={cerrarSesion} className="mt-4 text-center">
          <button type="submit" className={`rounded text-sm text-muted-foreground hover:underline ${anilloFoco}`}>
            Entrar con otra cuenta
          </button>
        </form>
      </div>
    </main>
  );
}

function CampoCodigo({ error }: { error?: string }) {
  return (
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
        aria-invalid={error ? true : undefined}
        className={`${fieldClass} text-center text-lg tracking-[0.3em] tabular-nums`}
      />
    </div>
  );
}

/** Quien ya tiene la app autenticadora: pone el código de 6 dígitos que muestra. */
function PonerCodigo() {
  const [estado, accion, enviando] = useActionState(verificarSegundoPaso, inicial);
  return (
    <Marco titulo="Verificación en dos pasos" subtitulo="Escribe el código de 6 dígitos de tu app autenticadora.">
      <form action={accion} className="mt-6 flex flex-col gap-4">
        <CampoCodigo error={estado.error} />
        {estado.error && (
          <p role="alert" className="text-sm text-destructive">
            {estado.error}
          </p>
        )}
        <Button type="submit" disabled={enviando} className="w-full">
          {enviando ? "Verificando…" : "Verificar"}
        </Button>
      </form>
    </Marco>
  );
}

/** Quien todavía no la tiene: la activa aquí mismo (es obligatoria) y entra con su primer código. */
function ActivarApp() {
  const [alta, setAlta] = useState<{ factorId: string; qr: string; clave: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function empezarAlta() {
    setError(null);
    empezar(async () => {
      const r = await iniciarActivacionObligatoria().catch(() => ({ error: "No se pudo preparar la app autenticadora." }));
      if ("error" in r) setError(r.error);
      else setAlta(r);
    });
  }

  function confirmar(formData: FormData) {
    if (!alta) return;
    setError(null);
    empezar(async () => {
      // Con el código bueno la acción redirige al sistema; solo vuelve si hubo un error.
      const r = await confirmarActivacionObligatoria(alta.factorId, String(formData.get("codigo") ?? "")).catch(() => ({ error: "No se pudo confirmar. Inténtalo de nuevo." }));
      if (r?.error) setError(r.error);
    });
  }

  return (
    <Marco titulo="Activa tu verificación en dos pasos" subtitulo="Para entrar necesitas una app autenticadora en tu celular (Google Authenticator, Authy o 1Password).">
      {!alta ? (
        <div className="mt-6 flex flex-col gap-3">
          <Button type="button" onClick={empezarAlta} disabled={pendiente} className="w-full">
            {pendiente ? "Preparando…" : "Empezar"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>Abre tu app y agrega una cuenta nueva.</li>
            <li>Escanea este código QR, o escribe la clave a mano.</li>
            <li>Escribe el código de 6 dígitos que te muestra.</li>
          </ol>
          <div className="flex flex-col items-center gap-2">
            {/* El QR lo arma Supabase como una imagen SVG: se muestra como imagen, nunca como HTML. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={alta.qr} alt="Código QR para tu app autenticadora" width={176} height={176} className="h-44 w-44 rounded-md border border-border bg-white p-1" />
            <span className="text-xs text-muted-foreground">Clave para escribir a mano</span>
            <code className="max-w-full break-all rounded bg-muted px-2 py-1 text-center font-mono text-xs select-all">{alta.clave}</code>
          </div>
          <form action={confirmar} className="flex flex-col gap-4">
            <CampoCodigo error={error ?? undefined} />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pendiente} className="w-full">
              {pendiente ? "Confirmando…" : "Confirmar y entrar"}
            </Button>
          </form>
        </div>
      )}
    </Marco>
  );
}

/** El segundo paso del ingreso (27 oct 2026): el código de la app autenticadora; quien no la tiene la activa primero. */
export function VerificarFormulario({ conTotp }: { conTotp: boolean }) {
  return conTotp ? <PonerCodigo /> : <ActivarApp />;
}
