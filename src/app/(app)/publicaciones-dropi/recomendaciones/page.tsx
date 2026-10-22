import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPublicaciones } from "../datos-publicaciones";
import { PanelRecomendaciones, type TareaRecomendacion } from "./panel-recomendaciones";

export const metadata = { title: "Recomendaciones · Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";

/**
 * Gestión de IDs Dropi › Recomendaciones: todo lo que el sistema sugiere hacer en las publicaciones del país, como una lista de
 * tareas, y las decisiones que se tomaron (con su porqué). Es la fase 1 de las automatizaciones: el sistema sugiere y la persona
 * decide; las decisiones son lo que la IA leerá para aprender.
 */
export default async function RecomendacionesPage() {
  const usuario = await requireModulo("publicaciones-dropi");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await cargarPublicaciones(supabase, pais.id);
  if (!datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Recomendaciones" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las publicaciones. Falta correr en Supabase la migración 0116.
        </p>
      </Pagina>
    );
  }
  const tareas: TareaRecomendacion[] = datos.filas.flatMap((f) =>
    f.recomendaciones.map((rec) => ({ rec, publicacion: { id: f.id, numero: f.numero, nombre: f.nombre, fotoUrl: f.fotoUrl, sku: f.sku?.codigo ?? null } })),
  );
  const nombreDe = Object.fromEntries(datos.filas.map((f) => [f.id, f.nombre]));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Recomendaciones" oculto />
      <PanelRecomendaciones
        tareas={tareas}
        decisiones={datos.decisiones}
        nombreDe={nombreDe}
        puedeDecidir={!usuario.modulosSoloLectura.includes("publicaciones-dropi") && datos.reglas.disponible}
        faltaMigracion={!datos.reglas.disponible}
      />
    </Pagina>
  );
}
