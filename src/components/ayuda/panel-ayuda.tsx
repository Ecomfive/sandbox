"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { anilloFoco } from "@/components/ui/field";
import { MODULOS_CON_GUIA } from "@/lib/ayuda/guias-indice";
import { formatearFecha } from "@/lib/formato";
import { AyudaIcon, CatalogoIcon, HistorialIcon, UniversidadIcon } from "@/lib/nav-icons";
import { obtenerPanelAyuda } from "@/app/(app)/ayuda/actions";
import { BuscadorAyuda } from "./buscador-ayuda";

type Datos = Exclude<Awaited<ReturnType<typeof obtenerPanelAyuda>>, { error: string }>;

/** La guía de la página en que se está (la del módulo de ruta más larga que la contiene). */
function guiaDeRuta(pathname: string): string | null {
  const ruta = Object.keys(MODULOS_CON_GUIA)
    .filter((r) => pathname === r || (r !== "/" && pathname.startsWith(`${r}/`)))
    .sort((a, b) => b.length - a.length)[0];
  return ruta ? MODULOS_CON_GUIA[ruta] : null;
}

/**
 * El panel de ayuda que abre el botón «Ayuda» de la barra negra, sin salir de la página (como el de ClickUp): buscador, la
 * guía de esta página, tu avance en la Universidad, las novedades y accesos al Centro de ayuda.
 */
export function PanelAyuda({ pathname }: { pathname: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  useEffect(() => {
    let vigente = true;
    obtenerPanelAyuda()
      .then((r) => vigente && !("error" in r) && setDatos(r))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);
  const guia = guiaDeRuta(pathname);
  const accesos = [
    { href: "/ayuda/glosario", texto: "Glosario", Icono: CatalogoIcon },
    { href: "/ayuda/guias", texto: "Guías", Icono: AyudaIcon },
    { href: "/ayuda/universidad", texto: "Universidad", Icono: UniversidadIcon },
    { href: "/ayuda/manuales", texto: "Manuales", Icono: HistorialIcon },
  ];

  return (
    <section aria-label="Ayuda" className="flex flex-col gap-4">
      <div className="rounded-xl p-3 text-white" style={{ backgroundImage: "var(--neon)" }}>
        <p className="m-0 text-sm font-semibold">¿En qué te ayudamos?</p>
        <div className="mt-2">{datos ? <BuscadorAyuda indice={datos.indice} autoFocus /> : <p className="m-0 text-xs opacity-80">Cargando…</p>}</div>
      </div>

      {guia && (
        <Link href={`/ayuda/guias/${guia}`} className={`flex items-center gap-2 rounded-lg border border-primario/40 bg-primario-suave px-3 py-2 text-sm font-medium text-primario hover:border-primario ${anilloFoco}`}>
          <AyudaIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          Ayuda de esta página
        </Link>
      )}

      {datos && datos.total > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
          <span className="flex items-center justify-between text-xs font-semibold">
            Universidad
            <span className="font-normal text-muted-foreground tabular-nums">
              {datos.completados} de {datos.total}
            </span>
          </span>
          <span className="block h-1.5 rounded-full bg-muted">
            <span className="barra-neon block h-1.5 rounded-full" style={{ width: `${(datos.completados / datos.total) * 100}%` }} />
          </span>
          {datos.siguiente ? (
            <Link href={`/ayuda/universidad/${datos.siguiente.id}`} className={`rounded text-xs text-primario hover:underline ${anilloFoco}`}>
              Sigue con: {datos.siguiente.titulo}
            </Link>
          ) : (
            <span className="text-xs text-success">¡Completaste todos tus cursos!</span>
          )}
        </div>
      )}

      <nav aria-label="Secciones de la ayuda" className="grid grid-cols-2 gap-1.5">
        {accesos.map(({ href, texto, Icono }) => (
          <Link key={href} href={href} className={`flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-2.5 text-xs hover:bg-muted ${anilloFoco}`}>
            <Icono className="h-4 w-4 text-primario" aria-hidden="true" />
            {texto}
          </Link>
        ))}
      </nav>

      {datos && datos.novedades.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-xs font-semibold">Novedades</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {datos.novedades.map((n) => (
              <li key={n.titulo}>
                <Link href={n.href ?? "/ayuda"} className={`flex flex-col rounded-md px-2 py-1.5 hover:bg-muted ${anilloFoco}`}>
                  <span className="text-[13px] font-medium">{n.titulo}</span>
                  <span className="text-[11px] text-muted-foreground">{formatearFecha(n.fecha)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href="/ayuda" className={`boton-neon rounded-lg px-3 py-2 text-center text-sm font-medium text-white ${anilloFoco}`}>
        Abrir el Centro de ayuda
      </Link>
    </section>
  );
}
