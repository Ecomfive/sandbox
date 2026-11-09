"use client";

import { ComparacionImportacion } from "@/components/importar/comparacion-importacion";
import { compararBienes } from "@/lib/importar/cargas/comparar";
import Link from "next/link";
import { useState } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { Button } from "@/components/ui/button";
import { dinero, entero } from "@/lib/af4/formato";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { cargarBienes, HOJA_BIENES as HOJA, leerBienes, type LecturaBienes as Lectura } from "@/lib/importar/cargas/bienes";

const MAX_BYTES = 30 * 1024 * 1024;
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

type Paso =
  | { tipo: "elegir" }
  | { tipo: "leyendo" }
  | { tipo: "revisar" }
  | { tipo: "cargando" }
  | { tipo: "listo"; guardados: number; conservados: number; borrados: number; rechazados: number }
  | { tipo: "error"; mensaje: string };

/** Lee la hoja «Bienes de Uso» en el navegador, la compara con la grilla de depreciación del Excel y la carga. */
export function ImportarBienes() {
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [lectura, setLectura] = useState<Lectura | null>(null);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setPaso({ tipo: "error", mensaje: "El archivo pasa de 30 MB." });
      return;
    }
    setPaso({ tipo: "leyendo" });
    try {
      const l = leerBienes(await f.arrayBuffer(), f.name);
      if (!l) {
        setPaso({ tipo: "error", mensaje: `El archivo no tiene la hoja «${HOJA}».` });
        return;
      }
      setLectura(l);
      setPaso({ tipo: "revisar" });
    } catch (err) {
      setPaso({ tipo: "error", mensaje: err instanceof Error ? err.message : "No pude leer el archivo. ¿Es un Excel (.xlsx)?" });
    }
  }

  async function cargar() {
    if (!lectura) return;
    setPaso({ tipo: "cargando" });
    const r = await cargarBienes(lectura);
    if ("error" in r) setPaso({ tipo: "error", mensaje: r.error });
    else setPaso({ tipo: "listo", ...r });
  }

  const sospechosos = lectura?.bienes.filter((b) => b.sospechoso) ?? [];

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Libro de gastos con la hoja «{HOJA}» (.xlsx)</span>
        <input
          type="file"
          accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={alElegir}
          disabled={paso.tipo === "leyendo" || paso.tipo === "cargando"}
          className={fieldClass}
        />
      </label>

      {paso.tipo === "leyendo" && <ProgresoCarga mensaje="Leyendo el Excel…" />}
      {paso.tipo === "cargando" && <ProgresoCarga mensaje="Cargando los bienes…" />}

      {paso.tipo === "error" && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          {paso.mensaje}
        </p>
      )}

      {lectura && paso.tipo === "revisar" && (
        <>
          <MarcoAF4 id="titulo-revision-bienes" titulo={lectura.archivo} detalle={`Hoja «${HOJA}» · USD`} sinRelleno>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
              <Dato titulo="Bienes" valor={entero(lectura.bienes.length)} />
              <Dato titulo="Valor de origen" valor={usd(lectura.bienes.reduce((a, b) => a + b.importe, 0))} />
              <Dato titulo="Filas descartadas" valor={entero(lectura.descartadas.length)} alerta={lectura.descartadas.length > 0} />
              {lectura.grilla && (
                <Dato
                  titulo="Igual a la grilla del Excel"
                  valor={`${entero(lectura.grilla.celdas - lectura.grilla.distintas)} de ${entero(lectura.grilla.celdas)}`}
                  alerta={lectura.grilla.distintas > 0}
                />
              )}
            </dl>
            {(lectura.descartadas.length > 0 || sospechosos.length > 0 || (lectura.grilla?.distintas ?? 0) > 0) && (
              <ul className="flex flex-col gap-1 border-t border-border px-4 py-3 text-sm">
                {lectura.descartadas.map((d) => (
                  <li key={d.fila} className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
                    Fila {d.fila}: {d.motivo}
                  </li>
                ))}
                {sospechosos.map((b) => (
                  <li key={b.fila} className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                    Fila {b.fila}: importe {usd(b.importe)} (¿{dinero(Math.round(b.importe * 1000))}?)
                  </li>
                ))}
                {lectura.grilla && lectura.grilla.filas.length > 0 && (
                  <li className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                    Distintos de la grilla del Excel: filas {lectura.grilla.filas.join(", ")}
                    {lectura.grilla.sinGrilla ? " (en el Excel no tienen depreciación cargada)" : ""}.
                  </li>
                )}
              </ul>
            )}
          </MarcoAF4>
          {lectura && <ComparacionImportacion key={lectura.archivo} comparar={() => compararBienes(lectura)} />}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={cargar} disabled={!lectura.bienes.length}>
              Cargar al portal
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLectura(null);
                setPaso({ tipo: "elegir" });
              }}
            >
              Cancelar
            </Button>
          </div>
        </>
      )}

      {paso.tipo === "listo" && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            {entero(paso.guardados)} bienes cargados
            {paso.conservados ? `, ${entero(paso.conservados)} corregidos a mano que se dejaron como estaban` : ""}
            {paso.borrados ? `, ${entero(paso.borrados)} borrados` : ""}
            {paso.rechazados ? `, ${entero(paso.rechazados)} rechazados` : ""}.
          </p>
          <Link href="/bienes-de-uso" className={`self-start rounded-md bg-foreground px-3 py-1.5 font-medium text-background ${anilloFoco}`}>
            Ver bienes de uso
          </Link>
        </section>
      )}
    </div>
  );
}

function Dato({ titulo, valor, alerta = false }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {alerta && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
        {titulo}
      </dt>
      <dd className={`text-lg font-semibold ${claseCifra}`}>{valor}</dd>
    </div>
  );
}
