import type { ReactNode } from "react";
import { ContadorPestana } from "@/components/migas/contador-pestana";
import { contarSinStockPorRevisar } from "./sin-stock/actions";

/**
 * Lo común a todas las pestañas de Compras: la pestaña «Sin stock» lleva el globo con los productos sin stock que faltan por revisar, el mismo
 * número que «Compras» en el menú (30 oct 2026, pedido de Hernán: se veía el número afuera pero no en qué pestaña estaba). La página «Sin
 * stock» lo vuelve a decir al momento, así baja al revisar.
 */
export default function ComprasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ContadorPestana href="/compras/sin-stock" cargar={contarSinStockPorRevisar} />
      {children}
    </>
  );
}
