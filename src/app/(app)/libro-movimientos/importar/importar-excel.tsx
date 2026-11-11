"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { claveCatalogo, UNIDAD_SIN_ASIGNAR, type BaseExcel, type Descartada, type MovimientoExcel } from "@/lib/finanzas/libro-excel";
import { claseCifra } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero, entero, SIN_DATO } from "@/lib/af4/formato";
import { abrirLibro, cargarLibro, compararConCargado, hojasDelLibro, leerHojaLibro } from "@/lib/importar/cargas/libro";
import { ComparacionImportacion } from "@/components/importar/comparacion-importacion";
import { ENTIDAD_BASE, entidadDeArchivo } from "@/lib/finanzas/entidades";
import { resumirImportacion } from "./actions";

const MAX_BYTES = 30 * 1024 * 1024;

type Paso =
  | { tipo: "elegir" }
  | { tipo: "leyendo" }
  | { tipo: "revisar" }
  | { tipo: "cargando"; hechos: number }
  | { tipo: "listo"; borrados: number; base: number; tiendasNuevas: string[]; sinTipo: number; rechazados: number; conservados: number; porRegla: number; enMesCerrado: number; sinTasa: number }
  | { tipo: "error"; mensaje: string };

interface Lectura {
  archivo: string;
  hojas: string[];
  hoja: string;
  movimientos: MovimientoExcel[];
  descartadas: Descartada[];
  base: BaseExcel[];
  resumen: { nuevos: number; actualizan: number; borran: number; origen: string } | null;
}

/** Una entidad que se puede elegir como dueña del libro (migración 0923). */
export interface EntidadImportar {
  codigo: string;
  razon_social: string;
  moneda: string;
}

