"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { anilloFoco } from "@/components/ui/field";
import { RUTA_DOS_PASOS, rutaDosPasosDesde } from "@/lib/seguridad/dos-pasos";

/** Hasta cuándo no se vuelve a mostrar tras «Ahora no» (en este navegador). */
const CLAVE = "aviso-dos-pasos-cerrado-hasta";
const UNA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * La invitación a activar la verificación en dos pasos (seguridad · 19 nov 2026), para quien administra Usuarios y roles mientras
 * `DOS_PASOS_ADMIN` no está prendida. «Ahora no» la esconde una semana en este navegador. Cuando la verificación sea obligatoria,
 * esta franja ya no sale: el servidor no le da los módulos hasta activarla.
 */
export function AvisoDosPasos() {
  const ruta = usePathname();
  // Arranca escondida y se decide en el navegador (lee lo guardado): así no parpadea ni cambia lo que dibujó el servidor.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hasta = 0;
    try {
      hasta = Number(localStorage.getItem(CLAVE) ?? 0);
    } catch {
      hasta = 0;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lo guardado solo se lee en el navegador
    setVisible(!(hasta > Date.now()));
  }, []);

  if (!visible || ruta === RUTA_DOS_PASOS) return null;

  function cerrar() {
    try {
      localStorage.setItem(CLAVE, String(Date.now() + UNA_SEMANA_MS));
    } catch {
      // Sin almacenamiento (modo privado): se esconde solo hasta recargar.
    }
    setVisible(false);
  }

  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-border bg-primario-suave px-4 py-2 text-sm">
      <span>
        Protege tu cuenta: activa la <strong>verificación en dos pasos</strong> con una app de códigos en tu celular.
      </span>
      <span className="flex items-center gap-2">
        <Link
          href={rutaDosPasosDesde(ruta)}
          className={`inline-flex h-8 items-center rounded-md bg-primario px-3 text-[13px] font-semibold text-white hover:opacity-90 ${anilloFoco}`}
        >
          Activar
        </Link>
        <button type="button" onClick={cerrar} className={`inline-flex h-8 items-center rounded-md px-2 text-[13px] text-muted-foreground hover:text-foreground ${anilloFoco}`}>
          Ahora no
        </button>
      </span>
    </div>
  );
}
