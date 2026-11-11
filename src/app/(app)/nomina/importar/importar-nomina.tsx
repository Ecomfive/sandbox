"use client";

import { ComparacionImportacion } from "@/components/importar/comparacion-importacion";
import { compararNomina } from "@/lib/importar/cargas/comparar";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero2, entero } from "@/lib/af4/formato";
import type { LecturaNomina } from "@/lib/nomina/excel";
import { cargarNomina, leerArchivoNomina } from "@/lib/importar/cargas/nomina";
import { resumirImportacionNomina } from "./actions";

const MAX_BYTES = 30 * 1024 * 1024;

type Resumen = { nuevas: number; actualizan: number; borran: number; corregidas: number; origen: string };
type Paso =
  | { tipo: "elegir" }
  | { tipo: "leyendo" }
  | { tipo: "revisar" }
  | { tipo: "cargando"; hechas: number }
  | { tipo: "listo"; borrados: number; personasNuevas: number; conservados: number; rechazadas: number; tiendasNuevas: string[]; enMesCerrado: number }
  | { tipo: "error"; mensaje: string };

const NOMBRE_TIPO = { formal: "Planilla formal (USD)", externa: "Nómina externa (USDT)" } as const;

/**
 * Importa PLANILLA_FORMAL_PANAMA.xlsx o NOMINA_EXTRANJERA.xlsx: se lee en el navegador (el archivo no viaja entero),
 * se muestra por mes cuánto suma, cómo se compara con el total del Excel y qué filas no cuadran con las fórmulas, y
 * se carga por lotes que el servidor vuelve a validar.
 */
