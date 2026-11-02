import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { MODULOS_ACCESO } from "@/lib/permisos/catalogo";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarTareas } from "./datos";
import { TableroTareas } from "./tablero-tareas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tareas" };

/**
 * Equipo › Tareas (31 oct 2026, pedido de Alcides; migración 0215): el tablero de tareas del equipo, como «Lideres Empresas» de ClickUp, en el
 * sistema. Módulo temporal hasta reorganizarlo. Cada persona ve las suyas; un administrador, las de todos.
 */
export default async function TareasPage() {
  const usuario = await requireModulo("tareas");
  const { tareas, personas, falta } = await cargarTareas(createServiceClient(), usuario);
  const modulos = MODULOS_ACCESO.filter((m) => m.clave !== "tareas")
    .map((m) => ({ clave: m.clave, etiqueta: m.etiqueta }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Tareas" oculto />
      {falta ? (
        <p role="alert" className="m-0 rounded-xl border border-border bg-card px-5 py-4 text-sm">
          Falta correr en Supabase la migración 0215 (tareas del equipo).
        </p>
      ) : (
        <TableroTareas tareas={tareas} personas={personas} modulos={modulos} miId={usuario.id} admin={esAdministrador(usuario)} />
      )}
    </Pagina>
  );
}
