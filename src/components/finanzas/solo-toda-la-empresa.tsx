import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";

/** Si la persona tiene tiendas limitadas (mejora 99), las páginas de toda la empresa no muestran datos. */
export async function limitadoATiendas(): Promise<boolean> {
  return !veTodaLaEmpresa(await cargarTiendasPermitidas());
}

/** Lo que ve en una página de toda la empresa (Balance general, Tesorería, Cierre de mes) quien tiene tiendas limitadas. */
export function SoloTodaLaEmpresa({ titulo }: { titulo: string }) {
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={titulo} oculto />
      <EstadoVacioAF4 titulo={`${titulo} es de toda la empresa`} />
    </Pagina>
  );
}
