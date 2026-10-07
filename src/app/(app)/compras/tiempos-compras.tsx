"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CabeceraTarjeta, MarcoTabla, Punto, Segmentado, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { formatearFecha } from "@/lib/formato";
import { etiquetaEstado, etiquetaEtapa, etiquetaVia, type FilaCompra } from "./def-compras";
import { diasEntre, entero, estaAbierta, hoy, paraRevisar, porDimension, tiempoEnEstados, tiemposPorTramo, umbralesTransito, usd } from "./calculos-compras";
import { SelectorVista } from "./selector-vista";

type Evento = { compraId: string; campo: string; valor: string | null; ocurridoEn: string };
type Dimension = "proveedor" | "via" | "pais" | "tienda" | "responsable";

const DIMENSIONES: { valor: Dimension; etiqueta: string }[] = [
  { valor: "proveedor", etiqueta: "Proveedor" },
  { valor: "via", etiqueta: "Vía" },
  { valor: "pais", etiqueta: "País" },
  { valor: "tienda", etiqueta: "Tienda" },
  { valor: "responsable", etiqueta: "Responsable" },
];
const CLAVE: Record<Dimension, (c: FilaCompra) => string[]> = {
  proveedor: (c) => [c.proveedor ?? "Sin proveedor"],
  via: (c) => (c.viaEnvio.length ? c.viaEnvio.map(etiquetaVia) : ["Sin vía"]),
  pais: (c) => [c.paisCodigo ?? "Importadora"],
  tienda: (c) => (c.tiendas.length ? c.tiendas : ["Sin tienda"]),
  responsable: (c) => [c.asignadoNombre ?? "Sin responsable"],
};

const dias = (n: number | null) => (n === null ? "—" : `${n} d`);

/**
 * Tiempos y fallas de Compras: cuánto tarda cada tramo (con las fechas de cada compra), cuánto se queda una compra en
 * cada estado (con el historial de ClickUp y lo que se cambie aquí), una comparación por proveedor, vía, país, tienda o
 * responsable, y la lista de lo que está fallando hoy: atrasadas, inconvenientes y descartadas.
 */
