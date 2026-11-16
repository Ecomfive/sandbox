import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarConfig, SIN_MIGRACION_CONFIRMACION } from "@/lib/confirmacion-ia/servidor";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { listarPalabrasZona } from "../ia-actions";
import { PalabrasZona } from "./palabras-zona";

export const metadata = { title: "Palabras de zona" };

export const dynamic = "force-dynamic";

/**
 * Gestión de tienda › Confirmación › Palabras de zona (16 nov 2026, pedido de Hernán): las palabras (una sola, como «Colón», o varias juntas, como «Panamá Este») que, si salen en la dirección,
 * deciden si el pedido es de ciudad o del interior. Son por país. Con ellas, y las direcciones de ejemplo, se arma el pedido a la IA (que las personas no ven).
 */
export default async function ZonasPage() {
  const usuario = await requireModulo("tienda-confirmacion");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { config, faltaMigracion } = await cargarConfig(supabase, pais.id);
  const { palabras } = faltaMigracion ? { palabras: [] } : await listarPalabrasZona();
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Palabras de zona" oculto>
        Palabras que deciden si una dirección es de ciudad o del interior.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {SIN_MIGRACION_CONFIRMACION}
        </p>
      ) : (
        <PalabrasZona paisNombre={pais.nombre} distingueZona={config.distingueZona} puedeEscribir={!usuario.modulosSoloLectura.includes("tienda-confirmacion")} inicial={palabras} />
      )}
    </Pagina>
  );
}
