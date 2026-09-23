import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";

export const metadata = { title: "Filtros · Compras" };

/** Todavía no está definido qué guarda esta pestaña (vistas guardadas, listas de proveedores/tiendas,
 * etc.) — por ahora es un lugar reservado junto a «Productos», como «Cuentas destino» en Retiros. */
export default async function FiltrosComprasPage() {
  await requireModulo("compras");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Filtros" oculto />
      <EstadoVacio mensaje="Todavía no hay nada configurado aquí." />
    </Pagina>
  );
}
