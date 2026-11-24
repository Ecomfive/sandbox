import { CierresRepartidores } from "@/components/despacho/cierres-repartidores";
import { TableroDespacho } from "@/components/despacho/tablero-despacho";
import { BarraPeriodo } from "@/components/despacho/barra-periodo";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePanel } from "@/lib/auth";
import { cargarCiudad, rangoDespacho } from "@/lib/despacho/datos";
import { diaTexto, rangoElegido } from "@/lib/despacho/etiquetas";
import { cargarCierres } from "@/lib/despacho/cierres";
import { esAdministrador } from "@/lib/permisos/acceso";
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
  const usuario = await requirePanel("/despacho-ciudad", "despacho-ciudad");
  const sp = await searchParams;
  const rango = RANGOS.find((r) => r.id === sp.dias) ?? RANGOS[1];
  // Un día o un rango elegido («Del … al …», 24 nov 2026, para los cierres de pago a los mensajeros): manda sobre los últimos N días.
  const elegido = rangoElegido(sp.desde, sp.hasta);
  const { hoy, desde: ayer } = rangoDespacho(2);
  const { desde, hasta } = elegido ?? rangoDespacho(rango.dias);
  const supabase = createServiceClient();
  const archivados = sp.archivados === "1";
  const [{ filas, faltaMigracion }, cierres] = await Promise.all([cargarCiudad(supabase, desde, hasta, archivados), archivados ? Promise.resolve([]) : cargarCierres(supabase, desde, hasta)]);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("despacho-ciudad");
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
          {/* Menos botones sueltos (24 nov 2026, pedido de despacho): el período en un botón y lo demás en «Más», como Monday. */}
          <BarraPeriodo
            actual={archivados ? "Archivados" : elegido ? (elegido.desde === elegido.hasta ? (elegido.desde === hoy ? "Hoy" : elegido.desde === ayer ? "Ayer" : diaTexto(elegido.desde)) : `Del ${diaTexto(elegido.desde)} al ${diaTexto(elegido.hasta)}`) : rango.etiqueta}
            opciones={[
              { etiqueta: "Hoy", href: `/despacho-ciudad?desde=${hoy}&hasta=${hoy}`, activa: !archivados && elegido?.desde === hoy && elegido.hasta === hoy },
              { etiqueta: "Ayer", href: `/despacho-ciudad?desde=${ayer}&hasta=${ayer}`, activa: !archivados && elegido?.desde === ayer && elegido.hasta === ayer },
              ...RANGOS.map((r) => ({ etiqueta: r.etiqueta, href: `/despacho-ciudad?dias=${r.id}`, activa: !archivados && !elegido && r.id === rango.id })),
            ]}
            desde={elegido?.desde ?? ""}
            hasta={elegido?.hasta ?? ""}
            mas={[
              { etiqueta: "Hoja del día", href: "/despacho-ciudad/hoja", activa: false },
              ...(esAdministrador(usuario) ? [{ etiqueta: "Cuentas de repartidores", href: "/despacho-ciudad/repartidores", activa: false }] : []),
              archivados ? { etiqueta: "Volver al tablero", href: "/despacho-ciudad", activa: false } : { etiqueta: "Archivados", href: "/despacho-ciudad?archivados=1", activa: false },
            ]}
          />
          {elegido && !archivados && (
            <p className="m-0 text-[13px] text-muted-foreground">
              Mostrando {elegido.desde === elegido.hasta ? `el ${diaTexto(elegido.desde)}` : `del ${diaTexto(elegido.desde)} al ${diaTexto(elegido.hasta)}`}. Combínalo con el repartidor y los
              filtros de abajo.
            </p>
          )}
          {/* Los cierres que mandan los repartidores desde su panel (24 nov 2026), para validarlos. */}
          <CierresRepartidores cierres={cierres} puedeEscribir={puedeEscribir} />
          <TableroDespacho clase="ciudad" filas={filas} hoy={hoy} archivados={archivados} mostrarHoy={!elegido || (elegido.desde <= hoy && hoy <= elegido.hasta)} puedeEscribir={!usuario.modulosSoloLectura.includes("despacho-ciudad")} />
        </>
      )}
    </Pagina>
  );
}
