"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cerrarSesion } from "@/app/login/actions";
import { enviarCierre } from "@/app/repartidor/actions";
import { useToast } from "@/components/ui/toast";
import type { CierreGuardado } from "@/lib/despacho/datos-repartidor";
import { plata, type ResumenCierre } from "@/lib/despacho/panel-repartidor";
import { ElegirClave } from "./elegir-clave";
import { NavRepartidor } from "./piezas";

/**
 * «Cierre del día» (pantalla 5 del prototipo aprobado): lo que hay que resolver, el efectivo a depositar por tienda (cada una con la foto de su
 * depósito), los pagos digitales por tienda, su pago de envíos (entregados + fallidos con evidencia) y «Enviar cierre a Soporte».
 */
export function CierreDia({ nombreCompleto, nombre, dia, diaTexto, resumen, cierre }: { nombreCompleto: string; nombre: string; dia: string; diaTexto: string; resumen: ResumenCierre; cierre: CierreGuardado | null }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [depositos, setDepositos] = useState<Record<string, File | null>>({});
  const [enviando, setEnviando] = useState(false);
  const [cambiarClave, setCambiarClave] = useState(false);
  const validado = cierre?.estado === "validado";
  const bloqueado = resumen.enRuta > 0 || validado || resumen.pedidos === 0;
  const etiqueta = "text-[11px] font-semibold tracking-[0.04em]";

  if (cambiarClave) return <ElegirClave temporal={false} nombre={nombre} alCancelar={() => setCambiarClave(false)} />;

  async function enviar() {
    setEnviando(true);
    const d = new FormData();
    for (const [tienda, archivo] of Object.entries(depositos)) if (archivo) d.set(`deposito:${tienda}`, archivo);
    const r = await enviarCierre(dia, d);
    setEnviando(false);
    if (r.error) return mostrarToast(r.error, "destructive");
    mostrarToast("Cierre enviado a Soporte.");
    setDepositos({});
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-col gap-1 bg-primario p-[18px] text-white">
        <span className="text-[13px] opacity-90">
          {nombreCompleto} · {diaTexto}
        </span>
        <b className="text-xl">Cierre del día</b>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {resumen.enRuta > 0 && (
          <section className="flex items-start gap-2.5 rounded-[14px] border border-[#f4d58a] bg-[#fef3c7] px-3.5 py-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a4b08" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
            <span className="text-[13px] text-[#3f3f46]">
              <b>
                {resumen.enRuta} pedido{resumen.enRuta === 1 ? " sigue" : "s siguen"} en ruta.
              </b>{" "}
              Márcalos antes de enviar el cierre.
            </span>
          </section>
        )}

        {cierre && (
          <section
            className={`rounded-[14px] border px-3.5 py-2.5 text-[13px] ${cierre.estado === "validado" ? "border-[#bbe5c8] bg-[#dcfce7] text-[#15803d]" : cierre.estado === "devuelto" ? "border-[#f3b4c2] bg-[#ffe4e6] text-[#be123c]" : "border-[#dcc6f3] bg-primario-suave text-[#5b2386]"}`}
          >
            {cierre.estado === "validado" ? (
              <b>Soporte validó tu cierre{cierre.revisadoPor ? ` (${cierre.revisadoPor})` : ""}.</b>
            ) : cierre.estado === "devuelto" ? (
              <>
                <b>Soporte te devolvió el cierre.</b> {cierre.nota ?? ""} Corrige y vuelve a enviarlo.
              </>
            ) : (
              <b>Enviado a Soporte · por validar.</b>
            )}
          </section>
        )}

        <section className="flex justify-between rounded-[14px] border border-[#e3e3e3] bg-white px-3.5 py-2.5 text-[13px]">
          <span>
            <b className="text-[#15803d]">{resumen.entregados}</b> entregados
          </span>
          <span>
            <b>{resumen.pospuestos}</b> pospuestos
          </span>
          <span>
            <b className="text-[#be123c]">{resumen.fallidos}</b> fallidos
          </span>
          <span>
            <b className="text-[#b45309]">{resumen.enRuta}</b> en ruta
          </span>
        </section>

        <section className="flex flex-col gap-2 rounded-[14px] border border-[#dcc6f3] bg-white px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <span className={`${etiqueta} text-[#5b2386]`}>EFECTIVO A DEPOSITAR, POR TIENDA</span>
            <b className="text-[15px] text-[#5b2386]">{plata(resumen.efectivoTotal)}</b>
          </div>
          {resumen.efectivo.length === 0 && <span className="text-[13px] text-[#636363]">Hoy no cobraste en efectivo.</span>}
          {resumen.efectivo.map((e) => {
            const guardado = cierre?.depositos.find((d) => d.tienda === e.tienda)?.archivo;
            const elegido = depositos[e.tienda];
            const id = `deposito-${e.tienda}`;
            return (
              <div key={e.tienda} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-[10px] bg-primario-suave px-2.5 py-2 text-sm">
                <span>
                  <b>{e.tienda}</b>{" "}
                  <span className="text-xs text-[#636363]">
                    · {e.pedidos} pedido{e.pedidos === 1 ? "" : "s"}
                  </span>
                </span>
                <b>{plata(e.monto)}</b>
                {!validado ? (
                  <label htmlFor={id} className={`cursor-pointer rounded-lg px-1.5 py-1 text-[11px] font-semibold ${elegido || guardado ? "border border-[#15803d] text-[#15803d]" : "border border-dashed border-[#b38ad9] text-[#5b2386]"}`}>
                    {elegido ? "Foto lista ✓" : guardado ? "Depósito ✓" : "Foto depósito"}
                    <input id={id} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(ev) => setDepositos((d) => ({ ...d, [e.tienda]: ev.target.files?.[0] ?? null }))} />
                  </label>
                ) : (
                  <span className="text-[11px] font-semibold text-[#15803d]">{guardado ? "Depósito ✓" : ""}</span>
                )}
              </div>
            );
          })}
          <span className="text-xs text-[#636363]">Un depósito por tienda, cada uno con su foto. Así Soporte sabe de qué tienda es cada dólar.</span>
        </section>

        <section className="flex flex-col gap-1.5 rounded-[14px] border border-[#e3e3e3] bg-white px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <span className={`${etiqueta} text-[#636363]`}>PAGOS DIGITALES (YA EN LA CUENTA)</span>
            <b className="text-sm">{plata(resumen.digitalesTotal)}</b>
          </div>
          {resumen.digitales.length === 0 && <span className="text-[13px] text-[#636363]">Hoy no hubo pagos por Yappy, MiPOS ni transferencia.</span>}
          {resumen.digitales.map((d) => (
            <div key={d.tienda} className="flex justify-between gap-2 text-[13px]">
              <span>
                {d.tienda} <span className="text-[#636363]">· {d.detalle}</span>
              </span>
              <b>{plata(d.monto)}</b>
            </div>
          ))}
          {resumen.digitalesPedidos > 0 && (
            <span className={`text-xs ${resumen.digitalesConComprobante === resumen.digitalesPedidos ? "text-[#15803d]" : "text-[#b45309]"}`}>
              {resumen.digitalesConComprobante} de {resumen.digitalesPedidos} con su comprobante
            </span>
          )}
        </section>

        <section className="flex flex-col gap-1 rounded-[14px] border border-[#e3e3e3] bg-white px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <span className={`${etiqueta} text-[#636363]`}>TU PAGO DE ENVÍOS</span>
            <b className="text-base">{plata(resumen.pago.monto)}</b>
          </div>
          <span className="text-[13px]">
            {resumen.entregados} entregado{resumen.entregados === 1 ? "" : "s"} + {resumen.fallidosConEvidencia} fallido{resumen.fallidosConEvidencia === 1 ? "" : "s"} con evidencia
            {resumen.pago.tarifa !== null ? ` = ${resumen.pago.pedidos} × ${plata(resumen.pago.tarifa)}` : ` = ${resumen.pago.pedidos} pedidos`}
          </span>
          <span className="text-xs text-[#636363]">Los pospuestos no se pagan. Un fallido sin evidencia tampoco.</span>
        </section>

        <p className="m-0 text-center text-xs text-[#636363]">
          <button type="button" onClick={() => setCambiarClave(true)} className="text-xs font-medium text-primario underline-offset-2 hover:underline">
            Cambiar clave
          </button>
          {" · "}
          <button type="button" onClick={() => cerrarSesion()} className="text-xs font-medium text-primario underline-offset-2 hover:underline">
            Salir
          </button>
        </p>
      </div>

      <div className="sticky bottom-14 flex flex-col gap-1.5 border-t border-[#e3e3e3] bg-white px-3.5 pt-3 pb-4">
        <button type="button" onClick={enviar} disabled={bloqueado || enviando} className="min-h-[52px] rounded-xl bg-primario text-base font-bold text-white disabled:opacity-50">
          {enviando ? "Enviando…" : validado ? "Cierre validado" : cierre ? "Volver a enviar a Soporte" : "Enviar cierre a Soporte"}
        </button>
        <span className="text-center text-xs text-[#636363]">Soporte lo valida en Despacho ciudad y te llega la confirmación.</span>
      </div>
      <NavRepartidor activa="cierre" />
    </div>
  );
}
