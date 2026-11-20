import { CargandoTienda } from "@/components/tienda/cargando-tienda";

export default function CargandoTableroTiendas() {
  return <CargandoTienda etiqueta="Cargando el Tablero de tiendas" barra={false} tarjetas={4} bloque="h-[320px]" filas={6} />;
}
