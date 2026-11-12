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
 * equipo en Shopify con etiquetas. Programados llega con WhatsApp (allá la fecha sale de la conversación).
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
  after(() => revisarSiHaceFalta(createServiceClient(), tiendas));
  const { pedidos, fuente, periodo } = await pedidosDeTiendas(supabase, miradas, pais.codigo, eleccion, { minDias: DIAS_COLA });
  const delPeriodo = pedidos.filter((p) => diaPanama(p.creado) >= periodo.desde && diaPanama(p.creado) <= periodo.hasta);
  // La cola: los sin confirmar que llegaron de Shopify (los del Excel de Finanzas son una foto vieja: ya no se gestionan), lo más viejo arriba.
  const sinConfirmar = pedidos.filter((p) => p.estado === "nuevo" && !p.sinHora).sort((a, b) => a.creado.localeCompare(b.creado));
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
            delPeriodo={delPeriodo}
            periodo={periodo.etiqueta.toLowerCase()}
            codigoPais={pais.codigo}
            tiendas={Object.fromEntries(tiendas.map((t) => [t.id, t.nombre]))}
            ahora={ahoraMismo()}
          />
        </>
      )}
    </Pagina>
  );
}
