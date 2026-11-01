import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { getUsuarioActual, irAlInicio } from "@/lib/auth";
import { NOVEDADES } from "@/lib/ayuda/contenido";
import { etiquetaDeModulo } from "@/lib/permisos/catalogo";
import { esAdministrador } from "@/lib/permisos/acceso";
import { redirect } from "next/navigation";
import { ListaActualizaciones } from "./lista-actualizaciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Actualizaciones del sistema" };

/**
 * Actualizaciones del sistema (31 oct 2026, pedido de Alcides): todo lo que cambió, día por día, para los administradores (botón «Cambios» del
 * riel). Sale de las novedades del Centro de ayuda, todas, sin filtrar por módulo. Quien no es administrador vuelve a su inicio.
 */
export default async function ActualizacionesPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (!esAdministrador(usuario)) irAlInicio(usuario);

  const modulos = [...new Set(NOVEDADES.map((n) => n.modulo).filter((m): m is string => !!m))]
    .map((clave) => ({ clave, etiqueta: etiquetaDeModulo(clave) }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Actualizaciones del sistema" oculto />
      <ListaActualizaciones novedades={NOVEDADES} modulos={modulos} />
    </Pagina>
  );
}
