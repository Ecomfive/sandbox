import { after } from "next/server";
import { AvisoConexion, BarraTienda, FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { revisarSiHaceFalta } from "@/lib/tienda/conectar-shopify";
import { cargarTiendas, periodoElegido, tiendaElegida } from "@/lib/tienda/datos";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { diaPanama } from "@/lib/tienda/resumen";
import { ConfirmacionTienda } from "./confirmacion-tienda";

export const metadata = { title: "Confirmación de tienda" };

export const dynamic = "force-dynamic";

/** Hasta dónde se buscan pedidos sin confirmar, aunque el periodo elegido sea más corto (en Mi Reto Digital la cola es «todos los pendientes»). */
const DIAS_COLA = 60;

/** La hora de ahora, para «cuánto lleva esperando» (se calcula una vez en el servidor). */
const ahoraMismo = () => Date.now();

/**
 * Gestión de tienda › Confirmación (12 nov 2026, como la pantalla de Mi Reto Digital): la cola de pedidos sin confirmar (lo más viejo arriba), los
 * que esperan respuesta del cliente, los confirmados y cancelados del periodo y la tasa de confirmación contra la meta. Solo lectura: lo marca el
 * equipo en Shopify con etiquetas. Programados: la fecha que pidió el cliente, leída de la nota del pedido (así la deja el equipo al confirmar).
 */
export default async function ConfirmacionTiendaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("tienda-confirmacion");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, faltaMigracion } = await cargarTiendas(supabase, pais.id);
  const tienda = tiendaElegida(tiendas, sp.tienda);
  const eleccion = periodoElegido(sp);
  const miradas = tienda ? [tienda] : tiendas;
  // Solo la tienda que se mira (14 nov 2026: «si abro Kenku, que se actualice Kenku»); con «Todas», todas.
  after(() => revisarSiHaceFalta(createServiceClient(), miradas));
  const { pedidos, fuente, periodo } = await pedidosDeTiendas(supabase, miradas, pais.codigo, eleccion, { minDias: DIAS_COLA });
  const delPeriodo = pedidos.filter((p) => diaPanama(p.creado) >= periodo.desde && diaPanama(p.creado) <= periodo.hasta);
  // La cola: los sin confirmar que llegaron de Shopify (los del Excel de Finanzas son una foto vieja: ya no se gestionan), lo más viejo arriba.
  const sinConfirmar = pedidos.filter((p) => p.estado === "nuevo" && !p.sinHora).sort((a, b) => a.creado.localeCompare(b.creado));
  // Programados: los que todavía no salen (sin confirmar o confirmados) y tienen fecha en la nota, por fecha (12 nov 2026).
  const programados = pedidos
    .filter((p) => (p.estado === "nuevo" || p.estado === "confirmado") && p.programado)
    .sort((a, b) => a.programado!.fecha.localeCompare(b.programado!.fecha));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Confirmación" oculto>
        Los pedidos de las tiendas de {pais.nombre} por confirmar, esperando respuesta, confirmados y cancelados.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <FaltaMigracionTienda />
      ) : !tiendas.length ? (
        <SinTiendas pais={pais.nombre} />
      ) : (
        <>
          <BarraTienda ruta="/tienda-confirmacion" tiendas={tiendas} tiendaId={tienda?.id ?? null} periodo={periodo} />
          <AvisoConexion tiendas={miradas} finanzas={fuente} />
          <ConfirmacionTienda
            sinConfirmar={sinConfirmar}
            programados={programados}
            delPeriodo={delPeriodo}
            periodo={periodo.etiqueta.toLowerCase()}
            codigoPais={pais.codigo}
            tiendas={Object.fromEntries(tiendas.map((t) => [t.id, t.nombre]))}
            ahora={ahoraMismo()}
            hoy={diaPanama(new Date(ahoraMismo()).toISOString())}
          />
        </>
      )}
    </Pagina>
  );
}
