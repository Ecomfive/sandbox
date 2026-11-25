import { after } from "next/server";
import { HojaDia } from "@/components/despacho/hoja-dia";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarCiudad, rangoDespacho } from "@/lib/despacho/datos";
import { archivosPorFila, BUCKET_COMPROBANTES, copiarPendientes } from "@/lib/monday/comprobantes";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Hoja del día" };

export const dynamic = "force-dynamic";

/**
 * Envíos Delivery › Hoja del día (16 nov 2026): los pedidos que Despacho cargó para un día, por repartidor, solo con las columnas del tablero de cada
 * repartidor en Monday y los comprobantes (se ven aquí mismo). Se imprime o se baja en Excel, de respaldo si se cae la conexión.
 */
export default async function HojaDiaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("despacho-ciudad");
  const sp = await searchParams;
  const { hoy } = rangoDespacho(1);
  const dia = typeof sp.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : hoy;
  const supabase = createServiceClient();
  const { filas, faltaMigracion } = await cargarCiudad(supabase, dia, dia);
  const { porFila, porCopiar } = await archivosPorFila(
    supabase,
    filas.filter((f) => f.archivos.length).map((f) => ({ id: f.itemId, lista: f.archivos })),
    BUCKET_COMPROBANTES,
  );
  if (porCopiar.length) after(() => copiarPendientes(createServiceClient(), porCopiar));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Hoja del día" oculto>
        Los pedidos que Despacho cargó para el día, por repartidor, con las columnas de Monday. Se imprime o se baja en Excel.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0970 (Envíos Delivery).
        </p>
      ) : (
        <HojaDia
          dia={dia}
          hoy={hoy}
          filas={filas.map((f) => ({ ...f, archivos: [], fotos: porFila.get(f.itemId) ?? [] }))}
        />
      )}
    </Pagina>
  );
}
