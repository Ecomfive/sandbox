import Link from "next/link";
import { TableroCambios } from "@/components/despacho/tablero-cambios";
import { anilloFoco } from "@/components/ui/field";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarCasos } from "@/lib/postventa/datos";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Cambios y reembolsos" };

export const dynamic = "force-dynamic";

const VISTAS = [
  { id: "60", etiqueta: "Realizados: últimos 60 días", dias: 60 as number | null },
  { id: "todos", etiqueta: "Todos los realizados", dias: null },
];

/**
 * Gestión de tienda › Cambios y reembolsos (16 nov 2026): el tablero «CAMBIOS Y REEMBOLSOS PANAMA» de Monday en el sistema, para todas las tiendas.
 * Se lee y se escribe en `mon_postventa` (migración 0972), la misma tabla que leen la ficha del pedido, Pedidos y Logística.
 */
export default async function CambiosPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("despacho-cambios");
  const sp = await searchParams;
  const archivados = sp.archivados === "1";
  const vista = VISTAS.find((v) => v.id === sp.realizados) ?? VISTAS[0];
  const caso = typeof sp.caso === "string" ? sp.caso : null;
  const { filas, personas, faltaMigracion } = await cargarCasos(createServiceClient(), { diasRealizados: vista.dias, archivados });
  const chip = (activo: boolean) =>
    `inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${anilloFoco} ${activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Cambios y reembolsos" oculto>
        Las solicitudes de cambio, reembolso, retiro y complemento de todas las tiendas, como en Monday: cambia el Estado y la solicitud pasa sola de grupo.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0972 (Cambios y reembolsos).
        </p>
      ) : (
        <>
          <nav aria-label="Ver" className="flex flex-wrap gap-1.5">
            {VISTAS.map((v) => (
              <Link key={v.id} href={`/despacho-ciudad/cambios?realizados=${v.id}`} aria-current={!archivados && v.id === vista.id ? "page" : undefined} className={chip(!archivados && v.id === vista.id)}>
                {v.etiqueta}
              </Link>
            ))}
            <Link href="/despacho-ciudad/cambios?archivados=1" aria-current={archivados ? "page" : undefined} className={`${chip(archivados)} ml-auto`}>
              Archivados
            </Link>
          </nav>
          <TableroCambios filas={filas} personas={personas} archivados={archivados} casoInicial={caso} puedeEscribir={!usuario.modulosSoloLectura.includes("despacho-cambios")} />
        </>
      )}
    </Pagina>
  );
}
