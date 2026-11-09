"use client";

import { ComparacionImportacion } from "@/components/importar/comparacion-importacion";
import { compararConciliacion } from "@/lib/importar/cargas/comparar";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, fieldClassSm, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { fechaCorta } from "@/lib/af4/fecha";
import { cuentaSugerida, type FormatoHoja, type HojaLeida } from "@/lib/conciliacion/leer-excel";
import { cargarConciliacion, esExtracto, leerConciliacion } from "@/lib/importar/cargas/conciliacion";
import { entero } from "@/lib/af4/formato";
const MAX_BYTES = 30 * 1024 * 1024;

const ETIQUETA_FORMATO: Record<FormatoHoja, string> = {
  banco_general: "Extracto Banco General",
  bac: "Extracto BAC",
  generico: "Extracto",
  yappy: "Cobros Yappy",
  mipos: "Cobros MiPOS",
  servientrega: "Guías Servientrega",
};

type Paso =
  | { tipo: "elegir" }
  | { tipo: "leyendo" }
  | { tipo: "revisar" }
  | { tipo: "cargando"; hechos: number; total: number; mensaje: string }
  | { tipo: "listo"; auto: number; sugeridas: number; pendientes: number; rechazados: number; nuevas: number }
  | { tipo: "error"; mensaje: string };

const rango = (fechas: string[]) => {
  if (!fechas.length) return "—";
  const orden = [...fechas].sort();
  return `${fechaCorta(orden[0])} a ${fechaCorta(orden[orden.length - 1])}`;
};

