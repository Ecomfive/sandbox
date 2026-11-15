import { TableroDespacho } from "@/components/despacho/tablero-despacho";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarDevoluciones, rangoDespacho } from "@/lib/despacho/datos";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Devoluciones" };

export const dynamic = "force-dynamic";

/**
 * Gestión de tienda › Devoluciones (15 nov 2026): los pedidos de ciudad que volvieron, por tienda, como los tableros «GESTION DEVOLUCION» de Monday: sus
 * tres grupos, el estado y las observaciones de los asesores, y la regla de Monday (DESINTEGRADO pasa la fila a Rechazados / cancelados). Se lee y se
 * escribe en `mon_despachos` (migración 0970).
 */
export default async function DevolucionesPage() {
  const usuario = await requireModulo("despacho-devoluciones");
  const supabase = createServiceClient();
  const { filas, faltaMigracion } = await cargarDevoluciones(supabase);
  const { hoy } = rangoDespacho(1);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Devoluciones" oculto>
        Los pedidos de ciudad que volvieron, por tienda. Cambia el estado de los asesores, escribe sus observaciones o arrastra la fila a otro grupo.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0970 (Despacho ciudad).
        </p>
      ) : (
        <TableroDespacho clase="devolucion" filas={filas} hoy={hoy} puedeEscribir={!usuario.modulosSoloLectura.includes("despacho-devoluciones")} />
      )}
    </Pagina>
  );
}
