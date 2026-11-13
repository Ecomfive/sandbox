import { after } from "next/server";
import { AvisoConexion, BarraTienda, FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { formatearFechaHora } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { revisarSiHaceFalta } from "@/lib/tienda/conectar-shopify";
import { cargarTiendas, tiendaElegida } from "@/lib/tienda/datos";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { entregasDeOrdenes, guiasDeOrdenes } from "@/lib/tienda/entregas-monday";
import { etapaLogistica } from "@/lib/tienda/logistica";
import { diaPanama } from "@/lib/tienda/resumen";
import { LeerSiscore } from "./leer-siscore";
import { LogisticaTienda } from "./logistica-tienda";

export const metadata = { title: "Logística de tienda" };

export const dynamic = "force-dynamic";

/** Hasta dónde se buscan pedidos por preparar y en ruta (todos los pendientes, como Mi Reto Digital). */
const DIAS_LOGISTICA = 60;
/** Cuántos días se siguen viendo en Entregados y Rechazados los pedidos que cerraron Monday o Servientrega. */
const DIAS_CERRADOS = 7;

const ahoraMismo = () => Date.now();

/**
 * Gestión de tienda › Logística (12 nov 2026, como la pantalla de Mi Reto Digital, con lo que hay): los pedidos confirmados por preparar (listos hoy
 * o programados para después, por la fecha de la nota), los que van en ruta por zona y los demorados. Solo lectura. Shopify no trae la guía ni la
 * entrega de Kenku: lo despachado queda en ruta, con los días contados desde el pedido, salvo lo que Monday (ciudad) marca entregado o rechazado.
 */
export default async function LogisticaTiendaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("tienda-logistica");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, faltaMigracion } = await cargarTiendas(supabase, pais.id);
  const tienda = tiendaElegida(tiendas, sp.tienda);
  const miradas = tienda ? [tienda] : tiendas;
  after(() => revisarSiHaceFalta(createServiceClient(), tiendas));
  const { pedidos, fuente } = await pedidosDeTiendas(supabase, miradas, pais.codigo, { tipo: "atajo", id: "hoy" }, { minDias: DIAS_LOGISTICA });
  // Lo que se gestiona: los que llegaron de Shopify (los del Excel de Finanzas son una foto vieja), por preparar o en ruta, lo más viejo arriba.
  // Desde el 12 nov 2026 lo que Monday o Servientrega dan por entregado o devuelto pasa a esa fase en la orden: para que las tarjetas Entregados y
  // Rechazados sigan diciendo algo, también van los cerrados por ellos en los últimos días (`DIAS_CERRADOS`).
  const candidatos = pedidos.filter((p) => !p.sinHora && etapaLogistica(p.estado) !== null).sort((a, b) => a.creado.localeCompare(b.creado));
  // Las entregas: de interior, la guía de Servientrega leída de SISCORE; de ciudad, lo registrado en Monday (entregado, rechazado, el repartidor).
  const ids = candidatos.map((p) => p.id);
  const [entregas, guias, { data: lecturas }] = await Promise.all([
    entregasDeOrdenes(supabase, ids),
    guiasDeOrdenes(supabase, ids),
    supabase.from("tienda_guias_lecturas").select("fin").eq("estado", "listo").order("fin", { ascending: false }).limit(1),
  ]);
  for (const p of candidatos) {
    const g = guias.get(p.id) ?? null;
    p.entrega = g ?? entregas.get(p.id) ?? null;
    if (g?.guia) {
      p.transportista = "Servientrega";
      p.guia = g.guia;
    } else if (!p.transportista && p.entrega?.repartidor) p.transportista = p.entrega.repartidor;
  }
  const desde = new Date(ahoraMismo() - DIAS_CERRADOS * 86_400_000).toISOString().slice(0, 10);
  const activos = candidatos.filter((p) => {
    const e = etapaLogistica(p.estado);
    return e === "por_preparar" || e === "en_ruta" || (!!p.entrega?.fecha && p.entrega.fecha >= desde);
  });
  const ultimaSiscore = (lecturas?.[0]?.fin as string | undefined) ?? null;
  const puedeLeer = !usuario.modulosSoloLectura.includes("tienda-logistica");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Logística" oculto>
        Los pedidos de las tiendas de {pais.nombre} por preparar y en ruta.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <FaltaMigracionTienda />
      ) : !tiendas.length ? (
        <SinTiendas pais={pais.nombre} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <BarraTienda ruta="/tienda-logistica" tiendas={tiendas} tiendaId={tienda?.id ?? null} />
            {puedeLeer && <LeerSiscore ultima={ultimaSiscore ? formatearFechaHora(ultimaSiscore) : null} />}
          </div>
          <AvisoConexion tiendas={miradas} finanzas={fuente} />
          <LogisticaTienda
            pedidos={activos}
            codigoPais={pais.codigo}
            tiendas={Object.fromEntries(tiendas.map((t) => [t.id, t.nombre]))}
            hoy={diaPanama(new Date(ahoraMismo()).toISOString())}
          />
        </>
      )}
    </Pagina>
  );
}
