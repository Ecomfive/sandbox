import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { ContadorPestana } from "@/components/migas/contador-pestana";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPublicaciones } from "../datos-publicaciones";
import { contarMisTareasPendientes } from "../tareas-actions";
import { ProveedorMoneda } from "../moneda-contexto";
import { monedaDePais, tasasUsd } from "@/lib/moneda/tipo-cambio";
import { monedaPublicaciones } from "@/lib/publicaciones/moneda";
import { PanelRecomendaciones, type Sugerida } from "./panel-recomendaciones";

export const metadata = { title: "Recomendaciones · Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";
// El asistente de IA (investigar con OpenAI, generar fotos con Gemini) corre como acción de esta página y tarda hasta unos minutos.
export const maxDuration = 300;

/**
 * Gestión de IDs Dropi › Recomendaciones: todo lo que el sistema sugiere hacer en las publicaciones del país, como una lista de
 * tareas, y las decisiones que se tomaron (con su porqué). Es la fase 1 de las automatizaciones: el sistema sugiere y la persona
 * decide; las decisiones son lo que la IA leerá para aprender.
 */
export default async function RecomendacionesPage({ searchParams }: { searchParams: Promise<{ ver?: string | string[] }> }) {
  const { ver } = await searchParams;
  const usuario = await requireModulo("publicaciones-dropi");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [datos, porUsd] = await Promise.all([cargarPublicaciones(supabase, pais.id, usuario), monedaDePais(pais.codigo) === "USD" ? Promise.resolve({}) : tasasUsd(supabase).then((t) => t.porUsd)]);
  // Los montos en la moneda del país (Costa Rica en colones, con su valor en dólares en pequeño), como en la lista.
  const moneda = monedaPublicaciones(pais.codigo, porUsd);
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
  const sugeridas: Sugerida[] = datos.filas.flatMap((f) =>
    f.recomendaciones.map((rec) => ({ rec, publicacionId: f.id, responsableSugerido: f.responsableId })),
  );
  const publicacionDe = Object.fromEntries(datos.filas.map((f) => [f.id, { id: f.id, numero: f.numero, nombre: f.nombre, fotoUrl: f.fotoUrl, sku: f.sku?.codigo ?? null }]));
  // Las tareas salen de cada publicación (ahí ya se marcaron las que el sistema detectó hechas).
  const decisiones = datos.filas.flatMap((f) => f.decisiones).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Recomendaciones" oculto />
      <ContadorPestana href="/publicaciones-dropi/recomendaciones" cantidad={sugeridas.length} />
      <ContadorPestana href="/publicaciones-dropi/tareas" cargar={contarMisTareasPendientes} />
      <ProveedorMoneda moneda={moneda}>
      <PanelRecomendaciones
        sugeridas={sugeridas}
        decisiones={decisiones}
        publicacionDe={publicacionDe}
        verInicial={ver === "por_hacer" || ver === "hechas" ? ver : "pendientes"}
        contexto={{ personas: datos.personas, yo: usuario.id, conTareas: datos.conTareas }}
        puedeDecidir={!usuario.modulosSoloLectura.includes("publicaciones-dropi") && datos.reglas.disponible}
        faltaMigracion={!datos.reglas.disponible}
      />
      </ProveedorMoneda>
    </Pagina>
  );
}
