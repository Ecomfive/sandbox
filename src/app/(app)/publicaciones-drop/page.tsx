import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { formatearFechaHora } from "@/lib/formato";
import { formatoMonto } from "@/lib/publicaciones/moneda";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { avisoPaisDrop } from "./aviso-pais-drop";
import { cargarDatosDrop } from "./datos-drop";
import { ListaPublicacionesDrop } from "./lista-publicaciones-drop";
import { TableroDrop } from "./tablero-drop";

export const metadata = { title: "Gestión de IDs Drop" };

export const dynamic = "force-dynamic";

/**
 * Operación › Fulfillment: los productos publicados en Drop, otra aplicación aparte de Dropi (3 nov 2026). Mismo orden y mismas piezas que Gestión de IDs Dropi
 * (tablero de acciones arriba y lista de filas debajo), con los datos que se leen de Drop (migración 0221; Drop es de Costa Rica): las publicaciones del
 * país elegido arriba.
 */
export default async function PublicacionesDropPage() {
  const usuario = await requireModulo("publicaciones-drop");
  // Drop es solo de Costa Rica: con otro país elegido, la página dice dónde existe (avisoPaisDrop).
  const aviso = await avisoPaisDrop(usuario, "Gestión de IDs Drop");
  if (aviso) return aviso;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await cargarDatosDrop(supabase, pais);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("publicaciones-drop");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Gestión de IDs Drop" oculto />
      {datos.faltaMigracion && (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0221 (Gestión de IDs Drop) para ver las publicaciones de Drop.
        </p>
      )}
      <TableroDrop publicaciones={datos.publicaciones} />
      {datos.publicaciones.length > 0 && (
        <p className="m-0 -mt-3 text-xs text-muted-foreground">
          {datos.ultimaLectura ? `Última lectura de Drop: ${formatearFechaHora(datos.ultimaLectura)}. ` : ""}
          {datos.fulfillment === null
            ? "El margen se calcula sin fulfillment: ponlo en Configuración › Plataformas del país, en la fila «Drop»."
            : `Margen con el costo de cada producto en Gestión de IDs Dropi y el fulfillment de Drop (${formatoMonto(datos.fulfillment, datos.moneda)}).`}
        </p>
      )}
      <ListaPublicacionesDrop
        publicaciones={datos.publicaciones}
        moneda={datos.moneda}
        puedeEscribir={puedeEscribir}
        vacio="Todavía no hay publicaciones de Drop: falta la primera lectura."
      />
    </Pagina>
  );
}
