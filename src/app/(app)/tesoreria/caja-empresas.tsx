"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { dinero, fraccion } from "@/lib/af4/formato";
import { diaMes } from "@/lib/af4/fecha";
import type { CajaEmpresa } from "@/lib/finanzas/tesoreria";
import { guardarMinimoEmpresa } from "./caja-empresas-actions";

const ESTADO: Record<CajaEmpresa["estado"], { texto: string; punto: string }> = {
  bajo: { texto: "Bajo el mínimo", punto: "bg-destructive" },
  cerca: { texto: "Cerca del mínimo", punto: "bg-warning" },
  bien: { texto: "Sobre el mínimo", punto: "bg-success" },
  sin_minimo: { texto: "Sin mínimo", punto: "bg-muted-foreground" },
};

function Fila({ c, puedeEscribir }: { c: CajaEmpresa; puedeEscribir: boolean }) {
  const inicial = c.minimo ? String(c.minimo) : "";
  const [minimo, setMinimo] = useState(inicial);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const uso = c.minimo ? c.saldo / c.minimo : null;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${ESTADO[c.estado].punto}`} />
        <span className="truncate font-medium">{c.nombre}</span>
        <span className="sr-only">{ESTADO[c.estado].texto}</span>
      </span>
      <span className={`text-right ${claseCifra}`}>
        {dinero(c.saldo)}
        <span className="ml-1 text-xs text-muted-foreground">
          {c.cuentas} {c.cuentas === 1 ? "cuenta" : "cuentas"}
          {c.fecha ? ` · al ${diaMes(c.fecha)}` : ""}
          {uso !== null ? ` · ${fraccion(uso, { decimales: 0 })} del mínimo` : ""}
        </span>
      </span>
      {puedeEscribir ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            empezar(async () => {
              const r = await guardarMinimoEmpresa(c.entidadId, minimo).catch(() => ({ error: "Se cortó la conexión." }));
              mostrarToast(r.error ?? "Mínimo guardado", r.error ? "destructive" : "success");
            });
          }}
        >
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Mínimo</span>
            <input
              inputMode="decimal"
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
              placeholder="Sin mínimo"
              aria-label={`Caja mínima de ${c.nombre}, en USD`}
              className={`${fieldClassSm} w-28 text-right ${claseCifra}`}
            />
          </label>
          {minimo !== inicial && (
            <button type="submit" disabled={pendiente} className={`h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
              Guardar
            </button>
          )}
        </form>
      ) : (
        <span className={`text-muted-foreground ${claseCifra}`}>{c.minimo ? `Mínimo ${dinero(c.minimo)}` : "Sin mínimo"}</span>
      )}
    </li>
  );
}

/** Caja de cada empresa contra su mínimo (mejora 52): aviso a 20 % del mínimo y crítica debajo. */
export function CajaEmpresas({ filas, puedeEscribir }: { filas: CajaEmpresa[]; puedeEscribir: boolean }) {
  return (
    <MarcoAF4 id="titulo-caja-empresas" titulo="Caja por empresa" detalle="Bancos y billeteras en USD contra su mínimo" sinRelleno>
      {filas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Ninguna cuenta de banco o billetera tiene empresa: la toman al importar el libro de cada empresa.</p>
      ) : (
        <ul className="divide-y divide-border">
          {filas.map((c) => (
            <Fila key={c.entidadId} c={c} puedeEscribir={puedeEscribir} />
          ))}
        </ul>
      )}
    </MarcoAF4>
  );
}
