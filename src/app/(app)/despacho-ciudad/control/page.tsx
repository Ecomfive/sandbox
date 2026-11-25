import { notFound } from "next/navigation";
import { ControlEnvios, type FilaControl } from "@/components/despacho/control-envios";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { finSemanaPago, inicioSemanaPago, TIENDAS_OCEANS, totalesSemana } from "@/lib/despacho/control-envios";
import { cargarControl, recibosDelMes } from "@/lib/despacho/datos-control";
import { rangoDespacho } from "@/lib/despacho/datos";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Control de envíos" };
export const dynamic = "force-dynamic";

/**
 * Envíos Delivery › Control de envíos (25 nov 2026, pedido de Hernán para Yiletsi; pantallas 2 y 7 del prototipo aprobado
 * https://claude.ai/artifact/8mbjcbJGELtkGhvmpSdKhX). Reemplaza el Excel «GESTION DELIVERYS»: lo que se le paga a cada delivery en la semana (de
 * jueves a miércoles), por tienda, con ClickSi aparte; el detalle día por día de cada uno; propinas, ajustes y nota; cerrar la semana y mandarla a la
 * app de cada delivery para que firme el recibo de Oceans; y los recibos firmados para descargar. Solo con todas las tiendas.
 */
export default async function ControlEnviosPage({ searchParams }: { searchParams: Promise<{ semana?: string; d?: string; mes?: string }> }) {
  const usuario = await requireModulo("despacho-ciudad");
  if (await cargarTiendasPermitidas()) notFound();
  const sp = await searchParams;
  const { hoy } = rangoDespacho(1);
  const actual = inicioSemanaPago(hoy);
  const pedida = typeof sp.semana === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana) ? inicioSemanaPago(sp.semana) : actual;
  const jueves = pedida > actual ? actual : pedida;
  const mes = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : jueves.slice(0, 7);
  const supabase = createServiceClient();
  const [control, recibos] = await Promise.all([cargarControl(supabase, jueves), recibosDelMes(supabase, mes)]);
  if (!control) {
    return (
      <Pagina ancho="ancha">
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0366 (control de envíos).
        </p>
      </Pagina>
    );
  }
  const porId = new Map(control.deliverys.map((d) => [d.id, d]));
  const filas: FilaControl[] = control.resumenes.map((r) => {
    const s = r.deliveryId ? control.semanas.get(r.deliveryId) : undefined;
    const d = r.deliveryId ? porId.get(r.deliveryId) : undefined;
    return {
      ...r,
      semanaId: s?.id ?? null,
      estado: s?.estado ?? "abierta",
      ajustesLista: s?.ajustes ?? [],
      nota: s?.nota ?? "",
      firmadaEn: s?.firmadaEn ?? null,
      anulados: s?.anulados.length ?? 0,
      datos: d ? { nombreCompleto: d.nombreCompleto ?? "", cedula: d.cedula ?? "", formaPago: d.formaPago, activo: d.activo } : null,
    };
  });
  const tiendas = [...new Set([...TIENDAS_OCEANS, ...filas.flatMap((f) => Object.keys(f.porTienda))])];
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Control de envíos" oculto>
        Lo que se le paga a cada delivery en la semana, de jueves a miércoles: se cierra el jueves, se le manda a su app y firma el recibo de Oceans.
      </EncabezadoPagina>
      <ControlEnvios
        jueves={jueves}
        fin={finSemanaPago(jueves)}
        actual={actual}
        terminada={finSemanaPago(jueves) < hoy}
        filas={filas}
        tiendas={tiendas}
        totales={totalesSemana(control.resumenes)}
        elegido={typeof sp.d === "string" ? sp.d : null}
        mes={mes}
        recibos={recibos.map((r) => ({ id: r.id, semana: r.semana, delivery: r.delivery, total: r.totalOceans, estado: r.estado, firmadaEn: r.firmadaEn, pdf: !!r.pdfRuta }))}
        puedeEscribir={!usuario.modulosSoloLectura.includes("despacho-ciudad")}
      />
    </Pagina>
  );
}
