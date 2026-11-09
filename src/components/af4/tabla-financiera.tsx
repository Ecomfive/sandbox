"use client";

import { useState, type ReactNode } from "react";
import { ContenedorTabla, type CeldaFija } from "@/components/tabla/contenedor-tabla";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { anilloFoco } from "@/components/ui/field";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { dinero, porcentaje, type Moneda } from "@/lib/af4/formato";
import {
  filasVisibles,
  marcaNegativo,
  seccionesConDetalle,
  sobreBase,
  totalFila,
  type ColumnaAF4,
  type FilaAF4,
  type TipoFilaAF4,
} from "@/lib/af4/tabla-financiera";
import { CLASE_FILA_AF4, FONDO_FILA_AF4, claseAccionAF4, claseCeldaAF4, claseNumeroAF4, claseSigno } from "./estilos-af4";
import { MarcoAF4 } from "./marco-af4";

// Cada tipo de fila tiene su peso: los resultados con filete más marcado, el total final con doble filete contable.
const CLASE_FILA: Record<TipoFilaAF4, string> = CLASE_FILA_AF4;
// El fondo de la fila también va en la celda fija de la izquierda (opaco, para que no se vea lo que pasa por debajo).
const FONDO: Record<TipoFilaAF4, string> = FONDO_FILA_AF4;

const celda = claseCeldaAF4;
const numero = claseNumeroAF4;

/**
 * Dibuja una celda a medida (un monto que se edita en su sitio). `columna` es el índice de la columna o null para la
 * columna Total; `texto` es lo que la tabla mostraría. Devuelve undefined para dejar la celda como siempre.
 */
export type CeldaAF4 = (fila: FilaAF4, columna: number | null, texto: string) => ReactNode | undefined;

/**
 * La tabla financiera del Portal AF4 360°: estado de resultados, cascada, flujo, presupuesto o proyección. Conceptos en
 * filas (grupo, sección con su detalle plegable, subtotales, total con doble filete, márgenes %, saldos) y períodos en
 * columnas, más el total. La columna de conceptos queda fija al desplazarse de lado y el encabezado queda fijo al bajar.
 * Un negativo lleva el signo menos y, solo en los resultados, el rojo del tema. «% s/ventas» agrega bajo cada monto su
 * peso sobre las ventas de esa columna.
 */
