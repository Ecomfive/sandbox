"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { Seccion } from "@/components/ui/seccion-ficha";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, entero, fraccion, SIN_DATO } from "@/lib/af4/formato";
import { CONCEPTOS_GASTO, ETIQUETA_GASTO, type ConceptoGasto, type CostoPuesto, type GastoImportacion } from "@/lib/finanzas/compras-costos";
import { ComprasIcon, EnvioIcon, ProductoIcon } from "@/lib/nav-icons";
import { agregarGastoImportacion, cambiarGastoPagado, eliminarGastoImportacion } from "./actions";

const usd2 = (v: number | null) => dinero(v, "USD", { decimales: 2 });
const usd4 = (v: number | null) => dinero(v, "USD", { decimales: 4 });
const num = `text-right whitespace-nowrap ${claseCifra}`;

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className={`font-medium ${claseCifra}`}>{children}</dd>
    </div>
  );
}

function FormularioGasto({ compraId }: { compraId: string }) {
  const [concepto, setConcepto] = useState<ConceptoGasto>("flete");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [pagado, setPagado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        empezar(async () => {
          const r = await agregarGastoImportacion(compraId, { concepto, monto, fecha, pagado }).catch(() => ({ error: "Se cortó la conexión." }));
          if (r.error) setError(r.error);
          else {
            setMonto("");
            setFecha("");
            setPagado(false);
            mostrarToast("Gasto agregado");
          }
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Concepto</span>
        <select value={concepto} onChange={(e) => setConcepto(e.target.value as ConceptoGasto)} className={`${fieldClassSm} w-40`}>
          {CONCEPTOS_GASTO.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_GASTO[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Monto (USD)</span>
        <input inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej: 350.00" className={`${fieldClassSm} w-28 text-right ${claseCifra}`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Fecha de pago</span>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${fieldClassSm} w-36`} />
      </label>
      <label className="flex h-8 items-center gap-1.5 text-sm">
        <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} />
        Pagado
      </label>
      <button
        type="submit"
        disabled={pendiente || !monto.trim()}
        className={`inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
      >
        Agregar gasto
      </button>
      {error && (
        <p role="alert" className="flex w-full items-center gap-1.5 text-xs">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
          {error}
        </p>
      )}
    </form>
  );
}

function FilaGasto({ g, puedeEditar }: { g: GastoImportacion; puedeEditar: boolean }) {
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const correr = (accion: () => Promise<{ error?: string }>, ok: string) =>
    empezar(async () => {
      const r = await accion().catch(() => ({ error: "Se cortó la conexión." }));
      mostrarToast(r.error ?? ok, r.error ? "destructive" : "success");
    });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${g.pagado ? "bg-success" : "bg-warning"}`} />
        <span className="font-medium">{ETIQUETA_GASTO[g.concepto]}</span>
        <span className="text-muted-foreground">
          {g.pagado ? "Pagado" : "Pendiente"}
          {g.fecha ? ` · ${fechaCorta(g.fecha)}` : ""}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className={claseCifra}>{usd2(g.monto)}</span>
        {puedeEditar && (
          <>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => cambiarGastoPagado(g.id, !g.pagado), g.pagado ? "Marcado pendiente" : "Marcado pagado")}
              className={`h-7 rounded-md border border-border-control px-2 text-xs hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
            >
              {g.pagado ? "Marcar pendiente" : "Marcar pagado"}
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => eliminarGastoImportacion(g.id), "Gasto quitado")}
              className={`h-7 rounded-md border border-border-control px-2 text-xs hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
            >
              Quitar
            </button>
          </>
        )}
      </span>
    </li>
  );
}

/** La ficha de una compra: su costo puesto en bodega, por producto, y sus gastos de importación (se agregan aquí). */
export function FichaCostoPuesto({
  fila,
  gastos,
  puedeEditar,
  alCerrar,
  navegacion,
}: {
  fila: CostoPuesto | null;
  gastos: GastoImportacion[];
  puedeEditar: boolean;
  alCerrar: () => void;
  navegacion?: React.ReactNode;
}) {
  return (
    <Ventana abierto={!!fila} alCerrar={alCerrar} lado="derecha" ancho="lg" titulo={fila ? `${fila.codigo || "Compra"} · costo puesto` : ""} navegacion={navegacion}>
      {fila && (
        <div className="flex flex-col divide-y divide-border">
          <Seccion icono={ComprasIcon} titulo="Compra">
            <dl className="flex flex-col gap-1.5">
              <Dato etiqueta="Nombre">{fila.nombre}</Dato>
              <Dato etiqueta="Proveedor">{fila.proveedor ?? SIN_DATO}</Dato>
              <Dato etiqueta="Llegada">{fila.fechaLlegada ? fechaCorta(fila.fechaLlegada) : "Sin llegar"}</Dato>
              <Dato etiqueta="FOB">{usd2(fila.fob)}</Dato>
              <Dato etiqueta="Gastos de importación">{usd2(fila.gastos)}</Dato>
              <Dato etiqueta="Costo puesto en bodega">{usd2(fila.total)}</Dato>
              <Dato etiqueta="Unidades">{entero(fila.unidades)}</Dato>
              <Dato etiqueta="Costo por unidad">{usd4(fila.unitarioReal)}</Dato>
              <Dato etiqueta="Costo vigente">{usd4(fila.unitarioVigente)}</Dato>
              <Dato etiqueta="Diferencia">{fraccion(fila.diferencia, { conSigno: true })}</Dato>
            </dl>
          </Seccion>
          <Seccion icono={EnvioIcon} titulo="Gastos de importación">
            {gastos.length ? (
              <ul className="divide-y divide-border/60">
                {gastos.map((g) => (
                  <FilaGasto key={g.id} g={g} puedeEditar={puedeEditar} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin gastos cargados.</p>
            )}
            {puedeEditar && <FormularioGasto compraId={fila.compraId} />}
          </Seccion>
          {fila.lineas.length > 0 && (
            <Seccion icono={ProductoIcon} titulo="Por producto">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-1 text-left font-medium">
                        Producto
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        Unidades
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        Real
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        Vigente
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        Diferencia
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fila.lineas.map((l) => (
                      <tr key={l.skuId} className="border-t border-border/60">
                        <td className="py-1.5 pr-2">
                          <span className={`text-muted-foreground ${claseCifra}`}>{l.codigo}</span> {l.producto}
                        </td>
                        <td className={`py-1.5 ${num}`}>{entero(l.cantidad)}</td>
                        <td className={`py-1.5 ${num}`}>{usd4(l.unitarioReal)}</td>
                        <td className={`py-1.5 ${num}`}>{usd4(l.vigente)}</td>
                        <td className={`py-1.5 ${num}`}>{fraccion(l.diferencia, { conSigno: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Seccion>
          )}
        </div>
      )}
    </Ventana>
  );
}
