import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { InventarioIcon } from "@/lib/nav-icons";
import { ImportarConteo } from "./importar-conteo";

export const metadata = { title: "Importar conteo" };

export const dynamic = "force-dynamic";
// Un conteo grande son varios lotes de 400 ajustes.
export const maxDuration = 60;

export default async function ImportarConteoPage() {
  const usuario = await requireModulo("rentabilidad");
  const puede = usuario.modulos.includes("inventario") && !usuario.modulosSoloLectura.includes("inventario");
  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Importar conteo de inventario" icono={InventarioIcon} />
      {puede ? <ImportarConteo /> : <EstadoVacioAF4 titulo="Sin permiso para ajustar el inventario">Hace falta poder modificar Inventario.</EstadoVacioAF4>}
    </Pagina>
  );
}
