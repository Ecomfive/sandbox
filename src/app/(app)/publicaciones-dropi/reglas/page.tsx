import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { ContadorPestana } from "@/components/migas/contador-pestana";
import { requireModulo } from "@/lib/auth";
import { cargarReglas } from "@/lib/publicaciones/reglas-datos";
import { createServiceClient } from "@/lib/supabase/server";
import { contarRecomendacionesPendientes } from "../recomendaciones-actions";
import { cargarEstilos } from "@/lib/publicaciones/ia/estilos-datos";
import { cargarIndicaciones } from "@/lib/publicaciones/ia/indicaciones-datos";
import { proveedorTexto } from "@/lib/publicaciones/ia/proveedor";
import { EstilosImagen } from "./estilos-imagen";
import { FormularioReglas } from "./formulario-reglas";
import { IndicacionesIA } from "./indicaciones-ia";

export const metadata = { title: "Reglas · Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";

/** Gestión de IDs Dropi › Reglas: los umbrales con que el sistema calcula las acciones y las recomendaciones. */
export default async function ReglasPage() {
  const usuario = await requireModulo("publicaciones-dropi");
  const supabase = createServiceClient();
  const [guardadas, ia, imagenes] = await Promise.all([cargarReglas(supabase), cargarIndicaciones(supabase), cargarEstilos(supabase)]);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("publicaciones-dropi");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Reglas" oculto />
      <ContadorPestana href="/publicaciones-dropi/recomendaciones" cargar={contarRecomendacionesPendientes} />
      <FormularioReglas reglas={guardadas.reglas} cambios={guardadas.cambios} disponible={guardadas.disponible} puedeEscribir={puedeEscribir} />
      <IndicacionesIA indicaciones={ia.indicaciones} disponible={ia.disponible} puedeEscribir={puedeEscribir} />
      <EstilosImagen estilos={imagenes.estilos} disponible={imagenes.disponible} puedeEscribir={puedeEscribir} conectado={proveedorTexto() !== null} />
    </Pagina>
  );
}
