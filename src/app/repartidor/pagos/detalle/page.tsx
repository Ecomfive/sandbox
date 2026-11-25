import Link from "next/link";
import { notFound } from "next/navigation";
import { NavRepartidor } from "@/components/repartidor/piezas";
import { diaConNombre, diaCorto, finSemanaPago, inicioSemanaPago, type ResumenDelivery } from "@/lib/despacho/control-envios";
import { plata } from "@/lib/despacho/panel-repartidor";
import { requireRepartidor } from "@/lib/despacho/sesion-repartidor";
import { datosPagos } from "../datos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detalle día por día" };

/**
 * App del delivery › Mis pagos › Detalle día por día (25 nov 2026, pantalla 6 del prototipo aprobado): cada día con asignados, entregados, cambios y
 * complementos, fallidos, retiros y lo que suma, y cómo se calcula. `?semana=` es el jueves: una semana mandada (fija) o la en curso (en vivo).
 */
export default async function PaginaDetalleSemana({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const cuenta = await requireRepartidor();
  const pedido = (await searchParams).semana;
  if (typeof pedido !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(pedido)) notFound();
  const jueves = inicioSemanaPago(pedido);
  const datos = await datosPagos(cuenta);
  if (!datos) notFound();
  const mandada = datos.semanas.find((s) => s.semana === jueves)?.detalle;
  const resumen: ResumenDelivery | undefined = mandada ?? (datos.enCurso.jueves === jueves ? datos.enCurso.resumen : datos.porCerrar?.jueves === jueves ? datos.porCerrar.resumen : undefined);
  if (!resumen) notFound();
  const fin = finSemanaPago(jueves);
  return (
    <>
      <header className="flex items-center gap-2.5 bg-primario px-[18px] py-3.5 text-white">
        <Link href="/repartidor/pagos" aria-label="Volver a Mis pagos" className="flex size-10 items-center justify-center text-white">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className="flex flex-col gap-0.5">
          <b className="text-lg">Detalle día por día</b>
          <span className="text-xs opacity-90">
            Jue {diaCorto(jueves)} al mié {diaCorto(fin)}/{fin.slice(0, 4)}
          </span>
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        {resumen.dias.length === 0 && <p className="m-0 rounded-[14px] bg-white p-3 text-sm text-[#636363]">Todavía no hay pedidos en esta semana.</p>}
        {resumen.dias.map((d) => (
          <section key={d.dia} className="flex flex-col gap-1.5 rounded-[14px] border border-[#e3e3e3] bg-white px-3 py-2.5">
            <div className="flex items-center justify-between">
              <b className="text-sm">{diaConNombre(d.dia)}</b>
              <b className="text-[15px] text-[#5b2386]">{plata(d.pago)}</b>
            </div>
            <div className="grid grid-cols-5 gap-1 text-center">
              {(
                [
                  [d.asignados, "Asignados"],
                  [d.entregados, "Entregados"],
                  [d.cambios, "Cambios y compl."],
                  [d.fallidos, "Fallidos"],
                  [d.retiros, "Retiros"],
                ] as const
              ).map(([n, t]) => (
                <span key={t} className="flex flex-col">
                  <b className="text-sm">{n}</b>
                  <span className="text-[9px] text-[#636363]">{t}</span>
                </span>
              ))}
            </div>
          </section>
        ))}
        <section className="flex flex-col gap-1 rounded-[14px] bg-primario-suave px-3 py-2.5 text-[13px] text-[#3f3f46]">
          <b className="text-[13px] text-[#5b2386]">Cómo se calcula</b>
          {resumen.lineas
            .filter((l) => l.cantidad > 0)
            .map((l) => (
              <span key={l.concepto} className="flex justify-between">
                <span>
                  {l.cantidad} {l.texto} × {plata(l.tarifa)}
                </span>
                <b>{plata(l.total)}</b>
              </span>
            ))}
          {resumen.propinas + resumen.ajustes !== 0 && (
            <span className="flex justify-between">
              <span>Propinas y ajustes</span>
              <b>{plata(resumen.propinas + resumen.ajustes)}</b>
            </span>
          )}
          <span>
            Entrega y fallido con evidencia: {plata(resumen.tarifas.entrega)} · cambio, complemento y retiro: {plata(resumen.tarifas.cambio)}. Los pospuestos y los fallidos sin foto no se pagan.
          </span>
          <span>
            De eso, te paga Oceans {plata(resumen.totalOceans)} y ClickSi {plata(resumen.clicksi)} aparte.
          </span>
        </section>
      </div>
      <NavRepartidor activa="pagos" />
    </>
  );
}
