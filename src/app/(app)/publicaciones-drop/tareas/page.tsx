import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { avisoPaisDrop } from "../aviso-pais-drop";
import { VacioDrop } from "../vacio-drop";

export const metadata = { title: "Tareas · Gestión de IDs Drop" };

export const dynamic = "force-dynamic";

/** Gestión de IDs Drop › Tareas: la misma pestaña que en Dropi, sin datos hasta que se conecte la aplicación (3 nov 2026). */
export default async function TareasDropPage() {
  const usuario = await requireModulo("publicaciones-drop");
  const aviso = await avisoPaisDrop(usuario, "Tareas");
  if (aviso) return aviso;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Tareas" oculto />
      <VacioDrop texto="Todavía no hay tareas de Drop." />
    </Pagina>
  );
}
