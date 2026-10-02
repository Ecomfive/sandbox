"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { cerrarSesion } from "@/app/login/actions";
import { EVENTO_ABRIR_ATAJOS } from "@/components/atajos-teclado";
import { MenuDesplegable, TituloGrupoMenu, claseOpcionMenu } from "@/components/ui/menu-desplegable";
import { CheckIcon, ConfiguracionIcon } from "@/lib/nav-icons";
import { VERSION } from "@/lib/version";

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
  const mostrado = nombre ?? email;
  const inicial = mostrado.trim().charAt(0).toUpperCase();

  // El script del layout aplica el tema guardado antes de pintar; aquí se cambia y se guarda en el navegador.
  function elegirTema(tema: "light" | "dark") {
    document.documentElement.setAttribute("data-theme", tema);
    window.localStorage.setItem(CLAVE_TEMA, tema);
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
          <p className="px-3 pt-1 pb-2 text-xs text-muted-foreground">Versión {VERSION}</p>
        </>
      )}
    </MenuDesplegable>
  );
}