export function ImportarConciliacion({ cuentas }: { cuentas: { id: string; nombre: string }[] }) {
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [archivo, setArchivo] = useState("");
  const [hojas, setHojas] = useState<HojaLeida[]>([]);
  // La cuenta de cada hoja de extracto ("" = no importar esa hoja).
  const [cuentaDe, setCuentaDe] = useState<Record<string, string>>({});

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setPaso({ tipo: "error", mensaje: "El archivo pasa de 30 MB." });
      return;
    }
    setPaso({ tipo: "leyendo" });
    try {
      const leidas = leerConciliacion(await f.arrayBuffer(), f.name);
      if (!leidas.length) {
        setPaso({ tipo: "error", mensaje: "No encontré un extracto (Fecha, Descripción, Débito/Crédito o Monto) ni hojas de Yappy, MiPOS o Servientrega." });
        return;
      }
      setArchivo(f.name);
      setHojas(leidas);
      setCuentaDe(Object.fromEntries(leidas.filter(esExtracto).map((h) => [h.hoja, cuentaSugerida(h.hoja, cuentas) ?? ""])));
      setPaso({ tipo: "revisar" });
    } catch {
      setPaso({ tipo: "error", mensaje: "No pude leer el archivo. ¿Es un Excel (.xlsx) o un CSV?" });
    }
  }

  async function cargar() {
    const r = await cargarConciliacion(archivo, hojas, cuentaDe, (hechos, total, mensaje) =>
      setPaso({ tipo: "cargando", hechos, total, mensaje: mensaje ?? "Cargando…" }),
    );
    if ("error" in r) return setPaso({ tipo: "error", mensaje: r.error });
    setPaso({ tipo: "listo", ...r });
  }

  const extractosSinCuenta = hojas.filter((h) => esExtracto(h) && !cuentaDe[h.hoja]).length;
  const algoParaCargar = hojas.some((h) => h.cobros.length > 0) || hojas.some((h) => esExtracto(h) && cuentaDe[h.hoja]);

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Libro de conciliación o extracto del banco (.xlsx o .csv)</span>
        <input
          type="file"
          accept=".xlsx,.xlsm,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={alElegir}
          disabled={paso.tipo === "leyendo" || paso.tipo === "cargando"}
          className={fieldClass}
        />
      </label>

      {paso.tipo === "leyendo" && <ProgresoCarga mensaje="Leyendo el archivo…" />}

      {paso.tipo === "error" && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          {paso.mensaje}
        </p>
      )}

      {hojas.length > 0 && (paso.tipo === "revisar" || paso.tipo === "cargando") && (
        <>
          <section aria-labelledby="titulo-hojas" className="rounded-xl border border-border bg-card">
            <h2 id="titulo-hojas" className="border-b border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
              {archivo}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Hojas que se van a cargar</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-medium">Hoja</th>
                    <th scope="col" className="px-4 py-2 font-medium">Qué es</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Filas</th>
                    <th scope="col" className="px-4 py-2 font-medium">Fechas</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Descartadas</th>
                    <th scope="col" className="px-4 py-2 font-medium">Cuenta</th>
                  </tr>
                </thead>
                <tbody>
                  {hojas.map((h) => {
                    const filas = esExtracto(h) ? h.lineas.length : h.cobros.length;
                    const fechas = esExtracto(h) ? h.lineas.map((l) => l.fecha) : h.cobros.map((c) => c.fecha);
                    return (
                      <tr key={h.hoja} className="border-t border-border/60">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">{h.hoja}</th>
                        <td className="px-4 py-1.5">{ETIQUETA_FORMATO[h.formato]}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{entero(filas)}</td>
                        <td className="px-4 py-1.5 whitespace-nowrap text-muted-foreground">{rango(fechas)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{h.descartadas.length || "—"}</td>
                        <td className="px-4 py-1.5">
                          {esExtracto(h) ? (
                            <span className="flex items-center gap-1.5">
                              {!cuentaDe[h.hoja] && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
                              <select
                                aria-label={`Cuenta de la hoja ${h.hoja}`}
                                className={`${fieldClassSm} max-w-56`}
                                value={cuentaDe[h.hoja] ?? ""}
                                disabled={paso.tipo === "cargando"}
                                onChange={(e) => setCuentaDe((c) => ({ ...c, [h.hoja]: e.target.value }))}
                              >
                                <option value="">No importar</option>
                                {cuentas.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nombre}
                                  </option>
                                ))}
                              </select>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {paso.tipo === "cargando" ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <ProgresoCarga mensaje={`${paso.mensaje} ${entero(paso.hechos)} de ${entero(paso.total)}`} />
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full bg-foreground transition-[width] motion-reduce:transition-none" style={{ width: `${(100 * paso.hechos) / Math.max(paso.total, 1)}%` }} />
              </div>
            </div>
          ) : (
            <>
            {hojas.length > 0 && <ComparacionImportacion key={archivo} comparar={() => compararConciliacion(archivo, hojas)} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={cargar} disabled={!algoParaCargar}>
                Cargar al portal
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setHojas([]); setPaso({ tipo: "elegir" }); }}>
                Cancelar
              </Button>
              {extractosSinCuenta > 0 && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                  {extractosSinCuenta === 1 ? "Una hoja de extracto no se importa" : `${extractosSinCuenta} hojas de extracto no se importan`}: falta elegir su cuenta.
                </span>
              )}
            </div>
            </>
          )}
        </>
      )}

      {paso.tipo === "listo" && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            Cargado: {entero(paso.nuevas)} líneas nuevas · {entero(paso.auto)} conciliadas solas · {entero(paso.sugeridas)} sugeridas ·{" "}
            {entero(paso.pendientes)} sin coincidencia.
          </p>
          {paso.rechazados > 0 && <p className="text-muted-foreground">{entero(paso.rechazados)} filas rechazadas por datos inválidos.</p>}
          <div className="flex flex-wrap gap-3">
            <Link href="/conciliacion-bancaria" className={`rounded-md bg-foreground px-3 py-1.5 font-medium text-background ${anilloFoco}`}>
              Ver la conciliación
            </Link>
            <Link href="/conciliacion-bancaria/cobros" className={`rounded-md border border-border px-3 py-1.5 ${anilloFoco}`}>
              Ver cobros
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
