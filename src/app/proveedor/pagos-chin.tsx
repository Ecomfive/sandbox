"use client";

import { useState } from "react";
import { useIdioma } from "@/components/proveedor/idioma-contexto";
import { IndicadoresProveedor, TablaPlazos, textoCuota, type AvisoVista, type FilaPlazo } from "@/components/proveedor/pagos-proveedor";
import { Tarjeta, botonPrincipal, dinero } from "@/components/proveedor/piezas-proveedor";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { confirmarAvisoPago } from "./actions";

/**
 * «Pagos» del portal de Chin (fase 4): qué se pagó a tiempo, qué tarde y qué está vencido, y los avisos de pago de Ecomfive para
 * confirmar. Solo el proveedor registra lo que recibe; Ecomfive no lo puede cambiar (con `soloLectura`, los avisos se ven sin botón).
 */
export function PagosChin({ resumen, avisos: iniciales, plazos, soloLectura = false }: { resumen: ResumenPagos; avisos: AvisoVista[]; plazos: FilaPlazo[]; soloLectura?: boolean }) {
  const { t } = useIdioma();
  const [avisos, setAvisos] = useState(iniciales);
  return (
    <>
      <IndicadoresProveedor r={resumen} />
      {avisos.length > 0 && (
        <Tarjeta titulo={t.porConfirmar}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-3 p-3">
            {avisos.map((a) => (
              <TarjetaAviso key={a.id} a={a} soloLectura={soloLectura} alConfirmar={() => setAvisos((xs) => xs.filter((x) => x.id !== a.id))} />
            ))}
          </div>
        </Tarjeta>
      )}
      <TablaPlazos filas={plazos} titulo={t.plazosTitulo} nota={t.plazosPista} />
    </>
  );
}

function TarjetaAviso({ a, soloLectura, alConfirmar }: { a: AvisoVista; soloLectura: boolean; alConfirmar: () => void }) {
  const { t, tr, fecha, idioma, error } = useIdioma();
  const { mostrarToast } = useToast();
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <article className="flex min-w-0 flex-col gap-2.5 rounded-[10px] border border-primario p-3 shadow-[0_0_0_1px_var(--primario)]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">{t.avisoPago}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{fecha(a.fecha)}</span>
      </div>
      <dl className="m-0 grid grid-cols-3 gap-1.5 text-xs text-muted-foreground">
        <div>
          <dt>{t.monto}</dt>
          <dd className="m-0 text-[15px] font-semibold text-foreground tabular-nums">{dinero(a.monto, 2)}</dd>
        </div>
        <div>
          <dt>{t.referencia}</dt>
          <dd className="m-0 text-[13px] font-semibold text-foreground tabular-nums">{a.referencia ?? "—"}</dd>
        </div>
        <div>
          <dt>{t.cuotas}</dt>
          <dd className="m-0 text-[15px] font-semibold text-foreground tabular-nums">{a.cuotas.length}</dd>
        </div>
      </dl>
      <ul className="m-0 flex flex-col gap-0.5 p-0 pl-4 text-[12.5px]">
        {a.cuotas.map((c) => (
          <li key={`${c.pedidoId}:${c.cuota}`}>
            {tr(c.producto)} · {textoCuota(c.cuota, idioma)} · <span className="tabular-nums">{dinero(c.monto, 2)}</span>
          </li>
        ))}
      </ul>
      {a.comprobanteUrl && (
        <a href={a.comprobanteUrl} target="_blank" rel="noreferrer" className={`w-fit rounded text-[13px] font-medium underline-offset-2 hover:underline ${anilloFoco}`}>
          {t.verComprobante}
        </a>
      )}
      {!soloLectura && (
        <>
          <input value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} placeholder={t.notaConfirmar} aria-label={t.notaConfirmar} className={fieldClassSm} />
          <div className="flex justify-end">
            <button
              type="button"
              className={botonPrincipal}
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                const r = await confirmarAvisoPago(a.id, nota);
                setOcupado(false);
                if (r.error) return mostrarToast(error(r.error), "destructive");
                alConfirmar();
                mostrarToast(t.pagoOk);
              }}
            >
              {ocupado ? t.confirmando : t.confirmarRecibido}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
