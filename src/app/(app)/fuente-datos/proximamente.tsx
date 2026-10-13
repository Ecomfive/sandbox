import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";

/**
 * Una pestaña de Fuente de datos (Marketing) que todavía no tiene contenido: la estructura del módulo existe (menú,
 * permiso `fuente-datos` y pestañas en `PESTANAS_POR_MODULO`) y cada fuente se irá llenando de a una.
 */
export async function PestanaProximamente({ titulo }: { titulo: string }) {
  await requireModulo("fuente-datos");
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={titulo} oculto />
      <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Próximamente: {titulo}.</p>
    </Pagina>
  );
}
