"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { claveEnGrupos } from "@/lib/seguridad/dos-pasos";
import { confirmarActivacion, empezarActivacion, verificarCodigo, type Activacion } from "./actions";

const FALLO = "No se pudo comprobar. Intenta de nuevo.";

/** El campo de los 6 números: teclado numérico en el celular, se puede pegar y el administrador de claves lo puede llenar. */
function CampoCodigo({ id, deshabilitado }: { id: string; deshabilitado: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        Código de 6 números
      </label>
      <input
        id={id}
        name="codigo"
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 \-]*"
        maxLength={8}
        disabled={deshabilitado}
        className={`${fieldClass} text-center font-mono text-lg tracking-[0.3em]`}
      />
    </div>
  );
}

/** Al terminar: a la página a la que iba (el servidor ya la ve con la sesión nueva). */
function useSeguir(destino: string) {
  const router = useRouter();
  return () => {
    router.replace(destino);
    router.refresh();
  };
}

/** Escribir el código al entrar, con la verificación ya activa. */
export function CodigoDosPasos({ destino }: { destino: string }) {
  const id = useId();
  const seguir = useSeguir(destino);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <form
      method="post"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "");
        setError(null);
        setEnviando(true);
        const r = await verificarCodigo(codigo).catch(() => ({ error: FALLO }));
        setEnviando(false);
        if (r.error) return setError(r.error);
        seguir();
      }}
    >
      <CampoCodigo id={`${id}-codigo`} deshabilitado={enviando} />
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Comprobando…" : "Entrar"}
      </Button>
      <p className="m-0 text-center text-xs text-muted-foreground">¿Perdiste el celular? Pide a quien administra Usuarios y roles que te quite la verificación.</p>
    </form>
  );
}

/** Activar la verificación: instalar la app, leer el QR (o escribir la clave) y confirmar con el primer código. */
export function ActivarDosPasos({ destino, opcional }: { destino: string; opcional: boolean }) {
  const id = useId();
  const seguir = useSeguir(destino);
  const [activacion, setActivacion] = useState<Activacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function empezar() {
    setError(null);
    setCargando(true);
    const r = await empezarActivacion().catch(() => ({ error: "No se pudo empezar. Intenta de nuevo." }) as Activacion);
    setCargando(false);
    if (r.error) return setError(r.error);
    setActivacion(r);
  }

  const ahoraNo = opcional && (
    <Link href={destino} className={`block text-center text-sm text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`}>
      Ahora no
    </Link>
  );

  if (!activacion?.factorId) {
    return (
      <div className="flex flex-col gap-4">
        <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
          <li>Instala en tu celular una app de códigos, por ejemplo Google Authenticator o Microsoft Authenticator.</li>
          <li>Toca «Mostrar el código QR» y léelo con la app.</li>
          <li>Escribe aquí los 6 números que te muestra la app.</li>
        </ol>
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="button" onClick={empezar} disabled={cargando} className="w-full">
          {cargando ? "Preparando…" : "Mostrar el código QR"}
        </Button>
        {ahoraNo}
      </div>
    );
  }

  const factorId = activacion.factorId;
  return (
    <form
      method="post"
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "");
        setError(null);
        setCargando(true);
        const r = await confirmarActivacion(factorId, codigo).catch(() => ({ error: FALLO }));
        setCargando(false);
        if (r.error) return setError(r.error);
        seguir();
      }}
    >
      {activacion.qr && (
        // El QR viene de Supabase como imagen SVG en base64: dentro de un <img> no ejecuta nada.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={activacion.qr} alt="Código QR para la app de códigos" width={180} height={180} className="mx-auto h-[180px] w-[180px] rounded-lg bg-white p-2" />
      )}
      {activacion.enlace && (
        <a href={activacion.enlace} className={`text-center text-sm font-medium text-primario underline-offset-2 hover:underline ${anilloFoco}`}>
          ¿Estás en el celular? Abrir la app de códigos
        </a>
      )}
      {activacion.clave && (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-3">
          <p className="m-0 text-xs text-muted-foreground">Si no puedes leer el QR, escribe esta clave en la app:</p>
          <p className="m-0 font-mono text-sm font-semibold break-all select-all">{claveEnGrupos(activacion.clave)}</p>
        </div>
      )}
      <CampoCodigo id={`${id}-codigo`} deshabilitado={cargando} />
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={cargando} className="w-full">
        {cargando ? "Comprobando…" : "Activar y entrar"}
      </Button>
      {ahoraNo}
    </form>
  );
}
