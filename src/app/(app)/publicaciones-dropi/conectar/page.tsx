import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { ConectarDropi } from "./conectar-dropi";

export const metadata = { title: "Conectar Dropi" };

export const dynamic = "force-dynamic";

/**
 * Donde llega el favorito «Conectar Dropi»: la sesión de Dropi viaja en el fragmento de la dirección (`#p=pa&t=…`), que el servidor
 * nunca ve en la dirección; la lee el navegador, la borra de la barra y se la entrega a la acción `conectarDropi`.
 */
export default async function ConectarDropiPage() {
  const usuario = await requireModulo("publicaciones-dropi");
  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Conectar Dropi" oculto />
      <ConectarDropi puedeConectar={esAdministrador(usuario) && !usuario.modulosSoloLectura.includes("publicaciones-dropi")} />
    </Pagina>
  );
}
