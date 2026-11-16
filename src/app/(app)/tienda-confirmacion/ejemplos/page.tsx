import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { tiendasVisibles } from "@/lib/confirmacion-ia/acceso";
import { cargarConfig, SIN_MIGRACION_CONFIRMACION } from "@/lib/confirmacion-ia/servidor";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { contarEjemplos } from "../ia-actions";
import { EjemplosDirecciones } from "./ejemplos-direcciones";

export const metadata = { title: "Direcciones de ejemplo" };

export const dynamic = "force-dynamic";

/**
 * Gestión de tienda › Confirmación › Direcciones de ejemplo (16 nov 2026, pedido de Hernán): el equipo agrega direcciones completas e incompletas (y qué les faltaba) para que la IA aprenda cómo es
 * una dirección completa en su país. Son por país; quien ve solo algunas tiendas agrega solo para ellas. La lista no se muestra de entrada: se despliega para corregir o borrar.
 */
export default async function EjemplosPage() {
  const usuario = await requireModulo("tienda-confirmacion");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [{ config, faltaMigracion }, { tiendas, limitado }] = await Promise.all([cargarConfig(supabase, pais.id), tiendasVisibles(supabase, pais.id)]);
  const total = faltaMigracion ? 0 : await contarEjemplos();
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Direcciones de ejemplo" oculto>
        Direcciones completas e incompletas para que la IA aprenda a distinguirlas.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {SIN_MIGRACION_CONFIRMACION}
        </p>
      ) : (
        <EjemplosDirecciones
          paisNombre={pais.nombre}
          distingueZona={config.distingueZona}
          tiendas={tiendas.map((t) => ({ id: t.id, nombre: t.nombre }))}
          tiendaObligatoria={limitado}
          puedeEscribir={!usuario.modulosSoloLectura.includes("tienda-confirmacion")}
          total={total}
        />
      )}
    </Pagina>
  );
}
