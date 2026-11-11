"use client";

import { ComparacionImportacion } from "@/components/importar/comparacion-importacion";
import { compararDeliverys } from "@/lib/importar/cargas/comparar";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, fieldClassSm, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { TIENDAS_EXCEL, type LecturaDeliverys } from "@/lib/deliverys/excel";
import { asignacionInicial, cargarDeliverys, leerDeliverys, NUEVO_REPARTIDOR as NUEVO } from "@/lib/importar/cargas/deliverys";
import { inicioSemana, liquidar, textoSemanaCorto } from "@/lib/deliverys/liquidacion";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero2, entero } from "@/lib/af4/formato";
import { resumirImportacionDeliverys, type ResumenImportacion } from "./actions";

const MAX_BYTES = 30 * 1024 * 1024;

type Paso =
  | { tipo: "elegir" }
  | { tipo: "leyendo" }
  | { tipo: "revisar" }
  | { tipo: "cargando"; hechas: number }
  | { tipo: "listo"; borradas: number; conservadas: number; rechazadas: number; sinRepartidor: number; creados: number }
  | { tipo: "error"; mensaje: string };

/** Lo que paga cada semana según la hoja (todas las tiendas; Clicksi aparte), para revisar antes de cargar. */
function porSemana(l: LecturaDeliverys) {
  const m = new Map<string, Parameters<typeof liquidar>[0]>();
  for (const e of l.entregas) {
    const s = inicioSemana(e.fecha);
    const lista = m.get(s) ?? m.set(s, []).get(s)!;
    lista.push({ estado: e.estado, categoria: e.categoria, cantidad: e.cantidad, tarifa: e.tarifa, tienda: TIENDAS_EXCEL[e.tienda] ?? e.tienda, pagoAparte: e.tienda === "CLICKSI" });
  }
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([semana, lineas]) => ({ semana, ...liquidar(lineas) }));
}

/**
 * Importa GESTION_DELIVERYS_<mes>.xlsx: se lee en el navegador (el archivo no viaja entero), se muestra por semana
 * cuánto se paga y si el cálculo da lo mismo que las columnas «Pagar por envíos» del Excel, se asignan los nombres de la
 * hoja que todavía no son de ningún repartidor (sus zonas) y se carga por lotes que el servidor vuelve a validar.
 */
