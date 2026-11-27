import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { inicioDeMes } from "@/lib/af4/fecha";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { TablaLotes, type FilaLote } from "./tabla-lotes";

export const metadata = { title: "Histórico (Excel)" };

export const dynamic = "force-dynamic";

export default async function LotesPage() {
  await requireModulo("costos-mercancia");
  const supabase = createServiceClient();
  // Lo que no está en la hoja de Costos de producto (0992): el Excel histórico de María José. Sin la 0992, todo.
  const leer = (soloHistorico: boolean) =>
    traerTodasConError<Record<string, unknown>>((d, h) => {
      let q = supabase
        .from("fin_costos_lotes")
        .select("id, producto, producto_clave, linea, hoja, fecha_llegada, mes_texto, proveedor, cantidad, costo_unitario, comisiones, impuesto, envio, financiamiento, costo_total");
      if (soloHistorico) q = q.eq("en_hoja_costos", false);
      return q.order("fecha_llegada", { ascending: false, nullsFirst: false }).order("id").range(d, h);
    });
  let r = await leer(true);
  if (r.error) r = await leer(false);
  if (r.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Histórico (Excel)" imprimir={false} />
        <EstadoVacioAF4 titulo="Faltan los costos de mercancía">Correr la migración 0908 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const filas: FilaLote[] = (r.data ?? []).map((l) => ({
    id: String(l.id),
    producto: String(l.producto),
    clave: String(l.producto_clave),
    linea: String(l.linea),
    hoja: String(l.hoja),
    llegada: (l.fecha_llegada as string | null) ?? null,
    mes: (l.mes_texto as string | null) ?? null,
    proveedor: (l.proveedor as string | null) ?? null,
    cantidad: l.cantidad === null ? null : Number(l.cantidad),
    unitario: Number(l.costo_unitario),
    extras: Number(l.comisiones) + Number(l.impuesto) + Number(l.envio) + Number(l.financiamiento),
    total: Number(l.costo_total),
  }));
  const ultima = filas.map((f) => f.llegada).filter(Boolean).sort().at(-1);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Histórico (Excel)" datosHasta={ultima ? inicioDeMes(ultima) : null} imprimir={false} />
      <TablaLotes filas={filas} />
    </Pagina>
  );
}
