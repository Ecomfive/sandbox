import { ContadorPestana } from "@/components/migas/contador-pestana";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePestana } from "@/lib/auth";
import { totalesDeLlegada } from "@/lib/compras/llegadas-avisos";
import { direccionesDeEtiquetas, type EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { createServiceClient } from "@/lib/supabase/server";
import { VistaLlegada } from "../../llegadas/[id]/vista-llegada";
import { ListaLlegadas } from "../../llegadas/lista-llegadas";
import { cargarPanelLlegadas } from "./datos";

export const metadata = { title: "Llegadas · Compras" };

export const dynamic = "force-dynamic";

const dinero = (n: number) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Compras › Llegadas (23 nov 2026, pedido de María José: los avisos de lo que llega se le pierden, quiere un lugar fijo en Compras). Dos listas que se arman solas con la etapa actual de cada
 * compra: **En bodega · por pagar** (cada llegada con su total y «Registrar pago», como en el aviso) y **En puerto · por llegar a bodega** (productos, unidades, cajas y etiqueta). Cuando una
 * compra se paga o cambia de etapa, sale de la lista sin hacer nada. Los avisos «Para ti» siguen existiendo.
 */
export default async function LlegadasComprasPage() {
  const usuario = await requirePestana("compras", "llegadas");
  const supabase = createServiceClient();
  const panel = await cargarPanelLlegadas(supabase, usuario);

  const rutas = [...new Set(panel.puerto.flatMap((f) => f.etiquetasRutas))];
  const firmadas = rutas.length ? await direccionesDeEtiquetas(supabase, rutas) : [];
  const porRuta = new Map(firmadas.map((e) => [e.ruta, e]));
  const etiquetas: Record<string, EtiquetaPedido[]> = {};
  for (const f of panel.puerto) etiquetas[f.compraId] = f.etiquetasRutas.flatMap((r) => (porRuta.get(r) ? [porRuta.get(r)!] : []));

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

      <section aria-labelledby="llegadas-puerto" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="llegadas-puerto" className="m-0 text-lg font-semibold tracking-tight">
            En puerto · por llegar a bodega
          </h2>
          <p className="m-0 text-sm text-muted-foreground">
            {panel.puerto.length === 0 ? "No hay compras en puerto." : `${plural(panel.puerto.length)} que ya llegaron a puerto y todavía no están en bodega.`}
          </p>
        </div>
        {panel.puerto.length > 0 && <ListaLlegadas filas={panel.puerto} etiquetas={etiquetas} periodo="Pendientes de llegar a bodega" />}
      </section>
    </Pagina>
  );
}
