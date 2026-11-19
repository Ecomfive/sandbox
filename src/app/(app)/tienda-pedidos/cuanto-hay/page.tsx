import { redirect } from "next/navigation";

/** «Preguntar cuánto hay» pasó a Comunicación despacho (19 nov 2026, pedido de Hernán): los avisos y favoritos viejos llegan a la nueva. */
export default function CuantoHayViejo() {
  redirect("/inventario-pedidos-despacho/cuanto-hay");
}
