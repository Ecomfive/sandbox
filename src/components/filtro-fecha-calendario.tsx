"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PRESETS_FECHA_ESTANDAR } from "@/components/filtro-fechas";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, ChevronRightIcon } from "@/lib/nav-icons";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];
const ANCHO_PANEL = 288;
const ES_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const aIso = (anio: number, mes: number, dia: number) =>
  `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

interface MesVisible {
  anio: number;
  mes: number;
}

/**
 * Botón con ícono de calendario que abre un panel con atajos de periodo y un
 * calendario para elegir un rango. Usa los mismos parámetros de URL que
 * FiltroFechas (preset | desde+hasta), así que la página lee el filtro igual.
 * El panel se dibuja en document.body para que el overflow de la tabla no lo recorte.
 */
export function FiltroFechaCalendario() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const desdeUrl = searchParams.get("desde");
  const hastaUrl = searchParams.get("hasta");
  const presetUrl = searchParams.get("preset");
  const rangoUrl =
    desdeUrl && hastaUrl && ES_FECHA_ISO.test(desdeUrl) && ES_FECHA_ISO.test(hastaUrl)
      ? { desde: desdeUrl, hasta: hastaUrl }
      : null;
  const presetActual = !rangoUrl && PRESETS_FECHA_ESTANDAR.some((p) => p.valor === presetUrl) ? presetUrl : null;
  const activo = rangoUrl !== null || presetActual !== null;

  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState({ top: 0, left: 0 });
  const [mesVisible, setMesVisible] = useState<MesVisible>({ anio: 2026, mes: 0 });
  const [hoyIso, setHoyIso] = useState("");
  const [inicio, setInicio] = useState<string | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alPulsar(e: MouseEvent) {
      const objetivo = e.target as Node;
      if (panelRef.current?.contains(objetivo) || botonRef.current?.contains(objetivo)) return;
      setAbierto(false);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setAbierto(false);
      botonRef.current?.focus();
    }
    function cerrar() {
      setAbierto(false);
    }
    document.addEventListener("mousedown", alPulsar);
    document.addEventListener("keydown", alTeclear);
    window.addEventListener("resize", cerrar);
    window.addEventListener("scroll", cerrar, true);
    return () => {
      document.removeEventListener("mousedown", alPulsar);
      document.removeEventListener("keydown", alTeclear);
      window.removeEventListener("resize", cerrar);
      window.removeEventListener("scroll", cerrar, true);
    };
  }, [abierto]);

  function abrir() {
    const ahora = new Date();
    const hoy = aIso(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const base = rangoUrl?.desde ?? hoy;
    const caja = botonRef.current?.getBoundingClientRect();
    if (caja) {
      setPosicion({
        top: caja.bottom + 6,
        left: Math.max(8, Math.min(caja.left, window.innerWidth - ANCHO_PANEL - 8)),
      });
    }
    setHoyIso(hoy);
    setMesVisible({ anio: Number(base.slice(0, 4)), mes: Number(base.slice(5, 7)) - 1 });
    setInicio(null);
    setAbierto(true);
  }

  function aplicar(cambios: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("preset");
    params.delete("desde");
    params.delete("hasta");
    for (const [clave, valor] of Object.entries(cambios)) params.set(clave, valor);
    const consulta = params.toString();
    router.push(consulta ? `${pathname}?${consulta}` : pathname);
    setAbierto(false);
  }

  function elegirDia(iso: string) {
    if (inicio === null) {
      setInicio(iso);
      return;
    }
    const [desde, hasta] = iso < inicio ? [iso, inicio] : [inicio, iso];
    aplicar({ desde, hasta });
  }

  function moverMes(delta: number) {
    setMesVisible(({ anio, mes }) => {
      const fecha = new Date(anio, mes + delta, 1);
      return { anio: fecha.getFullYear(), mes: fecha.getMonth() };
    });
  }

  const primerDiaSemana = (new Date(mesVisible.anio, mesVisible.mes, 1).getDay() + 6) % 7;
  const diasDelMes = new Date(mesVisible.anio, mesVisible.mes + 1, 0).getDate();
  const celdas: (string | null)[] = [
    ...Array<null>(primerDiaSemana).fill(null),
    ...Array.from({ length: diasDelMes }, (_, i) => aIso(mesVisible.anio, mesVisible.mes, i + 1)),
  ];
  const desdeSeleccion = inicio ?? rangoUrl?.desde ?? null;
  const hastaSeleccion = inicio ?? rangoUrl?.hasta ?? null;

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-label="Filtrar por fecha"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        title="Filtrar por fecha"
        className={`rounded p-1 transition-colors ${
          activo ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-background/70"
        }`}
      >
        <CalendarioIcon className="h-3.5 w-3.5" />
      </button>

      {abierto &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Filtrar por fecha"
            style={{ top: posicion.top, left: posicion.left, width: ANCHO_PANEL }}
            className="fixed z-50 rounded-lg border border-border bg-card p-3 text-foreground shadow-lg normal-case"
          >
            <div className="flex flex-wrap gap-1.5">
              {PRESETS_FECHA_ESTANDAR.map((p) => (
                <button
                  key={p.valor}
                  type="button"
                  onClick={() => aplicar({ preset: p.valor })}
                  className={
                    presetActual === p.valor
                      ? "rounded bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground"
                      : "rounded border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                  }
                >
                  {p.etiqueta}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => moverMes(-1)}
                aria-label="Mes anterior"
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <ChevronRightIcon className="h-4 w-4 rotate-180" />
              </button>
              <span className="text-sm font-medium capitalize">
                {MESES[mesVisible.mes]} {mesVisible.anio}
              </span>
              <button
                type="button"
                onClick={() => moverMes(1)}
                aria-label="Mes siguiente"
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-7 text-center text-[11px] text-muted-foreground">
              {DIAS_SEMANA.map((d) => (
                <span key={d} className="py-1">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {celdas.map((iso, i) => {
                if (iso === null) return <span key={`vacio-${i}`} />;
                const esExtremo = iso === desdeSeleccion || iso === hastaSeleccion;
                const enRango = desdeSeleccion !== null && hastaSeleccion !== null && iso > desdeSeleccion && iso < hastaSeleccion;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => elegirDia(iso)}
                    aria-label={formatearFecha(iso)}
                    aria-pressed={esExtremo}
                    className={`h-9 text-sm tabular-nums ${
                      esExtremo
                        ? "rounded-md bg-accent font-medium text-accent-foreground"
                        : enRango
                          ? "bg-muted"
                          : `rounded-md hover:bg-muted ${iso === hoyIso ? "ring-1 ring-border" : ""}`
                    }`}
                  >
                    {Number(iso.slice(8))}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              {inicio === null ? "Elige el día inicial y el final." : "Ahora elige el día final."}
            </p>
            {activo && (
              <button
                type="button"
                onClick={() => aplicar({})}
                className="mt-1 text-xs text-muted-foreground underline hover:text-foreground"
              >
                Quitar filtro
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
