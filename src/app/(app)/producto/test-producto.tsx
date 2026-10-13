"use client";

import Link from "next/link";
import { formatearFecha } from "@/lib/formato";
import { colorEstado, etiquetaEstado, etiquetaTestNumero } from "../productos-test/def-productos-test";
import { CPA_OBJETIVO, porcentaje, usd } from "../productos-test/informe";
import { Medida } from "../productos-test/ficha-lateral-test";
import { Punto } from "@/components/panel/piezas-panel";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import type { FilaProducto, ReferenciasTest } from "./def-producto";

/** El estado del test con su punto de color (los colores de Test productos). */
function EstadoTest({ estado }: { estado: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorEstado(estado) }} />
      {etiquetaEstado(estado)}
    </span>
  );
}

const dato = (v: number | null, f: (n: number) => string) => (v === null ? "—" : f(v));

/**
 * La celda «Test» de la lista de Producto: si el producto pasó por Test productos dice «Test» y, al pasar el cursor, muestra
 * cómo le fue y los datos de cada test (país, fecha, gasto, compras, CPA, CTR, hook y CVR).
 */
export function CeldaTestProducto({ producto }: { producto: FilaProducto }) {
  const tests = producto.tests;
  if (!tests.length) return <span className="text-muted-foreground">—</span>;
  return (
    <TarjetaEmergente ancho="20rem" contenido={<DatosTest producto={producto} />}>
      {/* Todos los que vienen de Test productos dicen «Test»; el resultado y las métricas salen al pasar el cursor. */}
      <span className="inline-flex cursor-default items-center gap-1 underline decoration-dotted decoration-border-control underline-offset-4">
        Test
        {tests.length > 1 && <span className="text-xs text-muted-foreground">×{tests.length}</span>}
      </span>
    </TarjetaEmergente>
  );
}

function DatosTest({ producto }: { producto: FilaProducto }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-semibold">
        {producto.tests.length === 1 ? "Su test" : `Sus ${producto.tests.length} tests`}
      </span>
      {producto.tests.map((t) => (
        <div key={t.id} className="flex flex-col gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
          <div className="flex items-center justify-between gap-2 text-xs">
            <EstadoTest estado={t.estado} />
            <span className="text-muted-foreground">
              {[t.pais, etiquetaTestNumero(t.testNumero), t.fechaTest ? formatearFecha(t.fechaTest) : null].filter(Boolean).join(" · ")}
            </span>
          </div>
          <dl className="m-0 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
            <div>
              <dt className="text-muted-foreground">Gasto</dt>
              <dd className="m-0 font-semibold tabular-nums">{dato(t.gasto, (n) => usd(n))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Compras</dt>
              <dd className="m-0 font-semibold tabular-nums">{dato(t.compras, (n) => n.toLocaleString("es-PA"))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">CPA</dt>
              <dd className={`m-0 font-semibold tabular-nums ${t.cpa === null ? "" : t.cpa < CPA_OBJETIVO ? "text-success" : "text-destructive"}`}>{dato(t.cpa, (n) => usd(n))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">CTR</dt>
              <dd className="m-0 font-semibold tabular-nums">{dato(t.ctr, (n) => porcentaje(n))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Hook</dt>
              <dd className="m-0 font-semibold tabular-nums">{dato(t.hook, (n) => porcentaje(n))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">CVR</dt>
              <dd className="m-0 font-semibold tabular-nums">{dato(t.cvr, (n) => porcentaje(n))}</dd>
            </div>
          </dl>
        </div>
      ))}
      <Link href={`/productos-test/productos?buscar=${encodeURIComponent(producto.tests[0].nombre)}`} className="text-xs font-medium text-primario hover:underline">
        Ver en Test productos
      </Link>
    </div>
  );
}

/**
 * «Resultado del test» en la ficha del producto (si salió de Test productos): por cada test, si cumple el criterio (CPA menor
 * a $4) y las barras de CPA, compras, CTR, hook y CVR con la misma marca negra de Test productos (el criterio o el promedio
 * de los winners).
 */
export function ResultadoTestProducto({ producto, referencias }: { producto: FilaProducto; referencias: ReferenciasTest }) {
  return (
    <div className="flex flex-col gap-4">
      {producto.tests.map((t) => {
        const cumple = t.cpa === null ? null : t.cpa < CPA_OBJETIVO;
        return (
          <div key={t.id} className="flex flex-col">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <EstadoTest estado={t.estado} />
              <span className="text-muted-foreground">
                {[t.pais, etiquetaTestNumero(t.testNumero), t.fechaTest ? formatearFecha(t.fechaTest) : null, t.gasto === null ? null : `gasto ${usd(t.gasto)}`].filter(Boolean).join(" · ")}
              </span>
            </div>
            <p className="mb-2.5 flex items-start gap-1.5 text-[13px]">
              <Punto tono={cumple === null ? "gris" : cumple ? "exito" : "peligro"} className="mt-1.5" />
              <span>
                {cumple === null
                  ? "Falta el CPA para evaluar el criterio."
                  : cumple
                    ? `Cumple el criterio: CPA ${usd(t.cpa ?? 0)}, menor a ${usd(CPA_OBJETIVO)}.`
                    : `No cumple: CPA ${usd(t.cpa ?? 0)}, no es menor a ${usd(CPA_OBJETIVO)}.`}
              </span>
            </p>
            <Medida nombre="CPA" valor={t.cpa} maximo={20} referencia={CPA_OBJETIVO} texto={t.cpa === null ? "—" : usd(t.cpa)} textoReferencia={`Criterio: menos de ${usd(CPA_OBJETIVO)}`} />
            <Medida nombre="Compras" valor={t.compras} maximo={12} referencia={referencias.compras} texto={t.compras === null ? "—" : String(t.compras)} textoReferencia={referencias.compras === null ? undefined : `Promedio de los winners: ${referencias.compras!.toLocaleString("es-CR", { maximumFractionDigits: 1 })}`} />
            <Medida nombre="CTR" valor={t.ctr} maximo={10} referencia={referencias.ctr} texto={t.ctr === null ? "—" : porcentaje(t.ctr)} textoReferencia={referencias.ctr === null ? undefined : `Promedio de los winners: ${porcentaje(referencias.ctr!)}`} />
            <Medida nombre="Hook rate" valor={t.hook} maximo={80} referencia={referencias.hook} texto={t.hook === null ? "—" : porcentaje(t.hook)} textoReferencia={referencias.hook === null ? undefined : `Promedio de los winners: ${porcentaje(referencias.hook!)}`} />
            <Medida nombre="CVR" valor={t.cvr} maximo={20} referencia={referencias.cvr} texto={t.cvr === null ? "—" : porcentaje(t.cvr)} textoReferencia={referencias.cvr === null ? undefined : `Promedio de los winners: ${porcentaje(referencias.cvr!)}`} />
          </div>
        );
      })}
      <p className="m-0 text-xs text-muted-foreground">
        La marca negra es el criterio (CPA) o el promedio de los winners (compras, CTR, Hook y CVR).{" "}
        <Link href={`/productos-test/productos?buscar=${encodeURIComponent(producto.tests[0].nombre)}`} className="font-medium text-primario hover:underline">
          Ver en Test productos
        </Link>
      </p>
    </div>
  );
}
