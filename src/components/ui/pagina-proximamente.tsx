import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";

/**
 * La página de un módulo que ya existe en el menú y en los permisos pero todavía no tiene contenido (los de Testing Lab
 * mientras se construyen): comprueba el acceso y dice «Próximamente».
 */
export async function PaginaProximamente({ modulo, titulo }: { modulo: string; titulo: string }) {
  await requireModulo(modulo);
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={titulo} oculto />
      <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Próximamente: {titulo}.</p>
    </Pagina>
  );
}
