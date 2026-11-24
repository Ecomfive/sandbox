import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/components/af4/boton-imprimir";
import { claseTdLista, claseThLista, MarcoTabla, Pastilla } from "@/components/panel/piezas-panel";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarRuta } from "@/lib/despacho/datos-repartidor";
import { diaLargo, plata } from "@/lib/despacho/panel-repartidor";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Reporte de pago del repartidor" };
export const dynamic = "force-dynamic";

const nombreBonito = (t: string) => t.toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase());

/**
 * Despacho ciudad › Reporte de pago de un repartidor (24 nov 2026): el cierre de su día con cada pedido, si se le paga (entregado o fallido con
 * evidencia) y lo que deposita por tienda. Se imprime o se guarda en PDF.
 */
export default async function ReportePagoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulo("despacho-ciudad");
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const supabase = createServiceClient();
  const { data: c } = await supabase.from("despacho_cierres").select("id, courier, dia, estado, revisado_por_nombre, revisado_en, depositos").eq("id", id).maybeSingle();
  if (!c) notFound();
  const ruta = await cargarRuta(supabase, { id: "", usuarioId: "", courier: c.courier as string, nombre: c.courier as string }, c.dia as string);
  const r = ruta.resumen;
  const sePaga = (estado: string | null, fotos: number) => estado === "ENTREGADO" || (estado === "FALLIDO" && fotos > 0);
  const depositos = (c.depositos as { tienda: string; monto: number; archivo: string | null }[]) ?? [];
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo={`Reporte de pago · ${nombreBonito(c.courier as string)} · ${diaLargo(c.dia as string)}`}>
        {c.estado === "validado" ? `Cierre validado${c.revisado_por_nombre ? ` por ${c.revisado_por_nombre}` : ""}.` : "Cierre todavía sin validar: los montos pueden cambiar."}
      </EncabezadoPagina>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/despacho-ciudad?desde=${c.dia}&hasta=${c.dia}`} className="text-sm font-medium text-primario">
          ← Volver a Despacho ciudad
        </Link>
        <span className="ml-auto">
          <BotonImprimir />
        </span>
      </div>

      <section className="grid grid-cols-2 gap-3 rounded-xl border border-primario/30 bg-primario-suave p-4 text-sm sm:grid-cols-4">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Pedidos</span>
          <b>
            {r.entregados} entregados · {r.pospuestos} pospuestos · {r.fallidos} fallidos
          </b>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Efectivo a depositar</span>
          <b>{plata(r.efectivoTotal)}</b>
          <span className="text-xs">{depositos.map((d) => `${d.tienda} ${plata(d.monto)}${d.archivo ? " ✓" : " (sin foto)"}`).join(" · ") || "—"}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Yappy · MiPOS · transferencia</span>
          <b>{plata(r.digitalesTotal)}</b>
          <span className="text-xs">{r.digitales.map((d) => `${d.tienda} ${plata(d.monto)}`).join(" · ") || "—"}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Pago de envíos</span>
          <b className="text-base">{plata(r.pago.monto)}</b>
          <span className="text-xs">
            {r.entregados} entregados + {r.fallidosConEvidencia} fallidos con evidencia{r.pago.tarifa !== null ? ` × ${plata(r.pago.tarifa)}` : ""}
          </span>
        </div>
      </section>

      <MarcoTabla ariaLabel="Pedidos del día">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={claseThLista}>Pedido</th>
              <th scope="col" className={claseThLista}>Tienda</th>
              <th scope="col" className={claseThLista}>Estado</th>
              <th scope="col" className={claseThLista}>Forma de pago</th>
              <th scope="col" className={`${claseThLista} text-right`}>Cobrado</th>
              <th scope="col" className={`${claseThLista} text-right`}>Coste envío</th>
              <th scope="col" className={claseThLista}>Se paga</th>
              <th scope="col" className={claseThLista}>Fotos</th>
            </tr>
          </thead>
          <tbody>
            {ruta.pedidos.map((p) => {
              const paga = sePaga(p.estado, p.comprobantes);
              return (
                <tr key={p.itemId}>
                  <td className={claseTdLista}>#{p.numero}</td>
                  <td className={claseTdLista}>{p.tiendaTitulo}</td>
                  <td className={claseTdLista}>{p.estado ?? "En ruta"}</td>
                  <td className={claseTdLista}>{p.estado === "ENTREGADO" ? (p.formaPago ?? "—") : "—"}</td>
                  <td className={`${claseTdLista} text-right`}>{p.estado === "ENTREGADO" ? plata(p.cobrado ?? p.porCobrar) : "—"}</td>
                  <td className={`${claseTdLista} text-right`}>{plata(p.costeEnvio)}</td>
                  <td className={claseTdLista}>{paga ? <Pastilla tono="exito">Sí</Pastilla> : <Pastilla>No</Pastilla>}</td>
                  <td className={claseTdLista}>{p.comprobantes || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </MarcoTabla>
    </Pagina>
  );
}
