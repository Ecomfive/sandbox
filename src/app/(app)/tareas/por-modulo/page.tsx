import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { MODULOS_ACCESO } from "@/lib/permisos/catalogo";
import { createServiceClient } from "@/lib/supabase/server";
import { agruparPorModulo } from "@/lib/tareas/por-modulo";
import { cargarMisTareasPorModulo } from "./datos";
import { ListaPorModulo } from "./lista-por-modulo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis tareas por módulo" };

/**
 * Equipo › Tareas › «Mis tareas por módulo» (9 nov 2026, pedido de Hernán): todas las tareas abiertas de la persona, agrupadas por el módulo de donde son
 * (Gestión de IDs Dropi, CRM Dropshippers, el tablero del equipo…), solo de los módulos a los que tiene acceso. Cada una abre en su módulo.
 */
export default async function MisTareasPorModuloPage() {
  const usuario = await requireModulo("tareas");
  const tareas = await cargarMisTareasPorModulo(createServiceClient(), usuario);
  const hoy = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Panama",
  });
  const etiquetas = Object.fromEntries(
    MODULOS_ACCESO.map((m) => [m.clave, m.etiqueta]),
  );
  const grupos = agruparPorModulo(tareas, {
    modulosConAcceso: usuario.modulos,
    etiquetas,
    hoy,
  });
  const total = grupos.reduce((n, g) => n + g.tareas.length, 0);
  const atrasadas = grupos.reduce((n, g) => n + g.atrasadas, 0);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Mis tareas por módulo" oculto />
      <p className="m-0 text-sm text-muted-foreground">
        {total ? (
          <>
            <span className="font-semibold text-foreground tabular-nums">
              {total}
            </span>{" "}
            {total === 1 ? "tarea abierta" : "tareas abiertas"} en{" "}
            <span className="tabular-nums">{grupos.length}</span>{" "}
            {grupos.length === 1 ? "módulo" : "módulos"}
            {atrasadas ? (
              <>
                {" · "}
                <span className="font-semibold text-destructive tabular-nums">
                  {atrasadas} {atrasadas === 1 ? "atrasada" : "atrasadas"}
                </span>
              </>
            ) : null}
          </>
        ) : (
          "No tienes tareas abiertas en ningún módulo."
        )}
      </p>

      <ListaPorModulo grupos={grupos} hoy={hoy} />
    </Pagina>
  );
}
