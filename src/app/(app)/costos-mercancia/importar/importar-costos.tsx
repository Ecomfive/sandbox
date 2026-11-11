"use client";

import { ComparacionImportacion } from "@/components/importar/comparacion-importacion";
import { compararCostos } from "@/lib/importar/cargas/comparar";
import Link from "next/link";
import { useState } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Button } from "@/components/ui/button";
import { entero, SIN_DATO } from "@/lib/af4/formato";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { cargarCostos, leerCostos, type LecturaCostos as Lectura } from "@/lib/importar/cargas/costos";

const MAX_BYTES = 40 * 1024 * 1024;

type Paso = { tipo: "elegir" } | { tipo: "leyendo" } | { tipo: "revisar" } | { tipo: "cargando"; hechos: number; total: number } | { tipo: "listo"; borrados: number; mapeos: number; rechazados: number } | { tipo: "error"; mensaje: string };

export function ImportarCostos() {
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [lectura, setLectura] = useState<Lectura | null>(null);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) return setPaso({ tipo: "error", mensaje: "El archivo pasa de 40 MB." });
    setPaso({ tipo: "leyendo" });
    try {
      const l = leerCostos(await f.arrayBuffer(), f.name);
      if (!l) return setPaso({ tipo: "error", mensaje: "No encontré hojas «MERCANCIA …» en el archivo." });
      setLectura(l);
      setPaso({ tipo: "revisar" });
    } catch {
      setPaso({ tipo: "error", mensaje: "No pude leer el archivo. ¿Es un Excel (.xlsx)?" });
    }
  }

  async function cargar() {
    if (!lectura) return;
    const r = await cargarCostos(lectura, (hechos, total) => setPaso({ tipo: "cargando", hechos, total }));
    if ("error" in r) return setPaso({ tipo: "error", mensaje: r.error });
    setPaso({ tipo: "listo", ...r });
  }

  const productos = lectura ? new Set(lectura.porHoja.flatMap((h) => h.lotes.map((l) => l.producto_clave))).size : 0;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Archivo de costos (.xlsx)</span>
        <input type="file" accept=".xlsx,.xlsm,.xls" onChange={alElegir} disabled={paso.tipo === "leyendo" || paso.tipo === "cargando"} className={fieldClass} />
      </label>
      {paso.tipo === "leyendo" && <ProgresoCarga mensaje="Leyendo el Excel…" />}
      {paso.tipo === "error" && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          {paso.mensaje}
        </p>
      )}
      {lectura && (paso.tipo === "revisar" || paso.tipo === "cargando") && (
        <>
          <MarcoAF4 id="titulo-costos" titulo={lectura.archivo} detalle={`${entero(productos)} productos`} sinRelleno>
            <table className="w-full text-sm">
              <caption className="sr-only">Lotes por hoja</caption>
              <thead>
                <tr className={claseFilaEncabezado}>
                  <th scope="col" className={`${claseEncabezadoColumna} text-left`}>Hoja</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Lotes</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Filas descartadas</th>
                </tr>
              </thead>
              <tbody>
                {lectura.porHoja.map((h) => (
                  <tr key={h.hoja} className="border-t border-border/60">
                    <th scope="row" className="px-4 py-1.5 text-left font-normal">{h.hoja}</th>
                    <td className={`px-4 py-1.5 text-right ${claseCifra}`}>{entero(h.lotes.length)}</td>
                    <td className={`px-4 py-1.5 text-right text-muted-foreground ${claseCifra}`}>{entero(h.descartadas)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border/60">
                  <th scope="row" className="px-4 py-1.5 text-left font-normal">MAPEO (Dropi → producto)</th>
                  <td className={`px-4 py-1.5 text-right ${claseCifra}`}>{entero(lectura.mapeo.length)}</td>
                  <td className="px-4 py-1.5 text-right text-muted-foreground">{SIN_DATO}</td>
                </tr>
              </tbody>
            </table>
          </MarcoAF4>
          {paso.tipo === "cargando" ? (
            <ProgresoCarga mensaje={`Cargando ${entero(paso.hechos)} de ${entero(paso.total)}…`} />
          ) : (
            <>
            {lectura && <ComparacionImportacion key={lectura.archivo} comparar={() => compararCostos(lectura)} />}
            <div className="flex gap-3">
              <Button type="button" onClick={cargar}>Cargar al portal</Button>
              <Button type="button" variant="secondary" onClick={() => { setLectura(null); setPaso({ tipo: "elegir" }); }}>Cancelar</Button>
            </div>
            </>
          )}
        </>
      )}
      {paso.tipo === "listo" && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            Costos cargados{paso.borrados ? `, ${entero(paso.borrados)} lotes viejos borrados` : ""}{paso.mapeos ? `, ${entero(paso.mapeos)} mapeos` : ""}
            {paso.rechazados ? `, ${entero(paso.rechazados)} filas rechazadas` : ""}.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/costos-mercancia" className={`rounded-md bg-foreground px-3 py-1.5 font-medium text-background ${anilloFoco}`}>Ver costos</Link>
            <Link href="/costos-mercancia/mapeo" className={`rounded-md border border-border px-3 py-1.5 ${anilloFoco}`}>Ver mapeo con Dropi</Link>
          </div>
        </section>
      )}
    </div>
  );
}