export function ImportarExcel({ entidades = [] }: { entidades?: EntidadImportar[] }) {
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [libro, setLibro] = useState<XLSX.WorkBook | null>(null);
  // La entidad del libro: la que diga el nombre del archivo (GASTOS_COSTA_RICA…) o Panamá.
  const [codigo, setCodigo] = useState(ENTIDAD_BASE);
  const entidad = entidades.find((e) => e.codigo === codigo) ?? null;
  const monedaLibro = entidad?.moneda ?? "USD";

  async function leerHoja(wb: XLSX.WorkBook, archivo: string, hoja: string, hojas: string[], cod = codigo) {
    const moneda = entidades.find((e) => e.codigo === cod)?.moneda;
    const { movimientos, descartadas, base } = leerHojaLibro(wb, archivo, hoja, moneda);
    const r = await resumirImportacion(archivo, movimientos.map((m) => m.origen_clave));
    if ("error" in r) {
      setPaso({ tipo: "error", mensaje: r.error });
      return;
    }
    setLectura({ archivo, hojas, hoja, movimientos, descartadas, base, resumen: r });
    setPaso({ tipo: "revisar" });
  }

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setPaso({ tipo: "error", mensaje: "El archivo pasa de 30 MB." });
      return;
    }
    setPaso({ tipo: "leyendo" });
    try {
      const wb = abrirLibro(await f.arrayBuffer());
      const hojas = hojasDelLibro(wb);
      if (!hojas.length) {
        setPaso({ tipo: "error", mensaje: "No encontré una hoja con las columnas MES, TIENDA, TIPO y USD." });
        return;
      }
      setLibro(wb);
      const cod = entidadDeArchivo(f.name, entidades.map((e) => ({ ...e, id: e.codigo, orden: 0 })))?.codigo ?? ENTIDAD_BASE;
      setCodigo(cod);
      await leerHoja(wb, f.name, hojas[0], hojas, cod);
    } catch {
      setPaso({ tipo: "error", mensaje: "No pude leer el archivo. ¿Es un Excel (.xlsx)?" });
    }
  }

  async function cargar() {
    if (!lectura) return;
    const { archivo, movimientos, base } = lectura;
    setPaso({ tipo: "cargando", hechos: 0 });
    const r = await cargarLibro(archivo, movimientos, base, (hechos) => setPaso({ tipo: "cargando", hechos }), codigo);
    if ("error" in r) {
      setPaso({ tipo: "error", mensaje: r.error });
      return;
    }
    setPaso({ tipo: "listo", ...r });
  }

  const porMes = useMemo(() => {
    const mapa = new Map<string, { filas: number; eerr: number; monto: number; sinTienda: number }>();
    for (const m of lectura?.movimientos ?? []) {
      const x = mapa.get(m.periodo) ?? { filas: 0, eerr: 0, monto: 0, sinTienda: 0 };
      x.filas++;
      if (m.en_eerr) {
        x.eerr++;
        x.monto += m.monto;
      }
      if (claveCatalogo(m.unidad) === UNIDAD_SIN_ASIGNAR) x.sinTienda++;
      mapa.set(m.periodo, x);
    }
    return [...mapa].sort(([a], [b]) => a.localeCompare(b));
  }, [lectura]);

  const motivos = useMemo(() => {
    const c = new Map<string, number>();
    for (const d of lectura?.descartadas ?? []) c.set(d.motivo, (c.get(d.motivo) ?? 0) + 1);
    return [...c];
  }, [lectura]);

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Archivo del libro (.xlsx)</span>
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

      {lectura && (paso.tipo === "revisar" || paso.tipo === "cargando") && (
        <>
          {entidades.length > 1 && (
            <label className="flex flex-col gap-1 sm:max-w-xs">
              <span className={labelClass}>Entidad del libro</span>
              <select
                className={fieldClass}
                value={codigo}
                disabled={paso.tipo === "cargando"}
                onChange={(e) => {
                  setCodigo(e.target.value);
                  if (libro) leerHoja(libro, lectura.archivo, lectura.hoja, lectura.hojas, e.target.value);
                }}
              >
                {entidades.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.razon_social} · {e.moneda}
                  </option>
                ))}
              </select>
            </label>
          )}
          {lectura.hojas.length > 1 && (
            <label className="flex flex-col gap-1 sm:max-w-xs">
              <span className={labelClass}>Hoja</span>
              <select
                className={fieldClass}
                value={lectura.hoja}
                disabled={paso.tipo === "cargando"}
                onChange={(e) => libro && leerHoja(libro, lectura.archivo, e.target.value, lectura.hojas)}
              >
                {lectura.hojas.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          )}

          <MarcoAF4
            id="titulo-revision"
            titulo={lectura.resumen?.origen ?? lectura.archivo}
            detalle={`Hoja «${lectura.hoja}»${entidad && entidades.length > 1 ? ` · ${entidad.razon_social}` : ""} · ${monedaLibro}`}
            sinRelleno
          >
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
              <Dato titulo="Movimientos" valor={lectura.movimientos.length} />
              <Dato titulo="Nuevos" valor={lectura.resumen?.nuevos ?? 0} />
              <Dato titulo="Se actualizan" valor={lectura.resumen?.actualizan ?? 0} />
              <Dato titulo="Se borran" valor={lectura.resumen?.borran ?? 0} alerta={(lectura.resumen?.borran ?? 0) > 0} />
              <Dato titulo="Filas descartadas" valor={lectura.descartadas.length} detalle={motivos.map(([m, n]) => `${n} ${m}`).join(" · ")} />
              <Dato titulo="Base de reparto" valor={lectura.base.length} detalle={lectura.base.length ? "tienda × mes, de la hoja EERR" : "sin hoja EERR"} />
            </dl>

            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Movimientos por mes</caption>
                <thead>
                  <tr className={claseFilaEncabezado}>
                    <th scope="col" className={`${claseEncabezadoColumna} text-left`}>Mes</th>
                    <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Movimientos</th>
                    <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Al EERR</th>
                    <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Monto al EERR</th>
                    <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Sin tienda</th>
                  </tr>
                </thead>
                <tbody>
                  {porMes.map(([mes, x]) => (
                    <tr key={mes} className="border-t border-border/60">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal">{mesCorto(mes)}</th>
                      <td className={`px-4 py-1.5 text-right ${claseCifra}`}>{entero(x.filas)}</td>
                      <td className={`px-4 py-1.5 text-right ${claseCifra}`}>{entero(x.eerr)}</td>
                      <td className={`px-4 py-1.5 text-right ${claseCifra}`}>{dinero(x.monto, monedaLibro)}</td>
                      <td className={`px-4 py-1.5 text-right ${claseCifra} ${x.sinTienda ? "" : "text-muted-foreground"}`}>
                        {x.sinTienda ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                            {entero(x.sinTienda)}
                          </span>
                        ) : (
                          SIN_DATO
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MarcoAF4>

          {paso.tipo === "revisar" && (
            <ComparacionImportacion key={`${lectura.archivo}-${lectura.hoja}-${codigo}`} comparar={() => compararConCargado(lectura.archivo, lectura.movimientos)} moneda={monedaLibro} />
          )}

          {paso.tipo === "cargando" ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <ProgresoCarga mensaje={`Cargando ${entero(paso.hechos)} de ${entero(lectura.movimientos.length)}…`} />
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full bg-foreground transition-[width]" style={{ width: `${(100 * paso.hechos) / Math.max(lectura.movimientos.length, 1)}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={cargar} disabled={!lectura.movimientos.length}>
                Cargar al portal
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setLectura(null); setPaso({ tipo: "elegir" }); }}>
                Cancelar
              </Button>
            </div>
          )}
        </>
      )}

      {paso.tipo === "listo" && lectura && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            Libro cargado: {entero(lectura.movimientos.length)} movimientos
            {paso.borrados ? `, ${entero(paso.borrados)} borrados` : ""}
            {paso.base ? `, base de reparto de ${paso.base} filas` : ""}.
          </p>
          {(paso.sinTipo > 0 || paso.rechazados > 0 || paso.tiendasNuevas.length > 0 || paso.conservados > 0 || paso.porRegla > 0 || paso.enMesCerrado > 0 || paso.sinTasa > 0) && (
            <ul className="flex flex-col gap-1 text-muted-foreground">
              {paso.sinTasa > 0 && (
                <li>
                  {entero(paso.sinTasa)} sin tipo de cambio de su mes: no entran al EERR hasta cargarlo en{" "}
                  <Link href="/estado-resultados/tipos-cambio" className="underline">Tipos de cambio</Link>.
                </li>
              )}
              {paso.porRegla > 0 && <li>{entero(paso.porRegla)} completados por una regla.</li>}
              {paso.conservados > 0 && <li>{entero(paso.conservados)} corregidos a mano en el portal: se dejaron como estaban.</li>}
              {paso.sinTipo > 0 && (
                <li>
                  {entero(paso.sinTipo)} sin tipo: no entran al EERR hasta clasificarlos en{" "}
                  <Link href="/libro-movimientos/pendientes" className="underline">Por clasificar</Link>.
                </li>
              )}
              {paso.rechazados > 0 && <li>{entero(paso.rechazados)} filas rechazadas por datos inválidos.</li>}
              {paso.enMesCerrado > 0 && (
                <li>
                  {entero(paso.enMesCerrado)} de meses cerrados: no se tocaron (ver{" "}
                  <Link href="/cierre-mes" className="underline">Cierre de mes</Link>).
                </li>
              )}
              {paso.tiendasNuevas.length > 0 && <li>Tiendas nuevas: {paso.tiendasNuevas.join(", ")}.</li>}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <Link href="/estado-resultados" className={`rounded-md bg-foreground px-3 py-1.5 font-medium text-background ${anilloFoco}`}>
              Ver Estado de resultados
            </Link>
            <Link href="/libro-movimientos" className={`rounded-md border border-border px-3 py-1.5 ${anilloFoco}`}>
              Ver movimientos
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
      <dd className={`text-lg font-semibold ${claseCifra}`}>{entero(valor)}</dd>
      {detalle && <dd className="text-xs text-muted-foreground">{detalle}</dd>}
    </div>
  );
}
