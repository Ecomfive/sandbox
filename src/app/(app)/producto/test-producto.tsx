"use client";

import Link from "next/link";
import { formatearFecha } from "@/lib/formato";
import { colorEstado, etiquetaEstado, etiquetaTestNumero } from "../productos-test/def-productos-test";
import { CPA_OBJETIVO, porcentaje, usd } from "../productos-test/informe";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import type { FilaProducto } from "./def-producto";

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
 * La celda «Test» de la lista de Producto: si el producto pasó por Test productos dice cómo le fue (el más reciente) y, al
 * pasar el cursor, muestra los datos de cada test (país, fecha, gasto, compras, CPA, CTR, hook y CVR).
 */
export function CeldaTestProducto({ producto }: { producto: FilaProducto }) {
  const tests = producto.tests;
  if (!tests.length) return <span className="text-muted-foreground">—</span>;
  return (
    <TarjetaEmergente ancho="20rem" contenido={<DatosTest producto={producto} />}>
      <span className="inline-flex cursor-default items-center gap-1 underline decoration-dotted decoration-border-control underline-offset-4">
        <EstadoTest estado={tests[0].estado} />
        {tests.length > 1 && <span className="text-xs text-muted-foreground">+{tests.length - 1}</span>}
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
