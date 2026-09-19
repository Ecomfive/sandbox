"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cerrarSesion } from "@/app/login/actions";
import { subirAvatar } from "@/lib/perfil-actions";
import { VERSION, CAMBIOS_RECIENTES } from "@/lib/version";
import type { UsuarioActual } from "@/lib/auth";
import { ConfiguracionIcon } from "@/lib/nav-icons";
import { ThemeToggle } from "@/components/theme-toggle";

function LogoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
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

const itemClass =
  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors";

/** Pie fijo del menú: configuración, tarjeta de usuario, tema, versión y cerrar sesión —
 * siempre visible (no un desplegable), como en la app de referencia. */
export function CuentaFooter({ usuario, expanded }: { usuario: UsuarioActual; expanded: boolean }) {
  const [verCambios, setVerCambios] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="flex flex-col gap-1 border-t border-border p-2">
      {usuario.modulos.includes("configuracion") && (
        <Link
          href="/configuracion"
          title={!expanded ? "Configuración" : undefined}
          className={expanded ? itemClass : "flex w-full items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"}
        >
          <ConfiguracionIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {expanded && "Configuración"}
        </Link>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        title={!expanded ? `${usuario.nombre ?? usuario.email}${usuario.rolNombre ? ` · ${usuario.rolNombre}` : ""}` : "Cambiar foto de perfil"}
        className={`flex w-full items-center gap-2.5 rounded-md p-1.5 hover:bg-muted transition-colors disabled:opacity-50 ${expanded ? "" : "justify-center"}`}
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
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium text-foreground">
              {usuario.nombre ?? usuario.email}
            </span>
            {usuario.rolNombre && (
              <span className="block truncate text-xs text-muted-foreground">{usuario.rolNombre}</span>
            )}
          </span>
        )}
      </button>
      {error && <p className="px-3 text-xs text-destructive">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChangeAvatar} />

      <ThemeToggle expanded={expanded} />

      {expanded ? (
        <>
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
          <form action={cerrarSesion}>
            <button type="submit" className={itemClass}>
              <LogoutIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              Cerrar sesión
            </button>
          </form>
        </>
      ) : (
        <form action={cerrarSesion}>
          <button
            type="submit"
            title="Cerrar sesión"
            className="flex w-full items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogoutIcon className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}
