import Link from "next/link";
import { TableroDespacho } from "@/components/despacho/tablero-despacho";
import { anilloFoco } from "@/components/ui/field";
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
 * escribe en `mon_despachos` (migración 0970). Las filas archivadas (0971) se ven aparte, en «Archivados».
 */
export default async function DevolucionesPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("despacho-devoluciones");
  const archivados = (await searchParams).archivados === "1";
  const supabase = createServiceClient();
  const { filas, faltaMigracion } = await cargarDevoluciones(supabase, archivados);
  const { hoy } = rangoDespacho(1);
  const chip = (activo: boolean) =>
    `inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${anilloFoco} ${activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Devoluciones" oculto>
        Los pedidos de ciudad que volvieron, por tienda. Cambia el estado de los asesores, escribe sus observaciones o arrastra la fila a otro grupo.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase las migraciones 0970 y 0971 (Despacho ciudad).
        </p>
      ) : (
        <>
          <nav aria-label="Ver" className="flex flex-wrap gap-1.5">
            <Link href="/despacho-devoluciones" aria-current={!archivados ? "page" : undefined} className={chip(!archivados)}>
              Devoluciones
            </Link>
            <Link href="/despacho-devoluciones?archivados=1" aria-current={archivados ? "page" : undefined} className={chip(archivados)}>
              Archivados
            </Link>
          </nav>
          <TableroDespacho clase="devolucion" filas={filas} hoy={hoy} archivados={archivados} puedeEscribir={!usuario.modulosSoloLectura.includes("despacho-devoluciones")} />
        </>
      )}
    </Pagina>
  );
}
