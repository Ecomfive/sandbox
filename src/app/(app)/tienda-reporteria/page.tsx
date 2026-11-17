import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { filtrarUnidades } from "@/lib/finanzas/tiendas-permitidas";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { compactarFilas } from "@/lib/ventas/reporteria";
import { cargarReporteria, mesesReporteria, movimientosReporteria, SIN_MIGRACION_REPORTERIA, tiendasReporteria } from "@/lib/ventas/reporteria-datos";
import { Reporteria } from "./reporteria";

export const metadata = { title: "Reportería de pedidos" };

export const dynamic = "force-dynamic";

const MES = /^\d{4}-\d{2}$/;
const mesDePanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" }).slice(0, 7);

/**
 * Operación › Gestión de tienda › Reportería de pedidos (17 nov 2026, pedido de Hernán; prototipo https://claude.ai/artifact/TNhc38acs7JZzNcsLSgUze):
 * la Matriz de administración («NUEVA GESTION OCEANS PANAMA») dentro del sistema, para que María José y su equipo trabajen aquí y no en el Excel.
 * Todos los pedidos de las tiendas del país con todas las columnas de la Matriz, un mes a la vez; lo que se llena a mano se edita en la tabla y queda
 * en Movimientos. Ventas por tienda (Finanzas) sale de los mismos pedidos.
 */
export default async function ReporteriaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("tienda-reporteria");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  // Solo las tiendas de la persona (17 nov 2026): con tiendas limitadas, solo las suyas y nunca «Todas».
  const permitidas = await cargarTiendasPermitidas();
  const todas = filtrarUnidades(permitidas, await tiendasReporteria(supabase, pais.id));
  // Solo las tiendas con pedidos (en el libro hay unidades de clase tienda sin pedidos, como «ECOMFIVE»).
  const { meses, conPedidos } = await mesesReporteria(supabase, todas.map((t) => t.id));
  const tiendas = todas.filter((t) => conPedidos.has(t.id));
  const tienda = (typeof sp.tienda === "string" ? (tiendas.find((t) => t.id === sp.tienda) ?? null) : null) ?? (permitidas ? (tiendas[0] ?? null) : null);
  const miradas = tienda ? [tienda] : tiendas;
  const actual = mesDePanama();
  const mes = typeof sp.mes === "string" && MES.test(sp.mes) ? sp.mes : (meses.includes(actual) ? actual : (meses[0] ?? actual));
  const [{ filas, faltaMigracion }, movimientos] = await Promise.all([
    cargarReporteria(supabase, miradas, `${mes}-01`),
    movimientosReporteria(supabase, miradas.map((t) => t.id)),
  ]);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Reportería de pedidos">
        Todos los pedidos de las tiendas de {pais.nombre} con todas las columnas de la Matriz. Se trabaja aquí, como hoy se trabaja el Excel; Ventas por tienda
        (Finanzas) toma sus números de estos mismos pedidos.
      </EncabezadoPagina>
      {faltaMigracion && (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {SIN_MIGRACION_REPORTERIA}
        </p>
      )}
      <Reporteria
        filas={compactarFilas(permitidas ? filas.map((f) => ({ ...f, costo: null, costoFuente: null })) : filas)}
        sinCostos={permitidas !== null}
        tiendas={tiendas}
        tiendaId={tienda?.id ?? null}
        mes={mes}
        meses={meses.includes(mes) ? meses : [mes, ...meses]}
        movimientos={movimientos}
        codigoPais={pais.codigo}
        puedeEscribir={!usuario.modulosSoloLectura.includes("tienda-reporteria") && !faltaMigracion}
      />
    </Pagina>
  );
}
