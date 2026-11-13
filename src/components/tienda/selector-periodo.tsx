"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { anilloFoco } from "@/components/ui/field";
import { CalendarioIcon, ChevronRightIcon } from "@/lib/nav-icons";
import { ATAJOS, fechaLarga, parametrosPeriodo, rangoDeAtajo, type IdAtajo, type Periodo } from "@/lib/tienda/rango";

const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-11» → el mes anterior o el siguiente. */
const moverMes = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Los días de un mes en semanas de lunes a domingo (null = hueco antes del 1 o después del último). */
function semanasDe(mes: string): (string | null)[][] {
  const [a, m] = mes.split("-").map(Number);
  const primero = new Date(Date.UTC(a, m - 1, 1));
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const hueco = (primero.getUTCDay() + 6) % 7;
  const celdas: (string | null)[] = [...Array(hueco).fill(null), ...Array.from({ length: ultimo }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`)];
  while (celdas.length % 7) celdas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

function Mes({ mes, desde, hasta, hoy, alElegir }: { mes: string; desde: string | null; hasta: string | null; hoy: string; alElegir: (dia: string) => void }) {
  const [a, m] = mes.split("-").map(Number);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="m-0 text-center text-sm font-semibold">
        {MESES[m - 1]} {a}
      </p>
      <table className="w-full border-collapse text-center text-sm">
        <thead>
          <tr>
            {DIAS_SEMANA.map((d) => (
              <th key={d} scope="col" className="pb-1 text-xs font-medium text-muted-foreground">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanasDe(mes).map((semana, i) => (
            <tr key={i}>
              {semana.map((dia, j) => {
                if (!dia) return <td key={j} />;
                const futuro = dia > hoy;
                const extremo = dia === desde || dia === hasta;
                const dentro = !!desde && !!hasta && dia > desde && dia < hasta;
                return (
                  <td key={j} className={`p-0.5 ${dentro ? "bg-primario-suave" : ""}`}>
                    <button
                      type="button"
                      disabled={futuro}
                      aria-pressed={extremo || dentro}
                      aria-label={fechaLarga(dia)}
                      onClick={() => alElegir(dia)}
                      className={`h-8 w-full min-w-8 rounded-md tabular-nums ${anilloFoco} ${
                        extremo ? "bg-primario font-semibold text-white" : futuro ? "cursor-default text-muted-foreground/50" : dentro ? "text-primario" : "hover:bg-muted"
                      }`}
                    >
                      {Number(dia.slice(8, 10))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * El selector de fechas de Gestión de tienda (12 nov 2026, pedido de Hernán: «un sistema de fechas así», como el de Mi Reto Digital): el botón con el periodo y, al
 * abrirlo, los atajos a la izquierda y dos meses de calendario para elegir un rango; «Aplicar» lo pone en la dirección (`?periodo=`, o `?periodo=rango&desde=&hasta=`) y
 * la página se vuelve a cargar con él. Los días después de hoy no se eligen. `hoy` es el de las tiendas que se miran (con solo el Excel de Finanzas, su último día).
 */
export function SelectorPeriodo({ periodo, hoy }: { periodo: Periodo; hoy: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [atajo, setAtajo] = useState<IdAtajo | null>(periodo.id === "rango" ? null : periodo.id);
  const [desde, setDesde] = useState<string | null>(periodo.desde);
  const [hasta, setHasta] = useState<string | null>(periodo.hasta);
  const [mes, setMes] = useState(() => moverMes(periodo.hasta.slice(0, 7), -1));
  const caja = useRef<HTMLDivElement>(null);

  const reiniciar = () => {
    setAtajo(periodo.id === "rango" ? null : periodo.id);
    setDesde(periodo.desde);
    setHasta(periodo.hasta);
    setMes(moverMes(periodo.hasta.slice(0, 7), -1));
  };

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const elegirAtajo = (id: IdAtajo) => {
    const r = rangoDeAtajo(id, hoy);
    setAtajo(id);
    setDesde(r.desde);
    setHasta(r.hasta);
    setMes(moverMes(r.hasta.slice(0, 7), -1));
  };

  const elegirDia = (dia: string) => {
    setAtajo(null);
    if (!desde || hasta) {
      setDesde(dia);
      setHasta(null);
    } else if (dia < desde) {
      setDesde(dia);
    } else {
      setHasta(dia);
    }
  };

  const aplicar = () => {
    if (!desde) return;
    const eleccion = atajo ? ({ tipo: "atajo", id: atajo } as const) : ({ tipo: "rango", desde, hasta: hasta ?? desde } as const);
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(parametrosPeriodo(eleccion))) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    url.searchParams.delete("pedido");
    setAbierto(false);
    router.push(`${url.pathname}${url.search}`);
  };

  const meses = useMemo(() => [mes, moverMes(mes, 1)], [mes]);
  const siguienteDeshabilitado = moverMes(mes, 1) >= hoy.slice(0, 7);

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => {
          if (!abierto) reiniciar();
          setAbierto((a) => !a);
        }}
        className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium whitespace-nowrap ${anilloFoco} ${
          abierto ? "border-primario text-primario" : "border-border bg-card text-foreground hover:bg-muted"
        }`}
      >
        <CalendarioIcon className="h-4 w-4" aria-hidden="true" />
        {periodo.etiqueta}
      </button>
      {abierto && (
        <div role="dialog" aria-label="Elegir el periodo" className="absolute right-0 z-30 mt-2 flex w-[min(46rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg sm:flex-row">
          <ul className="m-0 flex max-h-72 list-none flex-row flex-wrap gap-1 overflow-y-auto border-b border-border p-2 sm:max-h-none sm:w-48 sm:flex-col sm:flex-nowrap sm:border-r sm:border-b-0">
            {ATAJOS.map((grupo, i) => (
              <li key={i} className={`contents sm:block ${i > 0 ? "sm:mt-1 sm:border-t sm:border-border sm:pt-1" : ""}`}>
                <ul className="m-0 flex list-none flex-row flex-wrap gap-1 p-0 sm:flex-col">
                  {grupo.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        aria-pressed={atajo === a.id}
                        onClick={() => elegirAtajo(a.id)}
                        className={`w-full rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap ${anilloFoco} ${atajo === a.id ? "bg-primario-suave font-semibold text-primario" : "hover:bg-muted"}`}
                      >
                        {a.etiqueta}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            <li className="contents sm:mt-1 sm:block sm:border-t sm:border-border sm:pt-1">
              <span className={`block px-3 py-1.5 text-sm ${atajo === null ? "font-semibold text-primario" : "text-muted-foreground"}`}>Rango personalizado</span>
            </li>
          </ul>
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate rounded-lg border border-border px-3 py-2">{desde ? fechaLarga(desde) : "Desde"}</span>
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
              <span className="min-w-0 flex-1 truncate rounded-lg border border-border px-3 py-2">{hasta ? fechaLarga(hasta) : desde ? "Elige el último día" : "Hasta"}</span>
            </div>
            <div className="relative grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => setMes((m) => moverMes(m, -1))}
                className={`absolute top-0 left-0 rounded-md p-1 text-muted-foreground hover:bg-muted ${anilloFoco}`}
              >
                <ChevronRightIcon className="h-4 w-4 rotate-180" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Mes siguiente"
                disabled={siguienteDeshabilitado}
                onClick={() => setMes((m) => moverMes(m, 1))}
                className={`absolute top-0 right-0 rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30 ${anilloFoco}`}
              >
                <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
              </button>
              {meses.map((m, i) => (
                <div key={m} className={i === 0 ? "hidden sm:block" : ""}>
                  <Mes mes={m} desde={desde} hasta={hasta} hoy={hoy} alElegir={elegirDia} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="secondary" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={!desde} onClick={aplicar}>
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
