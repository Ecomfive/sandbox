import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { VacioDrop } from "../vacio-drop";

export const metadata = { title: "Reglas · Gestión de IDs Drop" };

export const dynamic = "force-dynamic";

/** Gestión de IDs Drop › Reglas: la misma pestaña que en Dropi, sin datos hasta que se conecte la aplicación (3 nov 2026). */
export default async function ReglasDropPage() {
  await requireModulo("publicaciones-drop");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Reglas" oculto />
      <VacioDrop texto="Todavía no hay reglas de Drop." />
    </Pagina>
  );
}
