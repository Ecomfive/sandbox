import Link from "next/link";
import type { ReactNode } from "react";
import { diaCorto, finSemanaPago, nombreTienda, TIENDAS_OCEANS, type ResumenDelivery } from "@/lib/despacho/control-envios";
import type { SemanaGuardada } from "@/lib/despacho/datos-control";
import { plata } from "@/lib/despacho/panel-repartidor";
import { NavRepartidor } from "./piezas";

// App del delivery › Mis pagos (25 nov 2026, pantalla 3 del prototipo aprobado https://claude.ai/artifact/8mbjcbJGELtkGhvmpSdKhX): el cierre de la
// semana (por tienda, propinas y ajustes, lo que paga Oceans y lo que paga ClickSi aparte, los conteos y la nota de Despacho), «Firmar recibo de
// Oceans», «Ver el detalle día por día» y las semanas anteriores con «Ver mi recibo».

const rango = (jueves: string) => `Jue ${diaCorto(jueves)} al mié ${diaCorto(finSemanaPago(jueves))}/${finSemanaPago(jueves).slice(0, 4)}`;

function Tiendas({ r }: { r: ResumenDelivery }) {
  const orden = (t: string) => {
    const i = (TIENDAS_OCEANS as readonly string[]).indexOf(t);
    return i < 0 ? 99 : i;
  };
  const tiendas = Object.entries(r.porTienda).sort(([a], [b]) => orden(a) - orden(b));
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {tiendas.map(([t, m]) => (
        <span key={t} className="flex justify-between">
          <span>{nombreTienda(t)}</span>
          <b>{plata(m)}</b>
        </span>
      ))}
      <span className="flex justify-between text-[#636363]">
        <span>Propinas y ajustes</span>
        <b>{plata(r.propinas + r.ajustes)}</b>
      </span>
      <span className="flex justify-between rounded-[10px] bg-primario-suave px-2.5 py-2 text-[#5b2386]">
        <span className="font-semibold">Te paga Oceans</span>
        <b className="text-[17px]">{plata(r.totalOceans)}</b>
      </span>
      <span className="flex justify-between px-2.5">
        <span>Te paga ClickSi</span>
        <b>{plata(r.clicksi)}</b>
      </span>
    </div>
  );
}

function Conteos({ r }: { r: ResumenDelivery }) {
  const cajas: [number, string][] = [
    [r.entregados, "Entregados"],
    [r.cambios, "Cambios y compl."],
    [r.retiros, "Retiros"],
    [r.fallidos, "Fallidos"],
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5 text-center">
      {cajas.map(([n, t]) => (
        <div key={t} className="flex flex-col rounded-[10px] bg-[#fafafa] px-0.5 py-1.5">
          <b className="text-base">{n}</b>
          <span className="text-[10px] text-[#636363]">{t}</span>
        </div>
      ))}
    </div>
  );
}

