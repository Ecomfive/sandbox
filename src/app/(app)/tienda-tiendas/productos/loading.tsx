import { CargandoTienda } from "@/components/tienda/cargando-tienda";

export default function CargandoProductosTienda() {
  return <CargandoTienda etiqueta="Cargando los productos de la tienda" periodo={false} tarjetas={0} filas={10} columnas={5} />;
}
