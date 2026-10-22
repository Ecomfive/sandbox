"use client";

import { Indicador, claseTdLista, claseThLista } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import type { EstadoCuota } from "@/lib/proveedor/cuotas";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { TONO, Tarjeta, Vacio, dinero, fecha } from "./piezas-proveedor";

// Piezas de Pagos que comparten las dos vistas del portal del proveedor (fase 4 de PORTAL-PROVEEDOR.md).

/** Un envío con sus dos cuotas ya resueltas (para la tabla de plazos). */
export interface FilaPlazo {
  clave: string;
  producto: string;
  paisCodigo: string | null;
  fechaEnvio: string;
  montoTotal: number;
  anticipo: { monto: number; vence: string | null; estado: EstadoCuota };
  saldo: { monto: number; vence: string | null; estado: EstadoCuota } | null;
}

export interface AvisoVista {
  id: string;
  fecha: string;
  monto: number;
  referencia: string | null;
  estado: "avisado" | "confirmado";
  avisadoPor: string | null;
  confirmadoEn: string | null;
  nota: string | null;
  comprobanteUrl: string | null;
  cuotas: { pedidoId: string; cuota: "anticipo" | "saldo"; monto: number; producto: string }[];
}

export const textoCuota = (c: "anticipo" | "saldo") => (c === "anticipo" ? "anticipo 50 %" : "saldo 50 %");

/** Los indicadores de pagos de Ecomfive (cumplimiento y lo que vence). */
export function IndicadoresEcomfive({ r }: { r: ResumenPagos }) {
  const a = r.anticipos;
  return (
    <section aria-label="Indicadores de pagos" className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex flex-wrap">
        <Indicador
          titulo={`Anticipos a tiempo desde ${fecha(a.desde)} ${a.desde.slice(0, 4)}`}
          punto={a.total && a.aTiempo / a.total < 0.8 ? "peligro" : undefined}
          valor={a.total ? `${Math.round((a.aTiempo / a.total) * 100)} %` : "—"}
          detalle={a.total ? `${a.aTiempo} de ${a.total} · atraso medio ${a.atrasoPromedio} d (peor ${a.peor} d)` : "sin pagos medibles"}
        />
        <Indicador
          titulo="Saldo tras la llegada"
          punto={r.saldos.promedio > 7 ? "aviso" : undefined}
          valor={r.saldos.total ? `${r.saldos.promedio} d` : "—"}
          detalle={r.saldos.total ? `en promedio · ${Math.round((r.saldos.dentro / r.saldos.total) * 100)} % dentro de 7 días` : "sin saldos pagados"}
        />
        <Indicador
          titulo="Vence en 7 días"
          punto={r.vencido.cuotas ? "peligro" : undefined}
          valor={dinero(r.venceSemana.monto)}
          detalle={`${r.venceSemana.cuotas} cuotas${r.vencido.cuotas ? ` · ${r.vencido.cuotas} vencidas (${dinero(r.vencido.monto)})` : ""}`}
        />
        <Indicador titulo="Saldos de lo que viene en camino" valor={dinero(r.saldoEnCamino)} detalle="se pagan al llegar cada producto" />
      </div>
    </section>
  );
}

/** Los indicadores que ve el proveedor. */
export function IndicadoresProveedor({ r }: { r: ResumenPagos }) {
  const a = r.anticipos;
  return (
    <section aria-label="Indicadores de pagos" className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex flex-wrap">
        <Indicador titulo={`Anticipos pagados a tiempo (desde ${a.desde.slice(0, 4)})`} valor={a.total ? `${a.aTiempo} / ${a.total}` : "—"} detalle={a.total ? `atraso medio ${a.atrasoPromedio} d` : "sin pagos medibles"} />
        <Indicador titulo="Anticipos que vencen en 10 días" valor={dinero(r.anticiposProximos.monto)} detalle={`${r.anticiposProximos.cuotas} cuotas · 50 % a los 10 días del envío`} />
        <Indicador titulo="Saldo al llegar" valor={dinero(r.saldoEnCamino)} detalle="el otro 50 % de lo que va en camino" />
      </div>
    </section>
  );
}

/** Los plazos de pago de los últimos envíos: anticipo y saldo con su estado. */
export function TablaPlazos({ filas, titulo, nota }: { filas: FilaPlazo[]; titulo: string; nota?: string }) {
  return (
    <Tarjeta titulo={titulo} accion={nota ? <span className="text-xs text-muted-foreground">{nota}</span> : undefined}>
      {filas.length === 0 ? (
        <Vacio>Todavía no hay envíos con plazos de pago.</Vacio>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-[1] bg-card">
              <tr>
                {["Producto", "Destino", "Enviado", "Total", "Anticipo", "Vence", "Estado", "Saldo", "Estado"].map((t, i) => (
                  <th key={i} scope="col" className={`${claseThLista} ${t === "Total" || t === "Anticipo" || t === "Saldo" ? "text-right" : ""}`}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave}>
                  <td className={`${claseTdLista} max-w-[22rem] whitespace-normal`}>{f.producto}</td>
                  <td className={`${claseTdLista} font-semibold tabular-nums`}>{f.paisCodigo ?? "—"}</td>
                  <td className={`${claseTdLista} tabular-nums`}>{fecha(f.fechaEnvio)}</td>
                  <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(f.montoTotal)}</td>
                  <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(f.anticipo.monto)}</td>
                  <td className={`${claseTdLista} tabular-nums`}>{fecha(f.anticipo.vence)}</td>
                  <td className={claseTdLista}>
                    <Badge tone={TONO[f.anticipo.estado.tono]}>{f.anticipo.estado.texto}</Badge>
                  </td>
                  <td className={`${claseTdLista} text-right tabular-nums`}>{f.saldo ? dinero(f.saldo.monto) : "—"}</td>
                  <td className={claseTdLista}>{f.saldo ? <Badge tone={TONO[f.saldo.estado.tono]}>{f.saldo.estado.texto}</Badge> : <span className="text-xs text-muted-foreground">Todo por adelantado</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