export function TablaFinanciera({
  id,
  titulo,
  detalle,
  columnas,
  filas,
  moneda = "USD",
  ariaLabel,
  etiquetaConcepto = "Concepto",
  conTotal = true,
  ventas,
  desplegado = "todo",
  accion,
  etiquetaTotal = "Total",
  celdaPropia,
  textoDesplegar,
}: {
  id: string;
  titulo: string;
  detalle?: ReactNode;
  columnas: ColumnaAF4[];
  filas: FilaAF4[];
  moneda?: Moneda;
  ariaLabel: string;
  etiquetaConcepto?: string;
  conTotal?: boolean;
  /** Las ventas de cada columna: habilita el botón «% s/ventas». */
  ventas?: (number | null)[];
  /** Cómo arranca el detalle de las secciones. */
  desplegado?: "todo" | "nada";
  /** Acción a la derecha de la franja (la descarga). */
  accion?: ReactNode;
  /** El encabezado de la última columna («Terminal» en un DCF). */
  etiquetaTotal?: string;
  /** Una celda a medida (edición en su sitio); sin ella, todas son texto. */
  celdaPropia?: CeldaAF4;
  /** Para lectores de pantalla, lo que abre una sección («tipos»): «Costo de ventas, ver tipos». */
  textoDesplegar?: string;
}) {
  const conDetalle = seccionesConDetalle(filas);
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(desplegado === "todo" ? conDetalle : []));
  const [conPct, setConPct] = useState(false);
  const todoAbierto = conDetalle.length > 0 && conDetalle.every((c) => abiertas.has(c));
  const ventasTotal = ventas ? ventas.reduce<number>((a, v) => a + (v ?? 0), 0) : null;
  const alternar = (clave: string) =>
    setAbiertas((a) => {
      const b = new Set(a);
      if (b.has(clave)) b.delete(clave);
      else b.add(clave);
      return b;
    });

  const texto = (f: FilaAF4, v: number | null | undefined) =>
    v === null || v === undefined ? "" : f.tipo === "porcentaje" ? porcentaje(v) : dinero(v, moneda, { vacioSiCero: true });
  const pctDe = (f: FilaAF4, v: number | null | undefined, base: number | null | undefined) =>
    conPct && f.tipo !== "porcentaje" && v !== null && v !== undefined && Math.abs(v) >= 0.005 ? sobreBase(v, base) : null;

  const encabezado: CeldaFija[] = [
    { contenido: etiquetaConcepto, clase: `${claseEncabezadoColumna} text-left` },
    ...columnas.map((c) => ({ contenido: c.etiqueta, clase: `${claseEncabezadoColumna} text-right` })),
    ...(conTotal ? [{ contenido: etiquetaTotal, clase: `${claseEncabezadoColumna} text-right` }] : []),
  ];

  const botones = (
    <>
      {ventas && (
        <button type="button" aria-pressed={conPct} onClick={() => setConPct((x) => !x)} className={`${claseAccionAF4} h-7 ${anilloFoco} ${conPct ? "!border-foreground !bg-foreground !text-background" : ""}`}>
          % s/ventas
        </button>
      )}
      {conDetalle.length > 0 && (
        <button type="button" onClick={() => setAbiertas(todoAbierto ? new Set() : new Set(conDetalle))} className={`${claseAccionAF4} h-7 ${anilloFoco}`}>
          {todoAbierto ? "Contraer detalle" : "Ver detalle"}
        </button>
      )}
      {accion}
    </>
  );

  return (
    <MarcoAF4 id={id} titulo={titulo} detalle={detalle} accion={botones} sinRelleno>
      <ContenedorTabla ariaLabel={ariaLabel} encabezadoFijo={encabezado}>
        <table className="tabla-datos w-full text-[13px]">
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={`${claseEncabezadoColumna} sticky left-0 z-10 bg-muted text-left`}>
                {etiquetaConcepto}
              </th>
              {columnas.map((c) => (
                <th key={c.clave} scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                  <span className="inline-flex items-center justify-end gap-1.5">
                    {c.marca && (
                      <span
                        role="img"
                        aria-label={c.marca.texto}
                        className={`h-2 w-2 shrink-0 rounded-full ${c.marca.tono === "destructive" ? "bg-destructive" : "bg-warning"}`}
                      />
                    )}
                    {c.etiqueta}
                  </span>
                  {c.detalle && <span className="block font-normal tracking-normal normal-case">{c.detalle}</span>}
                </th>
              ))}
              {conTotal && (
                <th scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                  {etiquetaTotal}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filasVisibles(filas, abiertas).map((f, n) => {
              const tot = totalFila(f);
              const desplegable = f.tipo === "seccion" && conDetalle.includes(f.clave);
              const abierta = abiertas.has(f.clave);
              const rojo = (v: number | null | undefined) => (marcaNegativo(f) ? claseSigno(v) : "");
              return (
                // Con el orden en la llave: dos detalles con el mismo nombre (dos pagos iguales en la proyección) repetían la llave.
                <tr key={`${n}-${f.clave}`} className={`${CLASE_FILA[f.tipo]} ${FONDO[f.tipo]}`}>
                  <th
                    scope="row"
                    className={`${celda} sticky left-0 z-10 max-w-80 text-left font-[inherit] ${FONDO[f.tipo]} ${
                      f.tipo === "detalle" ? "pl-10" : f.tipo === "porcentaje" ? "pl-6" : ""
                    }`}
                  >
                    {desplegable ? (
                      <button type="button" onClick={() => alternar(f.clave)} aria-expanded={abierta} className={`inline-flex items-center gap-1.5 text-left ${anilloFoco}`}>
                        <ChevronRightIcon
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${abierta ? "rotate-90" : ""}`}
                        />
                        <span className="truncate">{f.etiqueta}</span>
                        {textoDesplegar && <span className="sr-only">{abierta ? `, ocultar ${textoDesplegar}` : `, ver ${textoDesplegar}`}</span>}
                      </button>
                    ) : (
                      <span className={`block truncate ${f.tipo === "seccion" && conDetalle.length ? "pl-5" : ""}`}>{f.etiqueta}</span>
                    )}
                  </th>
                  {columnas.map((c, i) => {
                    const v = f.valores[i];
                    const p = pctDe(f, v, ventas?.[i]);
                    const propia = celdaPropia?.(f, i, texto(f, v));
                    return (
                      <td key={c.clave} className={`${numero} ${rojo(v)}`}>
                        {propia === undefined ? texto(f, v) : propia}
                        {p !== null && <span className="block text-[11px] font-normal text-muted-foreground not-italic">{porcentaje(p)}</span>}
                      </td>
                    );
                  })}
                  {conTotal && (
                    <td className={`${numero} bg-muted/40 font-medium ${rojo(tot)}`}>
                      {(() => {
                        const propia = celdaPropia?.(f, null, texto(f, tot));
                        return propia === undefined ? texto(f, tot) : propia;
                      })()}
                      {(() => {
                        const p = pctDe(f, tot, ventasTotal);
                        return p !== null ? <span className="block text-[11px] font-normal text-muted-foreground">{porcentaje(p)}</span> : null;
                      })()}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ContenedorTabla>
    </MarcoAF4>
  );
}