export function ImportarNomina() {
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [archivo, setArchivo] = useState("");
  const [lectura, setLectura] = useState<LecturaNomina | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setPaso({ tipo: "error", mensaje: "El archivo pasa de 30 MB." });
      return;
    }
    setPaso({ tipo: "leyendo" });
    setLectura(null);
    try {
      const l = leerArchivoNomina(await f.arrayBuffer());
      if (!l) {
        setPaso({ tipo: "error", mensaje: "No encontré hojas de nómina: ni la planilla formal (NOMBRE COMPLETO, SALARIO MENSUAL) ni la externa (TOTAL USDT)." });
        return;
      }
      const r = await resumirImportacionNomina(f.name, l.lineas.map((x) => x.origen_clave));
      if ("error" in r) {
        setPaso({ tipo: "error", mensaje: r.error });
        return;
      }
      setArchivo(f.name);
      setLectura(l);
      setResumen(r);
      setPaso({ tipo: "revisar" });
    } catch {
      setPaso({ tipo: "error", mensaje: "No pude leer el archivo. ¿Es un Excel (.xlsx)?" });
    }
  }

  async function cargar() {
    if (!lectura) return;
    setPaso({ tipo: "cargando", hechas: 0 });
    const r = await cargarNomina(archivo, lectura, (hechas) => setPaso({ tipo: "cargando", hechas }));
    if ("error" in r) {
      setPaso({ tipo: "error", mensaje: r.error });
      return;
    }
    setPaso({ tipo: "listo", ...r });
  }

  const filasNoCuadran = lectura ? new Set(lectura.noCuadran.map((x) => `${x.hoja}|${x.fila}`)).size : 0;

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Planilla formal o nómina externa (.xlsx)</span>
        <input
          type="file"
          accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={alElegir}
          disabled={paso.tipo === "leyendo" || paso.tipo === "cargando"}
          className={fieldClass}
        />
      </label>

      {paso.tipo === "leyendo" && <ProgresoCarga mensaje="Leyendo el Excel…" />}

      {paso.tipo === "error" && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          {paso.mensaje}
        </p>
      )}

      {lectura && resumen && (paso.tipo === "revisar" || paso.tipo === "cargando") && (
        <>
          <section aria-labelledby="titulo-revision" className="rounded-xl border border-border bg-card">
            <h2 id="titulo-revision" className="border-b border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
              {resumen.origen} · {NOMBRE_TIPO[lectura.tipo]}
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4 lg:grid-cols-7">
              <Dato titulo="Pagos" valor={lectura.lineas.length} />
              <Dato titulo="Personas" valor={new Set(lectura.lineas.map((l) => l.clave)).size} />
              <Dato titulo="Nuevos" valor={resumen.nuevas} />
              <Dato titulo="Se actualizan" valor={resumen.actualizan} />
              <Dato titulo="Se borran" valor={resumen.borran} alerta={resumen.borran > 0} />
              <Dato titulo="Corregidos a mano" valor={resumen.corregidas} detalle={resumen.corregidas ? "no se pisan" : undefined} />
              <Dato titulo="No cuadran con la fórmula" valor={filasNoCuadran} alerta={filasNoCuadran > 0} />
            </dl>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Pagos por mes del archivo</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-medium">Mes</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Pagos</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Suma leída</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Total del Excel</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Diferencia</th>
                    {lectura.tipo === "externa" && <th scope="col" className="px-4 py-2 text-right font-medium">Comisión</th>}
                  </tr>
                </thead>
                <tbody>
                  {lectura.periodos.map((p) => {
                    const dif = p.total_excel === null ? null : Math.round((p.suma_lineas - p.total_excel) * 100) / 100;
                    return (
                      <tr key={p.periodo} className="border-t border-border/60">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">{mesCorto(p.periodo)}</th>
                        <td className="px-4 py-1.5 text-right tabular-nums">{p.lineas}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{dinero2(p.suma_lineas)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                          {p.total_excel === null ? (lectura.tipo === "formal" ? "sin fila de totales" : "sin dato") : dinero2(p.total_excel)}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums">
                          {dif === null ? (
                            "—"
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              {dif !== 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
                              {dinero2(dif)}
                            </span>
                          )}
                        </td>
                        {lectura.tipo === "externa" && <td className="px-4 py-1.5 text-right tabular-nums">{p.comision ? dinero2(p.comision) : "—"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {lectura.noCuadran.length > 0 && (
              <details className="border-t border-border px-4 py-3 text-sm">
                <summary className={`cursor-pointer font-medium ${anilloFoco}`}>Filas que no cuadran con las fórmulas ({filasNoCuadran})</summary>
                <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
                  {lectura.noCuadran.map((x) => (
                    <li key={`${x.hoja}-${x.fila}-${x.campo}`} className="tabular-nums">
                      {x.hoja}, fila {x.fila}: {x.campo} en el Excel {dinero2(x.excel)}, con la fórmula {dinero2(x.calculado)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {paso.tipo === "cargando" ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <ProgresoCarga mensaje={`Cargando ${entero(paso.hechas)} de ${entero(lectura.lineas.length)}…`} />
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full bg-foreground transition-[width]" style={{ width: `${(100 * paso.hechas) / Math.max(lectura.lineas.length, 1)}%` }} />
              </div>
            </div>
          ) : (
            <>
            {lectura && <ComparacionImportacion key={archivo} comparar={() => compararNomina(archivo, lectura)} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={cargar}>
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
        </>
      )}

      {paso.tipo === "listo" && lectura && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            Nómina cargada: {entero(lectura.lineas.length)} pagos de {lectura.periodos.length} meses
            {paso.borrados ? `, ${paso.borrados} borrados` : ""}.
          </p>
          {(paso.personasNuevas > 0 || paso.conservados > 0 || paso.rechazadas > 0 || paso.tiendasNuevas.length > 0 || paso.enMesCerrado > 0) && (
            <ul className="flex flex-col gap-1 text-muted-foreground">
              {paso.personasNuevas > 0 && <li>{paso.personasNuevas} personas nuevas.</li>}
              {paso.conservados > 0 && <li>{paso.conservados} pagos corregidos a mano en el portal: se dejaron como estaban.</li>}
              {paso.rechazadas > 0 && <li>{paso.rechazadas} filas rechazadas por datos inválidos.</li>}
              {paso.enMesCerrado > 0 && <li>{paso.enMesCerrado} de meses cerrados: no se tocaron.</li>}
              {paso.tiendasNuevas.length > 0 && <li>Tiendas nuevas: {paso.tiendasNuevas.join(", ")}.</li>}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Link href="/nomina" className={`rounded-md bg-foreground px-3 py-1.5 font-medium text-background ${anilloFoco}`}>
              Ver la nómina
            </Link>
            <Link href="/nomina/conciliacion" className={`rounded-md border border-border px-3 py-1.5 ${anilloFoco}`}>
              Conciliar con el libro
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Dato({ titulo, valor, detalle, alerta = false }: { titulo: string; valor: number; detalle?: string; alerta?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {alerta && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
        {titulo}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{entero(valor)}</dd>
      {detalle && <dd className="text-xs text-muted-foreground">{detalle}</dd>}
    </div>
  );
}
