import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { avisoPaisDrop } from "../aviso-pais-drop";
import { VacioDrop } from "../vacio-drop";

export const metadata = { title: "Recomendaciones · Gestión de IDs Drop" };

export const dynamic = "force-dynamic";

/** Gestión de IDs Drop › Recomendaciones: la misma pestaña que en Dropi, sin datos hasta que se conecte la aplicación (3 nov 2026). */
export default async function RecomendacionesDropPage() {
  const usuario = await requireModulo("publicaciones-drop");
  const aviso = await avisoPaisDrop(usuario, "Recomendaciones");
  if (aviso) return aviso;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Recomendaciones" oculto />
      <VacioDrop texto="Todavía no hay recomendaciones de Drop." />
    </Pagina>
  );
}