export function ImportarDeliverys() {
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [archivo, setArchivo] = useState("");
  const [lectura, setLectura] = useState<LecturaDeliverys | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const [asignacion, setAsignacion] = useState<Record<string, string>>({});

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
      const l = leerDeliverys(await f.arrayBuffer());
      if (!l) {
        setPaso({ tipo: "error", mensaje: "No encontré la hoja de gestión: una fila con «NOMBRE DEL DELIVERY» y los bloques «COSTE DE ENVIO $…»." });
        return;
      }
      const r = await resumirImportacionDeliverys(f.name, l.entregas.map((x) => x.origen_clave), l.etiquetas);
      if ("error" in r) {
        setPaso({ tipo: "error", mensaje: r.error });
        return;
      }
      setArchivo(f.name);
      setLectura(l);
      setResumen(r);
      setAsignacion(asignacionInicial(r));
      setPaso({ tipo: "revisar" });
    } catch {
      setPaso({ tipo: "error", mensaje: "No pude leer el archivo. ¿Es un Excel (.xlsx)?" });
    }
  }

  async function cargar() {
    if (!lectura || !resumen) return;
    setPaso({ tipo: "cargando", hechas: 0 });
    const r = await cargarDeliverys(archivo, lectura, resumen, asignacion, (hechas) => setPaso({ tipo: "cargando", hechas }));
    if ("error" in r) {
      setPaso({ tipo: "error", mensaje: r.error });
      return;
    }
    setPaso({ tipo: "listo", ...r });
  }

  const semanas = lectura ? porSemana(lectura) : [];

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Hoja de gestión de deliverys (.xlsx)</span>
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
              {resumen.origen} · {lectura.desde ? fechaCorta(lectura.desde) : "—"} al {lectura.hasta ? fechaCorta(lectura.hasta) : "—"}
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4 lg:grid-cols-7">
              <Dato titulo="Filas de la hoja" valor={lectura.filas} />
              <Dato titulo="Líneas" valor={lectura.entregas.length} />
              <Dato titulo="Nuevas" valor={resumen.nuevas} />
              <Dato titulo="Se actualizan" valor={resumen.actualizan} />
              <Dato titulo="Se borran" valor={resumen.borran} alerta={resumen.borran > 0} />
              <Dato titulo="En semanas cerradas" valor={resumen.enCierre} detalle={resumen.enCierre ? "no se tocan" : undefined} />
              <Dato titulo="No cuadran con el Excel" valor={lectura.noCuadran.length} alerta={lectura.noCuadran.length > 0} />
            </dl>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Lo que paga cada semana según el archivo</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-medium">Semana</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Entregas</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Tasa</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">A pagar</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Clicksi (aparte)</th>
                  </tr>
                </thead>
                <tbody>
                  {semanas.map((s) => (
                    <tr key={s.semana} className="border-t border-border/60">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal tabular-nums">{textoSemanaCorto(s.semana)}</th>
                      <td className="px-4 py-1.5 text-right tabular-nums">{entero(s.entregas)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{s.tasaEntrega === null ? "—" : `${Math.round(s.tasaEntrega * 100)} %`}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{dinero2(s.aPagar)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{dinero2(s.aparte)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <th scope="row" className="px-4 py-1.5 text-left font-medium">Total del Excel</th>
                    <td colSpan={4} className="px-4 py-1.5 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {lectura.totalExcel !== lectura.totalCalculado && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
                        {dinero2(lectura.totalExcel)} en la hoja · {dinero2(lectura.totalCalculado)} calculado
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {(lectura.noCuadran.length > 0 || lectura.avisos.length > 0) && (
              <details className="border-t border-border px-4 py-3 text-sm">
                <summary className={`cursor-pointer font-medium ${anilloFoco}`}>Avisos ({lectura.noCuadran.length + lectura.avisos.length})</summary>
                <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
                  {lectura.noCuadran.map((x) => (
                    <li key={`c-${x.fila}-${x.tienda}`} className="tabular-nums">
                      Fila {x.fila}, {x.tienda}: el Excel paga {dinero2(x.excel)} y con las tarifas da {dinero2(x.calculado)}
                    </li>
                  ))}
                  {lectura.avisos.map((a, i) => (
                    <li key={`a-${i}`}>
                      Fila {a.fila}: {a.mensaje}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {resumen.sinDueno.length > 0 && (
            <section aria-labelledby="titulo-nombres" className="rounded-xl border border-border bg-card">
              <h2 id="titulo-nombres" className="border-b border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
                Nombres de la hoja sin repartidor
              </h2>
              <ul className="flex flex-col divide-y divide-border">
                {resumen.sinDueno.map((x) => (
                  <li key={x.etiqueta} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="font-medium">{x.etiqueta}</span>
                    <select
                      aria-label={`Repartidor de ${x.etiqueta}`}
                      value={asignacion[x.etiqueta] ?? NUEVO}
                      disabled={paso.tipo === "cargando"}
                      onChange={(e) => setAsignacion((a) => ({ ...a, [x.etiqueta]: e.target.value }))}
                      className={`${fieldClassSm} min-w-56`}
                    >
                      <option value={NUEVO}>Nuevo repartidor con este nombre</option>
                      {resumen.repartidores.map((r) => (
                        <option key={r.id} value={r.id}>
                          Zona de {r.nombre}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {paso.tipo === "cargando" ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <ProgresoCarga mensaje={`Cargando ${entero(paso.hechas)} de ${entero(lectura.entregas.length)}…`} />
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full bg-foreground transition-[width]" style={{ width: `${(100 * paso.hechas) / Math.max(lectura.entregas.length, 1)}%` }} />
              </div>
            </div>
          ) : (
            <>
            {lectura && <ComparacionImportacion key={archivo} comparar={() => compararDeliverys(archivo, lectura)} />}
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
            Entregas cargadas: {entero(lectura.entregas.length)} líneas de {semanas.length} semanas
            {paso.borradas ? `, ${paso.borradas} borradas` : ""}.
          </p>
          {(paso.creados > 0 || paso.conservadas > 0 || paso.rechazadas > 0 || paso.sinRepartidor > 0) && (
            <ul className="flex flex-col gap-1 text-muted-foreground">
              {paso.creados > 0 && <li>{paso.creados} repartidores nuevos: completa su documento en Repartidores para el recibo.</li>}
              {paso.conservadas > 0 && <li>{paso.conservadas} líneas de semanas ya cerradas: se dejaron como estaban.</li>}
              {paso.sinRepartidor > 0 && <li>{paso.sinRepartidor} líneas sin repartidor: no se cargaron.</li>}
              {paso.rechazadas > 0 && <li>{paso.rechazadas} líneas rechazadas por datos inválidos.</li>}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Link href="/deliverys" className={`rounded-md bg-foreground px-3 py-1.5 font-medium text-background ${anilloFoco}`}>
              Ver la semana
            </Link>
            <Link href="/deliverys/repartidores" className={`rounded-md border border-border px-3 py-1.5 ${anilloFoco}`}>
              Repartidores
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
