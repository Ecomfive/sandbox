import Link from "next/link";
import { ContadorPestana } from "@/components/migas/contador-pestana";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePestana } from "@/lib/auth";
import { totalesDeLlegada } from "@/lib/compras/llegadas-avisos";
import { createServiceClient } from "@/lib/supabase/server";
import { VistaLlegada } from "../../llegadas/[id]/vista-llegada";
import { cargarPanelLlegadas } from "./datos";

export const metadata = { title: "Llegadas · Compras" };

export const dynamic = "force-dynamic";

const dinero = (n: number) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Compras › Llegadas (23 nov 2026, pedido de María José: los avisos de lo que llega se le pierden, quiere un lugar fijo en Compras). Lo que llegó a bodega y falta pagar, armado con la etapa actual de cada compra:
 * cada llegada con su total y «Registrar pago», como en el aviso. Cuando una compra se paga o cambia de etapa, sale de la lista sin hacer nada. Lo que llegó a puerto es el módulo «Llegadas a puerto»
 * (`/llegadas`), que se enlaza desde aquí. Los avisos «Para ti» siguen existiendo.
 */
export default async function LlegadasComprasPage() {
  const usuario = await requirePestana("compras", "llegadas");
  const supabase = createServiceClient();
  const panel = await cargarPanelLlegadas(supabase, usuario);

  const filasBodega = panel.bodega.flatMap((g) => g.filas);
  const t = totalesDeLlegada(filasBodega);
  const plural = (n: number) => `${n} ${n === 1 ? "compra" : "compras"}`;

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Llegadas" oculto />
      <ContadorPestana href="/compras/llegadas" cantidad={filasBodega.length} />

      <section aria-labelledby="llegadas-bodega" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="llegadas-bodega" className="m-0 text-lg font-semibold tracking-tight">
            En bodega · por pagar
          </h2>
          <p className="m-0 text-sm text-muted-foreground">
            {filasBodega.length === 0
              ? "No hay compras en bodega esperando el pago."
              : `${plural(filasBodega.length)} en bodega${panel.verMontos && t.porPagar > 0 ? ` · ${dinero(t.porPagar)} por pagar` : ""}.`}
          </p>
          <Link href="/llegadas" className="w-fit text-sm font-medium text-primario underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Ver lo que llegó a puerto
          </Link>
        </div>
        {panel.bodega.map((g) => (
          <VistaLlegada
            key={g.llegadaId}
            llegadaId={g.llegadaId}
            tipo="bodega"
            filas={g.filas}
            etiquetas={{}}
            verMontos={panel.verMontos}
            puedePagar={panel.puedePagar}
            hoy={panel.hoy}
            avisadaPor={g.avisadaPor}
            avisadaEn={g.avisadaEn}
          />
        ))}
      </section>

    </Pagina>
  );
}
