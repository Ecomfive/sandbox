"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cerrarSesion } from "@/app/login/actions";
import { subirAvatar } from "@/lib/perfil-actions";
import { VERSION, CAMBIOS_RECIENTES } from "@/lib/version";
import type { UsuarioActual } from "@/lib/auth";
import { ConfiguracionIcon } from "@/lib/nav-icons";

function LogoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path
        d="M4 8a1 1 0 0 1 1-1h2.17a1 1 0 0 0 .83-.45l.6-.9A1 1 0 0 1 9.43 5h5.14a1 1 0 0 1 .83.45l.6.9a1 1 0 0 0 .83.45H19a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function ChevronUpDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Agrupa foto, nombre, cerrar sesión y la versión de la plataforma en un solo menú desplegable. */
export function CuentaMenu({ usuario, expanded }: { usuario: UsuarioActual; expanded: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [verCambios, setVerCambios] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setVerCambios(false);
      }
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  function onChangeAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    const formData = new FormData();
    formData.set("avatar", archivo);
    startTransition(async () => {
      try {
        await subirAvatar(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
      }
    });
  }

  const iniciales = (usuario.nombre || usuario.email).trim().charAt(0).toUpperCase();
  const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors";

  return (
    <div ref={contenedorRef} className="relative border-t border-border p-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title={!expanded ? `${usuario.nombre ?? usuario.email}${usuario.rolNombre ? ` · ${usuario.rolNombre}` : ""}` : undefined}
        className={`flex w-full items-center gap-2.5 rounded-md p-1.5 hover:bg-muted transition-colors ${expanded ? "" : "justify-center"}`}
      >
        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
          {usuario.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={usuario.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
              {iniciales}
            </span>
          )}
        </span>
        {expanded && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {usuario.nombre ?? usuario.email}
              </span>
              {usuario.rolNombre && (
                <span className="block truncate text-xs text-muted-foreground">{usuario.rolNombre}</span>
              )}
            </span>
            <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      {abierto && (
        <div className="absolute bottom-full left-2 z-30 mb-1 w-56 rounded-xl border border-border bg-card p-1 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">{usuario.nombre ?? usuario.email}</p>
            <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
          </div>
          <div className="my-1 border-t border-border" />

          <button type="button" onClick={() => inputRef.current?.click()} disabled={pending} className={itemClass}>
            <CameraIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            Cambiar foto de perfil
          </button>
          {error && <p className="px-3 pb-1 text-xs text-destructive">{error}</p>}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChangeAvatar} />

          {usuario.modulos.includes("configuracion") && (
            <Link href="/configuracion" className={itemClass} onClick={() => setAbierto(false)}>
              <ConfiguracionIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              Configuración
            </Link>
          )}

          <form action={cerrarSesion}>
            <button type="submit" className={itemClass}>
              <LogoutIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              Cerrar sesión
            </button>
          </form>

          <div className="my-1 border-t border-border" />

          <button
            type="button"
            onClick={() => setVerCambios((v) => !v)}
            className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted transition-colors"
          >
            <span>Versión {VERSION}</span>
            <ChevronUpDownIcon className="h-3.5 w-3.5" />
          </button>
          {verCambios && (
            <ul className="mb-1 list-disc px-3 pt-1 pb-2 pl-7 text-xs text-muted-foreground">
              {CAMBIOS_RECIENTES.map((cambio) => (
                <li key={cambio} className="py-0.5">
                  {cambio}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
