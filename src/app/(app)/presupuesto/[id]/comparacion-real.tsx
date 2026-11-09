"use client";

import { useState } from "react";
import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { TablaComparacionAF4, type FilaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { Variacion } from "@/components/af4/variacion";
import { anilloFoco } from "@/components/ui/field";
import { mesCorto, mesMedio, rangoMeses } from "@/lib/af4/fecha";
import { dinero, porcentaje } from "@/lib/af4/formato";
import { calcularVariacion } from "@/lib/af4/variacion";
import type { Seccion } from "@/lib/finanzas/eerr";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { esSeccion, type Comparacion, type ComparacionTipo, type FilaComparacion } from "@/lib/finanzas/presupuesto";

/** Las cuatro celdas de una comparación: real, presupuesto, diferencia (con su punto: favorable o no) y %. */
function celdas(c: Comparacion, contra: string) {
  return [
    dinero(c.real),
    dinero(c.presupuesto),
    // La dirección sale de la diferencia; el juicio (en costos, gastar menos es favorable) lo trae el cálculo.
    <Variacion key="d" enCelda modo="dinero" contra={contra} v={{ ...calcularVariacion(c.real, c.presupuesto), favorable: c.favorable }} />,
    c.pct === null ? "—" : porcentaje(c.pct, { conSigno: true }),
  ];
}

const COLUMNAS = ["Real", "Presupuesto", "Diferencia", "%"];

/**
 * Presupuesto vs real: el mes elegido (de los meses cerrados con real) y el acumulado del año hasta el último de ellos.
 * Las secciones con detalle por tipo se abren para ver cada tipo contra lo presupuestado.
 */
export function ComparacionReal({
  filas,
  tipos,
  nombresTipo,
  meses,
  mes,
  hrefs,
}: {
  filas: FilaComparacion[];
  tipos: Partial<Record<Seccion, ComparacionTipo[]>>;
  nombresTipo: Record<string, string>;
  meses: string[];
  mes: string;
  /** El enlace de cada mes de la comparación. */
  hrefs: Record<string, string>;
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const alternar = (s: string) =>
    setAbiertas((a) => {
      const n = new Set(a);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  const acumulado = `Acumulado ${rangoMeses(meses)}`;
  const hayDetalle = filas.some((f) => esSeccion(f.concepto) && (tipos[f.concepto]?.length ?? 0) > 0);

  const filasTabla: FilaComparacionAF4[] = [];
  for (const f of filas) {
    const detalle = esSeccion(f.concepto) ? tipos[f.concepto] : undefined;
    const abierta = abiertas.has(f.concepto);
    filasTabla.push({
      clave: f.concepto,
      peso: f.concepto === "resultado" ? "total" : f.resultado ? "subtotal" : "seccion",
      etiqueta: detalle?.length ? (
        <button type="button" aria-expanded={abierta} onClick={() => alternar(f.concepto)} className={`inline-flex items-center gap-1.5 text-left ${anilloFoco}`}>
          <ChevronRightIcon
            aria-hidden="true"
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${abierta ? "rotate-90" : ""}`}
          />
          {f.etiqueta}
          <span className="sr-only">{abierta ? ", ocultar tipos" : ", ver tipos"}</span>
        </button>
      ) : (
        <span className={hayDetalle ? "pl-5" : ""}>{f.etiqueta}</span>
      ),
      celdas: [...celdas(f.meses[mes], "presupuesto del mes"), ...celdas(f.acumulado, "presupuesto acumulado")],
    });
    if (detalle && abierta) {
      for (const t of detalle) {
        filasTabla.push({
          clave: `${f.concepto}::${t.tipo_id ?? "otros"}`,
          peso: "detalle",
          etiqueta: <span>{t.tipo_id === null ? `Otros de ${f.etiqueta.toLowerCase()}` : (nombresTipo[t.tipo_id] ?? "Tipo")}</span>,
          celdas: [...celdas(t.meses[mes], "presupuesto del mes"), ...celdas(t.acumulado, "presupuesto acumulado")],
        });
      }
    }
  }

  return (
    <TablaComparacionAF4
      id="titulo-vs-real"
      titulo="Presupuesto vs real"
      detalle="USD"
      ariaLabel="Presupuesto contra real, del mes y acumulado"
      accion={
        <SelectorEnlace
          etiqueta="Mes de la comparación"
          opciones={[...meses].reverse().map((m) => ({ valor: m, etiqueta: mesMedio(m), href: hrefs[m] }))}
          elegido={mes}
        />
      }
      grupos={[
        { etiqueta: mesCorto(mes), columnas: 4 },
        { etiqueta: acumulado, columnas: 4 },
      ]}
      columnas={[...COLUMNAS, ...COLUMNAS].map((c, i) => ({ clave: `${i}`, etiqueta: c, atenuada: c === "Presupuesto" }))}
      filas={filasTabla}
    />
  );
}
