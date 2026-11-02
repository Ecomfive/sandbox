import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { avisoPaisDrop } from "./aviso-pais-drop";
import { ListaPublicacionesDrop } from "./lista-publicaciones-drop";
import { TableroDrop } from "./tablero-drop";

export const metadata = { title: "Gestión de IDs Drop" };

export const dynamic = "force-dynamic";

/**
 * Operación › Fulfillment: los productos publicados en Drop, otra aplicación aparte de Dropi (3 nov 2026). Mismo orden y mismas piezas que Gestión de IDs Dropi
 * (tablero de acciones arriba y lista de filas debajo), pero sin datos: se van conectando poco a poco.
 */
export default async function PublicacionesDropPage() {
  const usuario = await requireModulo("publicaciones-drop");
  const aviso = await avisoPaisDrop(usuario, "Gestión de IDs Drop");
  if (aviso) return aviso;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Gestión de IDs Drop" oculto />
      <TableroDrop />
      <ListaPublicacionesDrop publicaciones={[]} />
    </Pagina>
  );
}
