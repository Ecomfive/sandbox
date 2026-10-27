"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { CandadoIcon } from "@/lib/nav-icons";
import { confirmarActivacionTotp, desactivarTotp, iniciarActivacionTotp } from "./actions";

/**
 * La verificación en dos pasos de la propia persona (27 oct 2026): aquí se activa o se cambia la app autenticadora (Google Authenticator, Authy,
 * 1Password…). Con la verificación encendida es obligatoria: quien la quite la vuelve a activar en su próximo ingreso. Si pierde el celular, un
 * administrador le restablece la verificación (Usuarios y roles).
 */
export function SeguridadCuenta({ conTotp, segundoPasoObligatorio }: { conTotp: boolean; segundoPasoObligatorio: boolean }) {
  const { mostrarToast } = useToast();
  const [activa, setActiva] = useState(conTotp);
  const [pendiente, empezar] = useTransition();
  const [alta, setAlta] = useState<{ factorId: string; qr: string; clave: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function activar() {
    setError(null);
    empezar(async () => {
      const r = await iniciarActivacionTotp().catch(() => ({ error: "No se pudo preparar la app autenticadora." }));
      if ("error" in r) return setError(r.error);
      setAlta(r);
      setCodigo("");
    });
  }

  function confirmar() {
    if (!alta) return;
    setError(null);
    empezar(async () => {
      const r = await confirmarActivacionTotp(alta.factorId, codigo).catch(() => ({ error: "No se pudo confirmar. Inténtalo de nuevo." }));
      if ("error" in r) return setError(r.error);
      setActiva(true);
      setAlta(null);
      setCodigo("");
      mostrarToast("App autenticadora activada");
    });
  }

  function quitar() {
    setError(null);
    empezar(async () => {
      const r = await desactivarTotp(codigo).catch(() => ({ error: "No se pudo quitar. Inténtalo de nuevo." }));
      if ("error" in r) return setError(r.error);
      setActiva(false);
      setQuitando(false);
      setCodigo("");
      mostrarToast("App autenticadora quitada");
    });
  }

  const campoCodigo = (id: string) => (
    <div className="flex max-w-xs flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        Código de 6 dígitos
      </label>
      <input
        id={id}
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="123456"
        aria-invalid={error ? true : undefined}
        className={`${fieldClass} tabular-nums tracking-[0.2em]`}
      />
    </div>
  );

  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card p-5">
      <Seccion icono={CandadoIcon} titulo="App autenticadora">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={activa ? "success" : "neutral"}>{activa ? "Activada" : "Sin activar"}</Badge>
          <Badge tone={segundoPasoObligatorio ? "success" : "neutral"}>{segundoPasoObligatorio ? "Verificación en dos pasos: encendida" : "Verificación en dos pasos: apagada"}</Badge>
        </div>

        {!activa && !alta && (
          <Button type="button" onClick={activar} disabled={pendiente} className="w-fit">
            {pendiente ? "Preparando…" : "Activar la app autenticadora"}
          </Button>
        )}

        {alta && (
          <div className="flex flex-col gap-3">
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm">
              <li>Abre tu app autenticadora y agrega una cuenta nueva.</li>
              <li>Escanea este código QR, o escribe la clave a mano.</li>
              <li>Escribe aquí el código de 6 dígitos que te muestra.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              {/* El QR lo arma Supabase como una imagen SVG: se muestra como imagen, nunca como HTML. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={alta.qr} alt="Código QR para tu app autenticadora" width={160} height={160} className="h-40 w-40 rounded-md border border-border bg-white p-1" />
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">Clave para escribir a mano</span>
                <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">{alta.clave}</code>
              </div>
            </div>
            {campoCodigo("activar-codigo")}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={confirmar} disabled={pendiente || !codigo.trim()}>
                {pendiente ? "Confirmando…" : "Confirmar y activar"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAlta(null)} disabled={pendiente}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {activa && !quitando && (
          <Button type="button" variant="secondary" onClick={() => setQuitando(true)} className="w-fit">
            Quitar la app autenticadora
          </Button>
        )}
        {activa && quitando && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm">Para quitarla, escribe el código que muestra tu app ahora.</p>
            {campoCodigo("quitar-codigo")}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={quitar} disabled={pendiente || !codigo.trim()}>
                {pendiente ? "Quitando…" : "Quitar"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setQuitando(false)} disabled={pendiente}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
      </Seccion>

    </div>
  );
}
