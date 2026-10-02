"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { cerrarSesion } from "@/app/login/actions";
import { EVENTO_ABRIR_ATAJOS } from "@/components/atajos-teclado";
import { MenuDesplegable, TituloGrupoMenu, claseOpcionMenu } from "@/components/ui/menu-desplegable";
import { CheckIcon, ConfiguracionIcon } from "@/lib/nav-icons";
import { subirAvatar } from "@/lib/perfil-actions";
import { CAMBIOS_RECIENTES, VERSION } from "@/lib/version";

const CLAVE_TEMA = "tema";

/** Si el tema en uso es el oscuro: se lee de `data-theme` en `<html>` y se actualiza cuando cambia (aquí o en el menú lateral). */
function suscribirTema(avisar: () => void) {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observador.disconnect();
}
const leerTemaOscuro = () => document.documentElement.dataset.theme === "dark";

/** Menú de la persona (la foto de la esquina): quién es, el tema, los atajos, la configuración, la versión y salir. */
export function MenuCuenta({
  nombre,
  email,
  rol,
  avatarUrl,
  puedeConfigurar,
}: {
  nombre: string | null;
  email: string;
  rol: string | null;
  avatarUrl: string | null;
  puedeConfigurar: boolean;
}) {
  const oscuro = useSyncExternalStore(suscribirTema, leerTemaOscuro, () => false);
  const [verNovedades, setVerNovedades] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, iniciarSubida] = useTransition();
  const entradaFoto = useRef<HTMLInputElement>(null);
  const mostrado = nombre ?? email;
  const inicial = mostrado.trim().charAt(0).toUpperCase();

  // El script del layout aplica el tema guardado antes de pintar; aquí se cambia y se guarda en el navegador.
  function elegirTema(tema: "light" | "dark") {
    document.documentElement.setAttribute("data-theme", tema);
    window.localStorage.setItem(CLAVE_TEMA, tema);
  }

  function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    const datos = new FormData();
    datos.set("avatar", archivo);
    iniciarSubida(async () => {
      try {
        await subirAvatar(datos);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
      }
    });
  }

  return (
    <MenuDesplegable
      etiqueta={`Menú de ${mostrado}`}
      claseBoton="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border-control bg-muted text-sm font-medium text-muted-foreground hover:opacity-90"
      contenidoBoton={
        avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          inicial
        )
      }
      claseMenu="w-64"
    >
      {(cerrar) => (
        <>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{mostrado}</p>
            <p className="truncate text-xs text-muted-foreground">{[rol, nombre ? email : null].filter(Boolean).join(" · ")}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={subiendo}
            onClick={() => entradaFoto.current?.click()}
            className={claseOpcionMenu}
          >
            {subiendo ? "Subiendo foto…" : "Cambiar foto de perfil"}
          </button>
          {error && <p className="px-3 pb-1 text-xs text-destructive">{error}</p>}
          <input ref={entradaFoto} type="file" accept="image/*" className="hidden" onChange={alElegirFoto} tabIndex={-1} aria-hidden="true" />
          <div role="separator" className="my-1 border-t border-border" />
          <TituloGrupoMenu>Tema</TituloGrupoMenu>
          {(
            [
              ["light", "Claro"],
              ["dark", "Oscuro"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              role="menuitemradio"
              aria-checked={(valor === "dark") === oscuro}
              onClick={() => elegirTema(valor)}
              className={claseOpcionMenu}
            >
              <span className={(valor === "dark") === oscuro ? "font-semibold" : ""}>{etiqueta}</span>
              {(valor === "dark") === oscuro && <CheckIcon className="ml-auto h-4 w-4 text-success" />}
            </button>
          ))}
          <div role="separator" className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              cerrar();
              document.dispatchEvent(new CustomEvent(EVENTO_ABRIR_ATAJOS));
            }}
            className={claseOpcionMenu}
          >
            Atajos de teclado
            <kbd className="ml-auto rounded border border-border bg-muted px-1.5 text-xs text-muted-foreground">?</kbd>
          </button>
          {puedeConfigurar && (
            <Link href="/configuracion" role="menuitem" onClick={() => cerrar()} className={claseOpcionMenu}>
              <ConfiguracionIcon className="h-4 w-4 text-muted-foreground" />
              Configuración
            </Link>
          )}
          <div role="separator" className="my-1 border-t border-border" />
          <form action={cerrarSesion}>
            <button type="submit" role="menuitem" className={`${claseOpcionMenu} text-destructive`}>
              Cerrar sesión
            </button>
          </form>
          <button
            type="button"
            role="menuitem"
            aria-expanded={verNovedades}
            onClick={() => setVerNovedades((v) => !v)}
            className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted focus:bg-muted focus:outline-none"
          >
            Versión {VERSION}
            <span aria-hidden="true">{verNovedades ? "−" : "+"}</span>
          </button>
          {verNovedades && (
            <ul className="mb-1 list-disc px-3 pt-1 pb-2 pl-7 text-xs text-muted-foreground">
              {CAMBIOS_RECIENTES.map((cambio) => (
                <li key={cambio} className="py-0.5">
                  {cambio}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </MenuDesplegable>
  );
}
