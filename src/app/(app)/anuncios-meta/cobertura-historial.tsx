"use client";

import { useEffect, useState } from "react";
import { coberturaDe, mesesCubiertos, nombreCortoDeMes, type EstadoMes, type MesCubierto } from "@/lib/meta-ads/cobertura";
import { coberturaMeta } from "./actions";

const MESES = 13;
const SIMBOLO: Record<EstadoMes, { marca: string; clase: string; texto: string }> = {
  completo: { marca: "●", clase: "text-success", texto: "completo" },
  parcial: { marca: "◐", clase: "text-warning", texto: "parcial o sin registro" },
  sin_leer: { marca: "○", clase: "text-muted-foreground", texto: "sin leer" },
};

interface FilaCuenta {
  id: string;
  nombre: string;
  meses: MesCubierto[];
  desde: string | null;
}

/**
 * Qué meses de cada cuenta ya se trajeron de Meta (20 nov 2026, pedido de Jhokser: poder comprobar que el historial llegó completo en cada cuenta). Un mes está «completo» cuando todas sus fechas están dentro
 * de una lectura registrada; «parcial» si falta algo o se leyó antes del registro (entonces solo se ven los días con resultados); «sin leer» si no hay nada.
 */
export function CoberturaHistorial({ hoy, version }: { hoy: string; version: number }) {
  const [filas, setFilas] = useState<FilaCuenta[] | "cargando" | { error: string }>("cargando");
  useEffect(() => {
    let vigente = true;
    coberturaMeta()
      .then((r) => {
        if (!vigente) return;
        if (r.error || !r.cuentas) return setFilas({ error: r.error ?? "No se pudo revisar lo que ya se trajo." });
        setFilas(
          r.cuentas.map((c) => {
            const cobertura = coberturaDe(c.bruta);
            const primero = [...cobertura.conDatos].sort()[0] ?? null;
            return { id: c.id, nombre: c.nombre, meses: mesesCubiertos(cobertura, hoy, MESES).reverse(), desde: primero };
          }),
        );
      })
      .catch(() => vigente && setFilas({ error: "No se pudo revisar lo que ya se trajo." }));
    return () => {
      vigente = false;
    };
  }, [hoy, version]);

  if (filas === "cargando") return <p className="m-0 text-xs text-muted-foreground">Revisando lo que ya se trajo…</p>;
  if ("error" in filas) return <p className="m-0 text-xs text-destructive">{filas.error}</p>;
  if (!filas.length) return null;
  const encabezados = filas[0].meses;
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <caption className="sr-only">Meses traídos de Meta por cuenta, de los últimos {MESES} meses</caption>
          <thead>
            <tr className="bg-muted text-left">
              <th scope="col" className="px-3 py-2 font-medium">
                Cuenta
              </th>
              {encabezados.map((m) => (
                <th key={m.mes} scope="col" className="px-1.5 py-2 text-center font-medium whitespace-nowrap">
                  {nombreCortoDeMes(m.mes)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                Datos desde
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                  {f.nombre}
                </th>
                {f.meses.map((m) => {
                  const s = SIMBOLO[m.estado];
                  const detalle = `${f.nombre}, ${nombreCortoDeMes(m.mes)}: ${s.texto} (${m.registrados} de ${m.dias} días leídos${m.conDatos ? `, ${m.conDatos} con resultados` : ""})`;
                  return (
                    <td key={m.mes} className="px-1.5 py-2 text-center" title={detalle}>
                      <span aria-hidden="true" className={`text-sm leading-none ${s.clase}`}>
                        {s.marca}
                      </span>
                      <span className="sr-only">{detalle}</span>
                    </td>
                  );
                })}
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{f.desde ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(SIMBOLO) as EstadoMes[]).map((e) => (
          <span key={e}>
            <span aria-hidden="true" className={SIMBOLO[e].clase}>
              {SIMBOLO[e].marca}
            </span>{" "}
            {SIMBOLO[e].texto[0].toUpperCase() + SIMBOLO[e].texto.slice(1)}
          </span>
        ))}
      </p>
    </div>
  );
}
