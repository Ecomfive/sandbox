import { notFound, redirect } from "next/navigation";
import { FirmarRecibo } from "@/components/repartidor/firmar-recibo";
import { FORMAS_PAGO_RECIBO, semanaEnLetras, finSemanaPago, diaCorto } from "@/lib/despacho/control-envios";
import { EMPRESA, DECLARACION } from "@/lib/despacho/recibo-pdf";
import { requireRepartidor } from "@/lib/despacho/sesion-repartidor";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { datosPagos } from "../datos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Firmar recibo" };

/** App del delivery › Mis pagos › Firmar recibo (25 nov 2026, pantalla 4 del prototipo aprobado). `?semana=` es el id de la semana mandada. */
export default async function PaginaFirmar({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const cuenta = await requireRepartidor();
  const id = (await searchParams).semana;
  if (!esUuid(id)) notFound();
  const datos = await datosPagos(cuenta);
  if (!datos) notFound();
  const s = datos.semanas.find((x) => x.id === id);
  if (!s?.detalle) notFound();
  if (s.estado === "firmada" || !datos.delivery.nombreCompleto || !datos.delivery.cedula) redirect("/repartidor/pagos");
  const fin = finSemanaPago(s.semana);
  return (
    <FirmarRecibo
      semanaId={s.id}
      rango={`Semana jue ${diaCorto(s.semana)} al mié ${diaCorto(fin)}`}
      nombreCompleto={datos.delivery.nombreCompleto}
      cedula={datos.delivery.cedula}
      empresa={EMPRESA}
      total={s.detalle.totalOceans}
      periodo={semanaEnLetras(s.semana)}
      formaPago={FORMAS_PAGO_RECIBO[datos.delivery.formaPago]}
      declaracion={DECLARACION}
    />
  );
}
