import { CargandoTienda } from "@/components/tienda/cargando-tienda";

export default function CargandoPedido() {
  return <CargandoTienda etiqueta="Cargando el pedido" barra={false} tarjetas={0} bloque="h-40" filas={4} columnas={4} />;
}
