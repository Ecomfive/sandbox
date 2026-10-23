"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { claseTdLista, claseThLista } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { TipoCuota } from "@/lib/proveedor/cuotas";
import { hoyPanama } from "@/lib/proveedor/fechas";
import { sugerenciaPago, totalesRegistro, type FilaRegistro } from "@/lib/proveedor/registro-pagos";
import { useIdioma } from "./idioma-contexto";
import { Tarjeta, Vacio, botonNormal, botonPrincipal, dinero } from "./piezas-proveedor";

type R = Promise<{ error?: string }>;

/** Las acciones del portal (solo el proveedor anota); sin ellas la tabla es solo para ver. */
export interface AccionesRegistro {
  anotarPago: (pedidoId: string, cuota: TipoCuota, monto: number, fecha: string) => R;
  quitarPago: (pagoId: string) => R;
  anotarLlegada: (pedidoId: string, fecha: string) => R;
}

const COLOR_TONO: Record<string, string> = { peligro: "text-destructive", aviso: "text-warning", info: "text-azul", exito: "text-success", neutro: "" };

/**
 * «Registro de pagos» (23 oct 2026): los envíos con las columnas de la hoja «payment record» de Chin. En su portal (con `acciones`)
 * anota cada pago recibido y su fecha de llegada; en el Tablero de Chin, Ecomfive la ve igual, solo para leer. Se filtra por país
 * (Chin lleva una hoja por país) y la última fila suma lo que falta.
 */
