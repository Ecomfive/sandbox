import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { irAlInicio, requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { cargarDia } from "@/lib/rendimiento/datos";
import { diaPanama } from "@/lib/rendimiento/jornada";
import { PanelRendimiento, type FilaEquipo } from "./panel-rendimiento";

export const metadata = { title: "Rendimiento" };

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Equipo › Rendimiento (pedido de Alcides, 27 oct 2026; migración 0166): la jornada de cada persona en un día. Pulsar a alguien despliega su ficha en la misma fila
 * (pedido de Hernán, 6 nov 2026): en qué área estuvo, cuánto tiempo, desde qué dispositivo y qué hizo, con la hora de cada cosa. Solo lo ven los administradores.
 */
export default async function RendimientoPage({ searchParams }: { searchParams: Promise<{ dia?: string; persona?: string; hora?: string }> }) {
  const usuario = await requireModulo("rendimiento");
  if (!esAdministrador(usuario)) irAlInicio(usuario, "rendimiento");
  const { dia: diaPedido, persona, hora: horaPedida } = await searchParams;
  const horaInicial = typeof horaPedida === "string" && /^\d{1,2}$/.test(horaPedida) && Number(horaPedida) < 24 ? Number(horaPedida) : null;
  const hoy = diaPanama();
  const dia = typeof diaPedido === "string" && DIA.test(diaPedido) && diaPedido <= hoy ? diaPedido : hoy;
  const equipo = await cargarDia(dia);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Rendimiento" oculto />
      {!equipo ? (
        <p role="note" className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          Falta correr en Supabase la migración 0166.
        </p>
      ) : (
        <PanelRendimiento
          key={dia}
          dia={dia}
          hoy={hoy}
          personaInicial={equipo.some((p) => p.id === persona) ? (persona as string) : null}
          horaInicial={horaInicial}
          equipo={equipo.map((p): FilaEquipo => {
            const j = p.jornada;
            return {
              id: p.id,
              nombre: p.nombre,
              entrada: j.entrada,
              salida: j.salida,
              minutosActivos: j.minutosActivos,
              pausas: j.pausas.length,
              minutosPausa: j.pausas.reduce((t, x) => t + x.minutos, 0),
              acciones: j.acciones,
              principal: j.principal,
              horas: j.horas.map((h) => ({ hora: h.hora, minutos: h.minutos, acciones: h.acciones.length })),
            };
          })}
        />
      )}
    </Pagina>
  );
}
