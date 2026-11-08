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
import { ActividadReglas } from "./actividad-reglas";

export const metadata = { title: "Reglas · Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";

/** Gestión de IDs Dropi › Reglas: los umbrales con que el sistema calcula las acciones y las recomendaciones. */
export default async function ReglasPage() {
  const usuario = await requireModulo("publicaciones-dropi");
  const supabase = createServiceClient();
  const [guardadas, ia, imagenes] = await Promise.all([cargarReglas(supabase), cargarIndicaciones(supabase), cargarEstilos(supabase)]);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("publicaciones-dropi");
  // Cambia cuando cambia algo de la página (al guardar, la página se vuelve a pedir): así la Actividad se vuelve a leer.
  const firma = JSON.stringify([guardadas.cambios, ia.indicaciones, imagenes.estilos]);
  let version = 0;
  for (let i = 0; i < firma.length; i++) version = (version * 31 + firma.charCodeAt(i)) | 0;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Reglas" oculto />
      <ContadorPestana href="/publicaciones-dropi/recomendaciones" cargar={contarRecomendacionesPendientes} />
      <FormularioReglas reglas={guardadas.reglas} cambios={guardadas.cambios} disponible={guardadas.disponible} puedeEscribir={puedeEscribir} />
      {/* Lo de la IA también en dos columnas en pantalla ancha. */}
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <IndicacionesIA indicaciones={ia.indicaciones} disponible={ia.disponible} puedeEscribir={puedeEscribir} />
        <EstilosImagen estilos={imagenes.estilos} disponible={imagenes.disponible} puedeEscribir={puedeEscribir} conectado={proveedorTexto() !== null} />
      </div>
      {/* Quién cambió qué regla y cuándo, y los comentarios del equipo (8 nov 2026, pedido de Alcides), como en Compras. */}
      <section aria-label="Actividad de las reglas" className="max-w-5xl rounded-xl border border-border bg-card p-4">
        <ActividadReglas puedeComentar={puedeEscribir} version={version} />
      </section>
    </Pagina>
  );
}
