import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { ContadorPestana } from "@/components/migas/contador-pestana";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { esAdministrador } from "@/lib/permisos/acceso";
import { pendiente } from "@/lib/publicaciones/tareas";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPersonas } from "../datos-publicaciones";
import { ProveedorTareas } from "../recomendacion-publicacion";
import { contarRecomendacionesPendientes } from "../recomendaciones-actions";
import { cargarTareas } from "../tareas-datos";
import { ListaTareas } from "./lista-tareas";

export const metadata = { title: "Tareas · Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";

/**
 * Gestión de IDs Dropi › Tareas (pedido de Alcides, 28–29 oct 2026, al estilo de ClickUp): las tareas del país, las escritas a mano (desde aquí, el botón
 * de tareas de cada fila o la ficha de una publicación) y las que nacieron de aceptar una recomendación. Cada persona ve las suyas; un administrador
 * puede ver además las de todos («De todos»).
 */
export default async function TareasPage({ searchParams }: { searchParams: Promise<{ ver?: string | string[] }> }) {
  const { ver } = await searchParams;
  const usuario = await requireModulo("publicaciones-dropi");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const admin = esAdministrador(usuario);
  const todas = admin && ver === "todas";
  const [datos, personas] = await Promise.all([cargarTareas(supabase, pais.id, usuario.id, todas), cargarPersonas(supabase)]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const mias = datos.tareas.filter((t) => pendiente(t) && (!todas || t.responsableId === usuario.id)).length;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Tareas" oculto />
      <ContadorPestana href="/publicaciones-dropi/tareas" cantidad={mias} />
      <ContadorPestana href="/publicaciones-dropi/recomendaciones" cargar={contarRecomendacionesPendientes} />
      <ProveedorTareas personas={personas} yo={usuario.id} conTareas>
        <ListaTareas
          key={todas ? "todas" : "mias"}
          tareas={datos.tareas}
          publicaciones={datos.publicaciones}
          hoy={hoy}
          todas={todas}
          puedeVerTodas={admin}
          puedeEscribir={!usuario.modulosSoloLectura.includes("publicaciones-dropi")}
          faltaMigracion={!datos.conTareasManuales}
          conEstados={datos.conEstados}
        />
      </ProveedorTareas>
    </Pagina>
  );
}
