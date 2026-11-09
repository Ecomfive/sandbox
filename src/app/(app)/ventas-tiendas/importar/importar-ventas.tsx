"use client";

import { ComparacionImportacion } from "@/components/importar/comparacion-importacion";
import { compararVentas } from "@/lib/importar/cargas/comparar";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero, entero } from "@/lib/af4/formato";
import { resumirLeido } from "@/lib/ventas/matriz";
import { cargarVentas, leerVentas, type LecturaVentas as Lectura } from "@/lib/importar/cargas/ventas";

const MAX_BYTES = 40 * 1024 * 1024;

type Paso =
  | { tipo: "elegir" }
  | { tipo: "leyendo" }
  | { tipo: "revisar" }
  | { tipo: "cargando"; hechos: number; total: number }
  | { tipo: "listo"; nuevas: number; actualizadas: number; sinCambios: number; rechazadas: number; mapeos: number; tiendasNuevas: string[] }
  | { tipo: "error"; mensaje: string };


export function ImportarVentas() {
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [meses, setMeses] = useState<Set<string>>(new Set());

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setPaso({ tipo: "error", mensaje: "El archivo pasa de 40 MB." });
      return;
    }
    setPaso({ tipo: "leyendo" });
    // Deja que se pinte «Leyendo…» antes de bloquear el hilo con el Excel.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const l = leerVentas(await f.arrayBuffer(), f.name);
      if ("error" in l) {
        setPaso({ tipo: "error", mensaje: l.error });
        return;
      }
      setLectura(l);
      setMeses(new Set(l.ordenes.map((o) => o.periodo)));
      setPaso({ tipo: "revisar" });
    } catch {
      setPaso({ tipo: "error", mensaje: "No pude leer el archivo. ¿Es un Excel (.xlsx)?" });
    }
  }

  const resumen = useMemo(() => {
    const filas = resumirLeido(lectura?.ordenes ?? []);
    const porMes = new Map<string, { ordenes: number; entregadas: number; ventas: number; tiendas: number }>();
    for (const r of filas) {
      const x = porMes.get(r.periodo) ?? { ordenes: 0, entregadas: 0, ventas: 0, tiendas: 0 };
      x.ordenes += r.ordenes;
      x.entregadas += r.entregadas;
      x.ventas += r.ventas;
      x.tiendas++;
      porMes.set(r.periodo, x);
    }
    return [...porMes].sort(([a], [b]) => b.localeCompare(a));
  }, [lectura]);

  const elegidas = useMemo(() => (lectura?.ordenes ?? []).filter((o) => meses.has(o.periodo)), [lectura, meses]);

  async function cargar() {
    if (!lectura || !elegidas.length) return;
    setPaso({ tipo: "cargando", hechos: 0, total: elegidas.length });
    const r = await cargarVentas(lectura, elegidas, (hechos, total) => setPaso({ tipo: "cargando", hechos, total }));
    if ("error" in r) {
      setPaso({ tipo: "error", mensaje: r.error });
      return;
    }
    setPaso({ tipo: "listo", ...r });
  }

  const alternarMes = (m: string) =>
    setMeses((s) => {
      const n = new Set(s);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });

  const ocupado = paso.tipo === "leyendo" || paso.tipo === "cargando";

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Archivo de gestión (.xlsx)</span>
        <input
          type="file"
          accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={alElegir}
          disabled={ocupado}
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

      {lectura && (paso.tipo === "revisar" || paso.tipo === "cargando") && (
        <>
          <section aria-labelledby="titulo-revision" className="rounded-xl border border-border bg-card">
            <h2 id="titulo-revision" className="border-b border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
              {lectura.archivo} · hoja «Excel Matriz»
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-5">
              <Dato titulo="Órdenes" valor={lectura.ordenes.length} />
              <Dato titulo="Líneas de producto" valor={lectura.lineas} />
              <Dato titulo="Guías de Servientrega" valor={lectura.guias} />
              <Dato titulo="Productos con costo" valor={lectura.mapeo.length} />
              <Dato titulo="Filas descartadas" valor={lectura.descartadas.length} alerta={lectura.descartadas.length > 0} />
            </dl>

            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Órdenes por mes: marca los meses que quieres cargar</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="w-10 px-4 py-2 font-medium">
                      <span className="sr-only">Cargar</span>
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">Mes</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Tiendas</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Órdenes</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Entregadas</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Ventas entregadas</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.map(([mes, x]) => (
                    <tr key={mes} className="border-t border-border/60">
                      <td className="px-4 py-1.5">
                        <input
                          type="checkbox"
                          checked={meses.has(mes)}
                          onChange={() => alternarMes(mes)}
                          disabled={ocupado}
                          aria-label={`Cargar ${mesCorto(mes)}`}
                        />
                      </td>
                      <th scope="row" className="px-4 py-1.5 text-left font-normal">{mesCorto(mes)}</th>
                      <td className="px-4 py-1.5 text-right tabular-nums">{x.tiendas}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{entero(x.ordenes)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{entero(x.entregadas)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{dinero(x.ventas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {paso.tipo === "cargando" ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <ProgresoCarga mensaje={`Cargando ${entero(paso.hechos)} de ${entero(paso.total)} órdenes…`} />
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full bg-foreground transition-[width]" style={{ width: `${(100 * paso.hechos) / Math.max(paso.total, 1)}%` }} />
              </div>
            </div>
          ) : (
            <>
            {lectura && elegidas.length > 0 && <ComparacionImportacion key={`${lectura.archivo}-${elegidas.length}`} comparar={() => compararVentas(lectura.archivo, elegidas)} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={cargar} disabled={!elegidas.length}>
                Cargar {entero(elegidas.length)} órdenes
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

      {paso.tipo === "listo" && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            Ventas cargadas: {entero(paso.nuevas)} nuevas, {entero(paso.actualizadas)} actualizadas y{" "}
            {entero(paso.sinCambios)} sin cambios.
          </p>
          {(paso.rechazadas > 0 || paso.tiendasNuevas.length > 0) && (
            <ul className="flex flex-col gap-1 text-muted-foreground">
              {paso.rechazadas > 0 && <li>{entero(paso.rechazadas)} órdenes rechazadas por datos inválidos.</li>}
              {paso.tiendasNuevas.length > 0 && <li>Tiendas nuevas en el libro: {paso.tiendasNuevas.join(", ")}.</li>}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Link href="/ventas-tiendas" className={`rounded-md bg-foreground px-3 py-1.5 font-medium text-background ${anilloFoco}`}>
              Ver Ventas por tienda
            </Link>
            <Link href="/ventas-tiendas/cuadre" className={`rounded-md border border-border px-3 py-1.5 ${anilloFoco}`}>
              Ver el cuadre
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Dato({ titulo, valor, alerta = false }: { titulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {alerta && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
        {titulo}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{entero(valor)}</dd>
    </div>
  );
}
