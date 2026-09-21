"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { almacen } from "@/components/tabla/almacen";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import {
  ESPERA_SEGUNDA_TECLA_MS,
  atajosParaIr,
  esCampoEditable,
  interpretarTecla,
} from "@/lib/atajos";
import type { PaginaBuscable } from "@/lib/paleta";

/** El buscador de la barra de arriba escucha este evento para abrirse (lo dispara el atajo «/»). */
export const EVENTO_ABRIR_BUSCADOR = "abrir-buscador-global";

const CLAVE_ATAJOS = "atajos-teclado-v1";

function TecladoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  );
}

const Tecla = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground">
    {children}
  </kbd>
);

/**
 * Atajos de teclado de una tecla: `g` y luego una letra va a una página, `/` abre el buscador y `?` muestra esta
 * lista. Nunca actúan mientras se escribe en un campo ni con una ventana abierta, y se pueden apagar (regla de
 * WCAG 2.1.4 para los atajos de un solo carácter); apagados, `?` sigue abriendo la ayuda para poder encenderlos.
 */
export function AtajosTeclado({ paginas }: { paginas: PaginaBuscable[] }) {
  const router = useRouter();
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [esperandoIr, setEsperandoIr] = useState(false);
  const esperandoRef = useRef(false);
  const idEspera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guardado = almacen(CLAVE_ATAJOS, "local");
  const valorGuardado = useSyncExternalStore(guardado.suscribir, guardado.leer, () => "");
  const activados = valorGuardado !== "apagados";

  const atajos = useMemo(() => atajosParaIr(paginas.map((p) => p.href)), [paginas]);

  function esperar(valor: boolean) {
    esperandoRef.current = valor;
    setEsperandoIr(valor);
    if (idEspera.current) clearTimeout(idEspera.current);
    idEspera.current = valor ? setTimeout(() => esperar(false), ESPERA_SEGUNDA_TECLA_MS) : null;
  }

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      // Con una ventana abierta (esta ayuda, un formulario de retiro) las teclas son de la ventana.
      const ventanaAbierta = document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
      const accion = interpretarTecla(
        {
          key: e.key,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          enCampoEditable: esCampoEditable(e.target as HTMLElement | null) || ventanaAbierta,
          yaAtendida: e.defaultPrevented || e.repeat,
        },
        esperandoRef.current,
        atajos,
        activados
      );
      switch (accion.tipo) {
        case "esperar-ir":
          esperar(true);
          break;
        case "cancelar-ir":
          esperar(false);
          break;
        case "ir":
          e.preventDefault();
          esperar(false);
          router.push(accion.href);
          break;
        case "buscar":
          e.preventDefault();
          document.dispatchEvent(new CustomEvent(EVENTO_ABRIR_BUSCADOR));
          break;
        case "ayuda":
          e.preventDefault();
          esperar(false);
          setAyudaAbierta(true);
          break;
      }
    }
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      if (idEspera.current) clearTimeout(idEspera.current);
    };
    // `esperar` solo toca refs y el estado: no hace falta volver a montar el oyente por ella.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atajos, activados, router]);

  return (
    <>
      <Tooltip texto="Atajos de teclado">
        <button
          type="button"
          onClick={() => setAyudaAbierta(true)}
          aria-label="Atajos de teclado"
          aria-keyshortcuts="Shift+/"
          className={`hidden shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex ${anilloFoco}`}
        >
          <TecladoIcon className="h-4 w-4" />
        </button>
      </Tooltip>

      {/* Mientras se espera la segunda tecla: lo que se puede pulsar (y lo anuncia a los lectores de pantalla). */}
      <p
        role="status"
        className={
          esperandoIr
            ? "pointer-events-none fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg"
            : "sr-only"
        }
      >
        {esperandoIr && (
          <>
            <Tecla>g</Tecla> y luego{" "}
            {atajos.map((a, i) => (
              <span key={a.tecla}>
                {i > 0 && ", "}
                <Tecla>{a.tecla}</Tecla> {a.etiqueta}
              </span>
            ))}
          </>
        )}
      </p>

      <Ventana abierto={ayudaAbierta} alCerrar={() => setAyudaAbierta(false)} titulo="Atajos de teclado" ancho="md">
        <div className="flex flex-col gap-4 p-4 text-sm">
          <ul className="flex flex-col gap-1.5">
            <li className="flex items-center justify-between gap-3">
              <span>Buscar o ir a una página</span>
              <span className="flex items-center gap-1">
                <Tecla>Ctrl K</Tecla> o <Tecla>/</Tecla>
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Mostrar esta ayuda</span>
              <Tecla>?</Tecla>
            </li>
          </ul>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">
              Ir a una página: pulsa <Tecla>g</Tecla> y luego una letra
            </h3>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {atajos.map((a) => (
                <li key={a.tecla} className="flex items-center justify-between gap-3">
                  <span>{a.etiqueta}</span>
                  <Tecla>{a.tecla}</Tecla>
                </li>
              ))}
            </ul>
          </div>

          <label className="flex items-start gap-2 border-t border-border pt-3">
            <input
              type="checkbox"
              checked={activados}
              onChange={(e) => guardado.guardar(e.target.checked ? "" : "apagados")}
              className="mt-0.5 h-4 w-4 accent-foreground"
            />
            <span>
              Usar los atajos de una tecla
              <span className="block text-xs text-muted-foreground">
                Si los apagas, solo <Tecla>?</Tecla> y Ctrl K siguen funcionando. Nunca actúan mientras escribes en un
                campo.
              </span>
            </span>
          </label>
        </div>
      </Ventana>
    </>
  );
}
