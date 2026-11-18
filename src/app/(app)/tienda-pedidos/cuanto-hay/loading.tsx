import { CargandoTienda } from "@/components/tienda/cargando-tienda";

export default function CargandoCuantoHay() {
  return <CargandoTienda etiqueta="Cargando cuánto hay" barra={false} tarjetas={0} filas={10} columnas={5} />;
}