function Tarjeta({ titulo, sub, chip, children }: { titulo: string; sub: string; chip: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-[#dcc6f3] bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <b className="text-base">{titulo}</b>
          <span className="text-xs text-[#636363]">{sub}</span>
        </div>
        {chip}
      </div>
      {children}
    </section>
  );
}

const chipClase = "rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap";

export function MisPagos({
  nombre,
  porFirmar,
  porCerrar,
  enCurso,
  anteriores,
  faltanDatos,
}: {
  nombre: string;
  porFirmar: SemanaGuardada | null;
  porCerrar: { jueves: string; resumen: ResumenDelivery } | null;
  enCurso: { jueves: string; resumen: ResumenDelivery };
  anteriores: SemanaGuardada[];
  faltanDatos: boolean;
}) {
  return (
    <>
      <header className="flex flex-col gap-1 bg-primario p-[18px] text-white">
        <span className="text-[13px] opacity-90">{nombre}</span>
        <b className="text-xl">Mis pagos</b>
      </header>
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {porFirmar?.detalle && (
          <Tarjeta titulo="Cierre de la semana" sub={rango(porFirmar.semana)} chip={<span className={`${chipClase} bg-[#fef3c7] text-[#8a4b08]`}>Por firmar</span>}>
            <Tiendas r={porFirmar.detalle} />
            <Conteos r={porFirmar.detalle} />
            {porFirmar.nota && (
              <div className="rounded-[10px] bg-[#fafafa] px-2.5 py-2 text-[13px] text-[#3f3f46]">
                <b className="text-[11px] tracking-wide text-[#636363]">NOTA DE DESPACHO</b>
                <br />
                {porFirmar.nota}
              </div>
            )}
            {faltanDatos ? (
              <p className="m-0 rounded-[10px] bg-[#fef3c7] px-2.5 py-2 text-[13px] text-[#8a4b08]">Faltan tu nombre completo o tu cédula en el sistema: avísale a Despacho para poder firmar.</p>
            ) : (
              <Link href={`/repartidor/pagos/firmar?semana=${porFirmar.id}`} className="flex min-h-12 items-center justify-center rounded-xl bg-primario text-[15px] font-bold text-white no-underline">
                Firmar recibo de Oceans
              </Link>
            )}
            <Link href={`/repartidor/pagos/detalle?semana=${porFirmar.semana}`} className="text-center text-[13px] text-primario">
              Ver el detalle día por día
            </Link>
          </Tarjeta>
        )}

        {porCerrar && (
          <Tarjeta titulo="Semana pasada" sub={rango(porCerrar.jueves)} chip={<span className={`${chipClase} bg-primario-suave text-[#5b2386]`}>Despacho la está cerrando</span>}>
            <Tiendas r={porCerrar.resumen} />
            <Conteos r={porCerrar.resumen} />
            <span className="text-xs text-[#636363]">Cuando Despacho la cierre te llega aquí para firmar el recibo.</span>
            <Link href={`/repartidor/pagos/detalle?semana=${porCerrar.jueves}`} className="text-center text-[13px] text-primario">
              Ver el detalle día por día
            </Link>
          </Tarjeta>
        )}

        <Tarjeta titulo="Semana en curso" sub={rango(enCurso.jueves)} chip={<span className={`${chipClase} bg-primario-suave text-[#5b2386]`}>Va sumando</span>}>
          <Tiendas r={enCurso.resumen} />
          <Conteos r={enCurso.resumen} />
          <span className="text-xs text-[#636363]">Solo cuentan los pedidos cerrados: entregados, cambios, retiros y fallidos con foto. Los pospuestos no se pagan.</span>
          <Link href={`/repartidor/pagos/detalle?semana=${enCurso.jueves}`} className="text-center text-[13px] text-primario">
            Ver el detalle día por día
          </Link>
        </Tarjeta>

        {anteriores.length > 0 && (
          <>
            <span className="text-[11px] font-semibold tracking-wide text-[#636363]">SEMANAS ANTERIORES</span>
            {anteriores.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-[14px] border border-[#e3e3e3] bg-white px-3.5 py-2.5">
                <span className="flex flex-col gap-0.5">
                  <b className="text-sm">{rango(s.semana)}</b>
                  <span className="text-xs text-[#636363]">
                    Oceans {plata(s.totalOceans)} · ClickSi {plata(s.totalClicksi)}
                  </span>
                  {s.estado === "firmada" ? (
                    <a href={`/repartidor/pagos/recibo/${s.id}`} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-primario">
                      Ver mi recibo
                    </a>
                  ) : (
                    <Link href={`/repartidor/pagos/firmar?semana=${s.id}`} className="text-[13px] font-semibold text-primario">
                      Firmar recibo
                    </Link>
                  )}
                </span>
                <span className={`${chipClase} ${s.estado === "firmada" ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#fef3c7] text-[#8a4b08]"}`}>{s.estado === "firmada" ? "Firmado" : "Por firmar"}</span>
              </div>
            ))}
          </>
        )}
      </div>
      <NavRepartidor activa="pagos" />
    </>
  );
}
