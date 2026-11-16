import Link from "next/link";
import { TableroDespacho } from "@/components/despacho/tablero-despacho";
import { anilloFoco } from "@/components/ui/field";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarCiudad, rangoDespacho } from "@/lib/despacho/datos";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Despacho ciudad" };

export const dynamic = "force-dynamic";

const RANGOS = [
  { id: "3", etiqueta: "Últimos 3 días", dias: 3 },
  { id: "7", etiqueta: "Últimos 7 días", dias: 7 },
  { id: "30", etiqueta: "Últimos 30 días", dias: 30 },
] as const;

/**
 * Gestión de tienda › Despacho ciudad (15 nov 2026): los repartos de ciudad de todas las tiendas, como el tablero de Monday «DELIVERY REPORTES DIARIOS» y
 * los de cada repartidor, pero en el sistema. Se lee y se escribe en `mon_despachos` (migración 0970): lo que se anota aquí actualiza los pedidos igual
 * que antes lo hacía Monday. Muestra los días elegidos (y los dos siguientes, para lo programado).
 */
export default async function DespachoCiudadPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("despacho-ciudad");
  const sp = await searchParams;
  const rango = RANGOS.find((r) => r.id === sp.dias) ?? RANGOS[1];
  const { desde, hasta, hoy } = rangoDespacho(rango.dias);
  const supabase = createServiceClient();
  const archivados = sp.archivados === "1";
  const { filas, faltaMigracion } = await cargarCiudad(supabase, desde, hasta, archivados);
  const chip = (activo: boolean) =>
    `inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${anilloFoco} ${activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Despacho ciudad" oculto>
        Los repartos de ciudad de todas las tiendas, como en Monday: toca un color para cambiarlo, escribe en las celdas, arrastra una fila a otro día y ábrela para
        comentar o subir el comprobante.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase las migraciones 0970 y 0971 (Despacho ciudad).
        </p>
      ) : (
        <>
          <nav aria-label="Días" className="flex flex-wrap gap-1.5">
            {RANGOS.map((r) => (
              <Link key={r.id} href={`/despacho-ciudad?dias=${r.id}`} aria-current={!archivados && r.id === rango.id ? "page" : undefined} className={chip(!archivados && r.id === rango.id)}>
                {r.etiqueta}
              </Link>
            ))}
            <Link href="/despacho-ciudad?archivados=1" aria-current={archivados ? "page" : undefined} className={`${chip(archivados)} ml-auto`}>
              Archivados
            </Link>
          </nav>
          <TableroDespacho clase="ciudad" filas={filas} hoy={hoy} archivados={archivados} puedeEscribir={!usuario.modulosSoloLectura.includes("despacho-ciudad")} />
        </>
      )}
    </Pagina>
  );
}