export function RegistroPagos({ filas, acciones, pista }: { filas: FilaRegistro[]; acciones?: AccionesRegistro; pista: string }) {
  const { t, tr, fecha, numero } = useIdioma();
  const paises = useMemo(() => [...new Set(filas.map((f) => f.paisCodigo ?? "—"))].sort(), [filas]);
  const [pais, setPais] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const visibles = pais ? filas.filter((f) => (f.paisCodigo ?? "—") === pais) : filas;
  const totales = totalesRegistro(visibles);
  const columnas: { texto: string; derecha?: boolean }[] = [
    { texto: t.colProducto },
    { texto: t.colCantidad, derecha: true },
    { texto: t.colMonto, derecha: true },
    { texto: t.colEntrega },
    { texto: t.colAnticipo, derecha: true },
    { texto: t.colPagado, derecha: true },
    { texto: t.colFechaPago },
    { texto: t.colSinPagar, derecha: true },
    { texto: t.colVencePago },
    { texto: t.colSaldo, derecha: true },
    { texto: t.colLlegada },
    { texto: t.colPagoSaldo },
  ];
  const n = columnas.length + (acciones ? 1 : 0);

  return (
    <Tarjeta
      titulo={t.registroTitulo}
      accion={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{pista}</span>
          {paises.length > 1 && (
            <span role="group" aria-label={t.colDestino} className="flex gap-1">
              {[null, ...paises].map((p) => (
                <button
                  key={p ?? "todos"}
                  type="button"
                  aria-pressed={pais === p}
                  onClick={() => setPais(p)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${pais === p ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"} ${anilloFoco}`}
                >
                  {p ?? t.todosPaises}
                </button>
              ))}
            </span>
          )}
        </span>
      }
    >
      {visibles.length === 0 ? (
        <Vacio>{t.registroVacio}</Vacio>
      ) : (
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-[1] bg-card">
              <tr>
                {columnas.map((c, i) => (
                  <th key={i} scope="col" className={`${claseThLista} ${c.derecha ? "text-right" : ""}`}>
                    {c.texto}
                  </th>
                ))}
                {acciones && (
                  <th scope="col" className={claseThLista}>
                    <span className="sr-only">{t.anotar}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <Fragment key={f.clave}>
                  <tr>
                    <td className={`${claseTdLista} max-w-[20rem] whitespace-normal`}>
                      {tr(f.producto)}
                      {!pais && f.paisCodigo && <span className="ml-1.5 text-xs font-semibold text-muted-foreground">{f.paisCodigo}</span>}
                    </td>
                    <td className={`${claseTdLista} text-right tabular-nums`}>{numero(f.unidades)}</td>
                    <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(f.monto)}</td>
                    <td className={`${claseTdLista} tabular-nums`}>{fecha(f.envio)}</td>
                    <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(f.anticipo)}</td>
                    <td className={`${claseTdLista} text-right tabular-nums`}>{f.pagadoAnticipo ? dinero(f.pagadoAnticipo) : ""}</td>
                    <td className={`${claseTdLista} tabular-nums`}>{f.fechaPagoAnticipo ? fecha(f.fechaPagoAnticipo) : ""}</td>
                    <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(f.sinPagar)}</td>
                    <td className={`${claseTdLista} bg-success-soft/40 tabular-nums ${f.vence && f.estadoAnticipo ? COLOR_TONO[f.estadoAnticipo.tono] : ""}`}>{f.vence ? fecha(f.vence) : ""}</td>
                    <td className={`${claseTdLista} bg-warning-soft/40 text-right tabular-nums`}>{dinero(f.saldo)}</td>
                    <td className={`${claseTdLista} bg-warning-soft/40 tabular-nums`}>
                      {f.llegada ? fecha(f.llegada) : ""}
                      {f.llegada && f.llegadaPropia && !acciones && <span className="block text-[11px] text-muted-foreground">{t.llegadaDelProveedor}</span>}
                    </td>
                    <td className={`${claseTdLista} bg-warning-soft/40 tabular-nums`}>{f.fechaPagoSaldo ? fecha(f.fechaPagoSaldo) : ""}</td>
                    {acciones && (
                      <td className={claseTdLista}>
                        {f.pedidoId && (
                          <button type="button" aria-expanded={abierta === f.clave} onClick={() => setAbierta((a) => (a === f.clave ? null : f.clave))} className={botonNormal}>
                            {t.anotar}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {acciones && abierta === f.clave && f.pedidoId && (
                    <tr>
                      <td colSpan={n} className="border-b border-border bg-muted/40 px-4 py-3">
                        <PanelAnotar f={f} acciones={acciones} alTerminar={() => setAbierta(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-card">
              <tr>
                <th scope="row" colSpan={7} className={`${claseTdLista} text-right font-semibold`}>
                  {t.totalFila}
                </th>
                <td className={`${claseTdLista} bg-warning-soft text-right font-semibold tabular-nums`}>{dinero(totales.sinPagar)}</td>
                <td className={claseTdLista} />
                <td className={`${claseTdLista} bg-warning-soft text-right font-semibold tabular-nums`}>{dinero(totales.saldo)}</td>
                <td colSpan={2 + (acciones ? 1 : 0)} className={claseTdLista} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

/** Anotar un pago recibido, la fecha de llegada y quitar lo que se anotó mal. */
function PanelAnotar({ f, acciones, alTerminar }: { f: FilaRegistro; acciones: AccionesRegistro; alTerminar: () => void }) {
  const { t, fecha, error } = useIdioma();
  const { mostrarToast } = useToast();
  const router = useRouter();
  const sugerida = sugerenciaPago(f);
  const [cuota, setCuota] = useState<TipoCuota>(sugerida?.cuota ?? "saldo");
  const [monto, setMonto] = useState(sugerida ? String(sugerida.monto) : "");
  const [fechaPago, setFechaPago] = useState(hoyPanama());
  const [llegada, setLlegada] = useState(f.llegadaPropia ? (f.llegada ?? "") : "");
  const [ocupado, setOcupado] = useState(false);

  async function correr(accion: () => R, ok: string, cerrar = true) {
    setOcupado(true);
    const r = await accion().catch(() => ({ error: "No se pudo anotar el pago." }));
    setOcupado(false);
    if (r.error) return mostrarToast(error(r.error), "destructive");
    mostrarToast(ok);
    if (cerrar) alTerminar();
    router.refresh();
  }

  const cuotaTexto = (c: TipoCuota) => (c === "anticipo" ? t.anticipo50 : t.saldo50);
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void correr(() => acciones.anotarPago(f.pedidoId!, cuota, Number(monto.replace(",", ".")), fechaPago), t.pagoAnotado);
        }}
      >
        <span className="w-full text-sm font-semibold">{t.anotarPago}</span>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.deCuota}
          <select value={cuota} onChange={(e) => setCuota(e.target.value as TipoCuota)} className={fieldClassSm}>
            <option value="anticipo">{cuotaTexto("anticipo")}</option>
            <option value="saldo">{cuotaTexto("saldo")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.monto} (USD)
          <input inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} className={`${fieldClassSm} w-32`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.fechaRecibido}
          <input type="date" required max={hoyPanama()} value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={fieldClassSm} />
        </label>
        <button type="submit" disabled={ocupado} className={botonPrincipal}>
          {ocupado ? t.guardando : t.guardar}
        </button>
      </form>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void correr(() => acciones.anotarLlegada(f.pedidoId!, llegada), t.llegadaGuardada);
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.fechaLlegada}
          <input type="date" min={f.envio} max={hoyPanama()} value={llegada} onChange={(e) => setLlegada(e.target.value)} className={fieldClassSm} />
        </label>
        <button type="submit" disabled={ocupado} className={botonNormal}>
          {t.guardarLlegada}
        </button>
      </form>

      {f.anotados.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">{t.loAnotado}</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {f.anotados.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm">
                <span className="tabular-nums">
                  {fecha(a.fecha)} · {cuotaTexto(a.cuota)} · {dinero(a.monto, 2)}
                </span>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void correr(() => acciones.quitarPago(a.id), t.pagoQuitado, false)}
                  className={`rounded text-xs font-medium text-destructive hover:underline disabled:opacity-50 ${anilloFoco}`}
                >
                  {t.quitar}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
