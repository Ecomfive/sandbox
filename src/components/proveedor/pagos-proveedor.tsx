"use client";

import { Indicador } from "@/components/panel/piezas-panel";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { dinero, fecha } from "./piezas-proveedor";
import { useIdioma } from "./idioma-contexto";

// Los indicadores de Pagos de las dos vistas del portal del proveedor (fase 4 de PORTAL-PROVEEDOR.md). La tabla es el «Registro de
// pagos» (registro-pagos.tsx).

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

/** Los indicadores que ve el proveedor (en el idioma de la pantalla). */
export function IndicadoresProveedor({ r }: { r: ResumenPagos }) {
  const { t } = useIdioma();
  const a = r.anticipos;
  return (
    <section aria-label={t.tabPagos} className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex flex-wrap">
        <Indicador titulo={t.anticiposATiempo(a.desde.slice(0, 4))} valor={a.total ? `${a.aTiempo} / ${a.total}` : "—"} detalle={a.total ? t.atrasoMedio(a.atrasoPromedio) : t.sinPagosMedibles} />
        <Indicador titulo={t.anticiposProximos} valor={dinero(r.anticiposProximos.monto)} detalle={t.cuotasDetalle(r.anticiposProximos.cuotas)} />
        <Indicador titulo={t.saldoAlLlegar} valor={dinero(r.saldoEnCamino)} detalle={t.saldoAlLlegarDetalle} />
      </div>
    </section>
  );
}