export function TiemposCompras({
  compras,
  eventos,
  vista,
  paises,
}: {
  compras: FilaCompra[];
  eventos: Evento[];
  vista: string;
  paises: { codigo: string; nombre: string }[];
}) {
  const [dimension, setDimension] = useState<Dimension>("proveedor");
  const tramos = useMemo(() => tiemposPorTramo(compras), [compras]);
  const estados = useMemo(() => tiempoEnEstados(eventos, compras, "estado"), [eventos, compras]);
  const etapas = useMemo(() => tiempoEnEstados(eventos, compras, "etapa"), [eventos, compras]);
  const filas = useMemo(() => porDimension(compras, CLAVE[dimension]), [compras, dimension]);
  const umbral = useMemo(() => umbralesTransito(compras), [compras]);
  const revisar = useMemo(() => paraRevisar(compras, umbral), [compras, umbral]);
  const descartadas = compras.filter((c) => c.etapa === "descartado");
  const dia = hoy();
  const ver = vista === "todos" ? "" : `?ver=${vista}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SelectorVista vista={vista} paises={paises} />
        <span className="text-xs text-muted-foreground">
          {entero(compras.length)} compras · {entero(compras.filter(estaAbierta).length)} abiertas
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[960px]:grid-cols-2">
        <section aria-labelledby="t-tramos" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="t-tramos" titulo="Tiempo por tramo">
            <span className="text-xs text-muted-foreground">según las fechas de cada compra</span>
          </CabeceraTarjeta>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={claseTh}>Tramo</th>
                <th className={`${claseTh} text-right`}>Mediana</th>
                <th className={`${claseTh} text-right`}>9 de 10</th>
                <th className={`${claseTh} text-right`}>Compras</th>
              </tr>
            </thead>
            <tbody>
              {tramos.map((t) => (
                <tr key={t.id}>
                  <td className={claseTd}>{t.nombre}</td>
                  <td className={`${claseTd} text-right font-medium tabular-nums`}>{dias(t.mediana)}</td>
                  <td className={`${claseTd} text-right tabular-nums`}>{dias(t.p90)}</td>
                  <td className={`${claseTd} text-right text-muted-foreground tabular-nums`}>{t.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="t-estados" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="t-estados" titulo="Tiempo en cada estado">
            <span className="text-xs text-muted-foreground">historial de ClickUp y del sistema</span>
          </CabeceraTarjeta>
          {estados.length === 0 && etapas.length === 0 ? (
            <p className="px-3.5 py-6 text-sm text-muted-foreground">Sin historial todavía.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={claseTh}>Estado o etapa</th>
                  <th className={`${claseTh} text-right`}>Mediana</th>
                  <th className={`${claseTh} text-right`}>9 de 10</th>
                  <th className={`${claseTh} text-right`}>Veces</th>
                </tr>
              </thead>
              <tbody>
                {[...etapas.map((e) => ({ ...e, nombre: `👣 ${etiquetaEtapa(e.valor)}` })), ...estados.map((e) => ({ ...e, nombre: etiquetaEstado(e.valor) }))].map((e) => (
                  <tr key={e.nombre}>
                    <td className={claseTd}>{e.nombre}</td>
                    <td className={`${claseTd} text-right font-medium tabular-nums`}>{dias(e.mediana)}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{dias(e.p90)}</td>
                    <td className={`${claseTd} text-right text-muted-foreground tabular-nums`}>{e.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section aria-labelledby="t-dim" className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 id="t-dim" className="text-[15px] font-semibold tracking-tight">
            Comparar por
          </h2>
          <Segmentado etiqueta="Comparar por" valor={dimension} alCambiar={setDimension} opciones={DIMENSIONES} />
        </div>
        <MarcoTabla ariaLabel="Comparación de tiempos y fallas">
          <table className="w-full min-w-[48rem] border-collapse">
            <thead>
              <tr>
                <th className={claseTh}>{DIMENSIONES.find((d) => d.valor === dimension)?.etiqueta}</th>
                <th className={`${claseTh} text-right`}>Compras</th>
                <th className={`${claseTh} text-right`}>Abiertas</th>
                <th className={`${claseTh} text-right`}>Ciclo (mediana)</th>
                <th className={`${claseTh} text-right`}>Tránsito (mediana)</th>
                <th className={`${claseTh} text-right`}>Inconvenientes</th>
                <th className={`${claseTh} text-right`}>Descartadas</th>
                <th className={`${claseTh} text-right`}>Pagado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.nombre}>
                  <td className={`${claseTd} font-medium`}>{f.nombre}</td>
                  <td className={`${claseTd} text-right tabular-nums`}>{f.compras}</td>
                  <td className={`${claseTd} text-right tabular-nums`}>{f.abiertas}</td>
                  <td className={`${claseTd} text-right tabular-nums`}>{dias(f.ciclo)}</td>
                  <td className={`${claseTd} text-right tabular-nums`}>{dias(f.transito)}</td>
                  <td className={`${claseTd} text-right tabular-nums`}>{f.inconvenientes || "—"}</td>
                  <td className={`${claseTd} text-right tabular-nums`}>{f.descartadas || "—"}</td>
                  <td className={`${claseTd} text-right tabular-nums`}>{usd(f.pagado, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </MarcoTabla>
      </section>

      <div className="grid grid-cols-1 gap-5 min-[960px]:grid-cols-2">
        <section aria-labelledby="t-atrasadas" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="t-atrasadas" titulo={`Atrasadas en tránsito (${revisar.atrasadas.length})`}>
            <Link href={`/compras/lista${ver}${ver ? "&" : "?"}grupo=atrasadas`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Ver en la lista
            </Link>
          </CabeceraTarjeta>
          <ul className="m-0 flex list-none flex-col p-0 text-[13px]">
            {revisar.atrasadas.length === 0 && <li className="px-3.5 py-3 text-muted-foreground">Ninguna.</li>}
            {revisar.atrasadas.slice(0, 12).map((c) => (
              <li key={c.id} className="flex items-center gap-2 border-b border-border px-3.5 py-2 last:border-b-0">
                <Punto tono="peligro" />
                <span className="min-w-0 flex-1 truncate">
                  {c.codigo ? `${c.codigo} · ` : ""}
                  {c.nombre}
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {c.viaEnvio.map(etiquetaVia).join(", ") || "—"} · {diasEntre(c.fechaEnvio, dia)} d
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="t-fallas" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="t-fallas" titulo={`Inconvenientes y descartadas (${revisar.conInconveniente.length + descartadas.length})`} />
          <ul className="m-0 flex list-none flex-col p-0 text-[13px]">
            {[...compras.filter((c) => !!c.inconveniente), ...descartadas].slice(0, 14).map((c) => (
              <li key={c.id} className="flex flex-col border-b border-border px-3.5 py-2 last:border-b-0">
                <span className="flex items-center gap-2">
                  <Punto tono={c.etapa === "descartado" ? "gris" : "aviso"} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {c.codigo ? `${c.codigo} · ` : ""}
                    {c.nombre}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatearFecha(c.creadoEn)}</span>
                </span>
                <span className="pl-4 text-xs text-muted-foreground">{c.inconveniente ? `🚨 ${c.inconveniente}` : "Descartada"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
