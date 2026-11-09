"use client";

import Link from "next/link";
import { useState } from "react";
import * as XLSX from "xlsx";
import { claseCifra } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { Button } from "@/components/ui/button";
import { entero } from "@/lib/af4/formato";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { leerConteo, type FilaConteo } from "@/lib/finanzas/inventario-valorizado";
import type { Celda } from "@/lib/finanzas/libro-excel";
import { importarConteo, type ResultadoConteo } from "../actions";

const LOTE = 400;
const MAX_BYTES = 20 * 1024 * 1024;

type Paso =
  | { tipo: "elegir" }
  | { tipo: "leyendo" }
  | { tipo: "revisar" }
  | { tipo: "cargando"; hechos: number; total: number }
  | { tipo: "listo"; resultado: ResultadoConteo }
  | { tipo: "error"; mensaje: string };

/** Importa un conteo físico: se lee en el navegador y cada fila entra como un ajuste del WMS por la diferencia. */
export function ImportarConteo() {
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [lectura, setLectura] = useState<{ archivo: string; filas: FilaConteo[]; descartadas: number } | null>(null);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) return setPaso({ tipo: "error", mensaje: "El archivo pasa de 20 MB." });
    setPaso({ tipo: "leyendo" });
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const r = leerConteo(XLSX.utils.sheet_to_json<Celda[]>(hoja, { header: 1, raw: true, defval: null }));
      if ("error" in r) return setPaso({ tipo: "error", mensaje: r.error });
      if (!r.filas.length) return setPaso({ tipo: "error", mensaje: "La hoja no tiene filas con producto, bodega y unidades." });
      setLectura({ archivo: f.name, ...r });
      setPaso({ tipo: "revisar" });
    } catch {
      setPaso({ tipo: "error", mensaje: "No pude leer el archivo. ¿Es un Excel (.xlsx) o un CSV?" });
    }
  }

  async function cargar() {
    if (!lectura) return;
    const total: ResultadoConteo = { ajustados: 0, sinCambio: 0, rechazados: [] };
    setPaso({ tipo: "cargando", hechos: 0, total: lectura.filas.length });
    for (let i = 0; i < lectura.filas.length; i += LOTE) {
      const r = await importarConteo(lectura.archivo, lectura.filas.slice(i, i + LOTE)).catch(() => ({ error: "Se cortó la conexión." }));
      if ("error" in r) return setPaso({ tipo: "error", mensaje: `Se cargaron ${i} de ${lectura.filas.length} y falló un lote: ${r.error} Puedes volver a cargarlo: lo ya ajustado no se mueve otra vez.` });
      total.ajustados += r.ajustados;
      total.sinCambio += r.sinCambio;
      total.rechazados.push(...r.rechazados);
      setPaso({ tipo: "cargando", hechos: Math.min(i + LOTE, lectura.filas.length), total: lectura.filas.length });
    }
    setPaso({ tipo: "listo", resultado: total });
  }

  const unidades = lectura ? lectura.filas.reduce((a, f) => a + f.unidades, 0) : 0;
  const bodegas = lectura ? new Set(lectura.filas.map((f) => f.bodega.toUpperCase())).size : 0;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Conteo físico (.xlsx o .csv)</span>
        <input type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={alElegir} disabled={paso.tipo === "leyendo" || paso.tipo === "cargando"} className={fieldClass} />
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
          <MarcoAF4 id="titulo-conteo" titulo={lectura.archivo}>
            <dl className="grid grid-cols-2 gap-3 p-1 text-sm sm:grid-cols-4">
              <Dato titulo="Filas" valor={entero(lectura.filas.length)} />
              <Dato titulo="Unidades contadas" valor={entero(unidades)} />
              <Dato titulo="Bodegas" valor={entero(bodegas)} />
              {lectura.descartadas > 0 && <Dato titulo="Filas descartadas" valor={entero(lectura.descartadas)} />}
            </dl>
          </MarcoAF4>
          {paso.tipo === "cargando" ? (
            <ProgresoCarga mensaje={`Ajustando ${entero(paso.hechos)} de ${entero(paso.total)}…`} />
          ) : (
            <div className="flex gap-3">
              <Button type="button" onClick={cargar}>
                Ajustar el inventario
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
          )}
        </>
      )}
      {paso.tipo === "listo" && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${paso.resultado.rechazados.length ? "bg-warning" : "bg-success"}`} />
            {entero(paso.resultado.ajustados)} ajustes · {entero(paso.resultado.sinCambio)} sin cambio
            {paso.resultado.rechazados.length ? ` · ${entero(paso.resultado.rechazados.length)} rechazadas` : ""}
          </p>
          {paso.resultado.rechazados.length > 0 && (
            <ul className="max-h-64 list-none overflow-auto p-0 text-xs text-muted-foreground">
              {paso.resultado.rechazados.slice(0, 200).map((x, i) => (
                <li key={`${x.fila}-${i}`} className="border-t border-border/60 py-1 first:border-t-0">
                  {x.fila ? `Fila ${x.fila}: ` : ""}
                  {x.motivo}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Link href="/rentabilidad/inventario" className={`rounded-md bg-foreground px-3 py-1.5 font-medium text-background ${anilloFoco}`}>
              Ver inventario valorizado
            </Link>
            <Link href="/inventario" className={`rounded-md border border-border px-3 py-1.5 ${anilloFoco}`}>
              Ver Inventario
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className={`truncate text-lg font-semibold ${claseCifra}`}>{valor}</dd>
    </div>
  );
}
