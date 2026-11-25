"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { firmarRecibo } from "@/app/repartidor/pagos/actions";
import { useToast } from "@/components/ui/toast";
import { plata } from "@/lib/despacho/panel-repartidor";

// App del delivery › Firmar recibo (25 nov 2026, pantalla 4 del prototipo aprobado): el texto del recibo de Oceans y un recuadro para firmar con el
// dedo. «Firmar y enviar» manda solo la firma (PNG); el servidor arma el PDF con lo que Despacho le mandó y lo guarda.

export function FirmarRecibo(p: {
  semanaId: string;
  rango: string;
  nombreCompleto: string;
  cedula: string;
  empresa: { nombre: string; ruc: string };
  total: number;
  periodo: string;
  formaPago: string;
  declaracion: string;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [trazos, setTrazos] = useState(0);

  // El lienzo a la medida de la pantalla (y de la densidad de píxeles del celular), con trazo negro.
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const escala = Math.min(window.devicePixelRatio || 1, 2);
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * escala);
    c.height = Math.round(r.height * escala);
    const ctx = c.getContext("2d")!;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#18181b";
  }, []);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const empezarTrazo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const [x, y] = punto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  };
  const seguir = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const [x, y] = punto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const terminar = () => {
    if (dibujando.current) setTrazos((n) => n + 1);
    dibujando.current = false;
  };
  const borrar = () => {
    const c = lienzo.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setTrazos(0);
  };
  const enviar = () =>
    empezar(async () => {
      const c = lienzo.current;
      if (!c || trazos === 0) return mostrarToast("Firma con el dedo en el recuadro.", "destructive");
      const r = await firmarRecibo(p.semanaId, c.toDataURL("image/png"));
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast("Recibo firmado y guardado.");
      router.push("/repartidor/pagos");
      router.refresh();
    });

  return (
    <>
      <header className="flex items-center gap-2.5 border-b border-[#e3e3e3] bg-white px-4 py-3.5">
        <Link href="/repartidor/pagos" aria-label="Volver a mis pagos" className="flex size-10 items-center justify-center text-[#18181b]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className="flex flex-col">
          <b className="text-[17px]">Firmar recibo</b>
          <span className="text-xs text-[#636363]">{p.rango}</span>
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <section className="flex flex-col gap-2 rounded-[14px] border border-[#e3e3e3] bg-white p-3.5 text-[13px] leading-snug text-[#3f3f46]">
          <b className="text-center text-[13px] text-[#18181b]">RECIBO DE SERVICIOS – DELIVERY INDEPENDIENTE</b>
          <span>
            Yo, <b>{p.nombreCompleto}</b>, portador(a) de cédula/pasaporte No. <b>{p.cedula}</b>, declaro haber recibido de la empresa <b>{p.empresa.nombre}</b>, RUC {p.empresa.ruc}, la
            suma de:
          </span>
          <span className="self-center text-[22px] font-bold text-[#5b2386]">USD {plata(p.total)}</span>
          <span>
            En concepto de pago por servicios de delivery prestados como <b>trabajador independiente</b>, {p.periodo}.
          </span>
          <span className="text-xs text-[#636363]">{p.declaracion}</span>
          <span>
            Forma de pago: <b>{p.formaPago}</b>
          </span>
        </section>

        <section className="flex flex-col gap-1.5">
          <span id="t-firma" className="text-xs font-semibold text-[#3f3f46]">
            Tu firma
          </span>
          <div className="relative h-[150px] rounded-[14px] border border-dashed border-[#b38ad9] bg-white">
            <canvas
              ref={lienzo}
              aria-labelledby="t-firma"
              role="img"
              className="absolute inset-0 size-full touch-none rounded-[14px]"
              onPointerDown={empezarTrazo}
              onPointerMove={seguir}
              onPointerUp={terminar}
              onPointerCancel={terminar}
              onPointerLeave={terminar}
            />
            {trazos === 0 && <span className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-[#636363]">Firma con el dedo aquí</span>}
          </div>
          <button type="button" onClick={borrar} className="min-h-9 self-end bg-transparent text-[13px] font-semibold text-primario">
            Borrar y firmar de nuevo
          </button>
        </section>

        <p className="m-0 rounded-[10px] bg-white px-2.5 py-2 text-xs text-[#636363]">
          Al firmar se guarda el recibo en PDF con tu firma, tu nombre, la fecha y la hora. Lo ves en «Mis pagos» y le llega a Finanzas.
        </p>
      </div>

      <div className="sticky bottom-0 border-t border-[#e3e3e3] bg-white px-3.5 pt-3 pb-4">
        <button type="button" disabled={pendiente || trazos === 0} onClick={enviar} className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primario text-base font-bold text-white disabled:opacity-60">
          {pendiente ? "Guardando…" : "Firmar y enviar"}
        </button>
      </div>
    </>
  );
}
