"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { anilloFoco } from "@/components/ui/field";
import { linkClass } from "@/components/ui/link";
import { Tooltip } from "@/components/ui/tooltip";
import type { AccesoSeccion, PersonaConAcceso } from "@/lib/acceso-seccion";
import { obtenerAccesoSeccion } from "@/lib/compartir-actions";
import { CerrarIcon, CompartirIcon } from "@/lib/nav-icons";

type Estado =
  | { tipo: "cerrado" }
  | { tipo: "cargando" }
  | { tipo: "error" }
  | { tipo: "listo"; acceso: AccesoSeccion };

function Avatar({ persona }: { persona: PersonaConAcceso }) {
  const inicial = (persona.nombre || persona.email).trim().charAt(0).toUpperCase();
  return persona.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={persona.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
    >
      {inicial}
    </span>
  );
}

/**
 * "Compartir" de la franja de migas: muestra quién tiene acceso a la sección actual (lo da el rol de cada
 * persona), con atajo a Usuarios y roles para dar más acceso y botón para copiar el vínculo. Solo consulta
 * al abrirse, así que no suma trabajo a cada página. `cargar` solo se cambia en pruebas visuales.
 */
export function BotonCompartir({
  moduloHref,
  moduloEtiqueta,
  cargar = obtenerAccesoSeccion,
}: {
  moduloHref: string;
  moduloEtiqueta: string;
  cargar?: (moduloHref: string) => Promise<AccesoSeccion>;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cerrado" });
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const consulta = useRef(0);
  const abierto = estado.tipo !== "cerrado";

  function cerrar() {
    consulta.current++;
    setEstado({ tipo: "cerrado" });
    setCopiado(null);
  }

  function consultar() {
    const numero = ++consulta.current;
    setEstado({ tipo: "cargando" });
    cargar(moduloHref)
      .then((acceso) => {
        if (numero === consulta.current) setEstado({ tipo: "listo", acceso });
      })
      .catch(() => {
        if (numero === consulta.current) setEstado({ tipo: "error" });
      });
  }

  function alternar() {
    if (abierto) cerrar();
    else consultar();
  }

  // Al abrir, el foco entra al panel; Escape o pulsar fuera lo cierran (Escape devuelve el foco al botón).
  useEffect(() => {
    if (!abierto) return;
    panelRef.current?.focus();
    function alPulsar(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) cerrar();
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      cerrar();
      botonRef.current?.focus();
    }
    document.addEventListener("mousedown", alPulsar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alPulsar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  async function copiarVinculo() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
    setTimeout(() => setCopiado(null), 3000);
  }

  const acceso = estado.tipo === "listo" ? estado.acceso : null;

  return (
    <div ref={contenedorRef} className="relative">
      <Tooltip texto="Ver quién tiene acceso">
        <button
          ref={botonRef}
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          aria-haspopup="dialog"
          className={`inline-flex h-8 items-center gap-1.5 !rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors max-sm:w-8 max-sm:justify-center max-sm:px-0 ${anilloFoco} ${
            abierto ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
          }`}
        >
          <CompartirIcon className="h-4 w-4 shrink-0" />
          <span className="max-sm:sr-only">Compartir</span>
        </button>
      </Tooltip>

      {abierto && (
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby="titulo-compartir"
          tabIndex={-1}
          className="absolute right-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-card text-sm text-foreground shadow-xl focus:outline-none"
        >
          <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
            <div className="min-w-0">
              <h2 id="titulo-compartir" className="text-sm font-semibold">
                Acceso a esta sección
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{moduloEtiqueta}</span>. El acceso se da por rol.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                cerrar();
                botonRef.current?.focus();
              }}
              aria-label="Cerrar"
              className={`shrink-0 p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
            >
              <CerrarIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 pb-3" aria-live="polite" aria-busy={estado.tipo === "cargando"}>
            {estado.tipo === "cargando" && <p className="py-3 text-xs text-muted-foreground">Cargando personas...</p>}

            {estado.tipo === "error" && (
              <div className="py-3">
                <p className="text-xs text-destructive">No se pudo cargar quién tiene acceso.</p>
                <button type="button" onClick={consultar} className={`mt-1 text-xs underline hover:text-foreground ${anilloFoco}`}>
                  Reintentar
                </button>
              </div>
            )}

            {acceso && (
              <>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  Personas con acceso · <span className="tabular-nums">{acceso.personas.length}</span>
                </p>
                {acceso.personas.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">Nadie tiene acceso todavía.</p>
                ) : (
                  <ul className="max-h-64 overflow-y-auto">
                    {acceso.personas.map((persona) => (
                      <li key={persona.id} className="flex items-center gap-2.5 py-1.5">
                        <Avatar persona={persona} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium break-words">
                            {persona.nombre || persona.email}
                            {persona.id === acceso.yoId && <span className="font-normal text-muted-foreground"> (tú)</span>}
                          </span>
                          {persona.nombre && (
                            <span className="block text-xs break-all text-muted-foreground">{persona.email}</span>
                          )}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Badge>{persona.rol}</Badge>
                          {persona.soloLectura && <Badge tone="warning">Solo lectura</Badge>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border px-4 py-3">
            <Button type="button" variant="secondary" onClick={copiarVinculo} className="min-h-8 px-3 py-1 text-xs">
              Copiar vínculo
            </Button>
            {acceso &&
              (acceso.puedeAdministrar ? (
                <Link href="/usuarios" className={`text-xs ${linkClass}`}>
                  Administrar permisos
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">Para dar acceso, pide a un administrador.</span>
              ))}
          </div>
          <p role="status" className="sr-only">
            {copiado === "si" ? "Vínculo copiado" : copiado === "no" ? "No se pudo copiar el vínculo" : ""}
          </p>
          {copiado && (
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground" aria-hidden="true">
              {copiado === "si" ? "Vínculo copiado. Solo entra quien ya tiene acceso." : "No se pudo copiar el vínculo."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
