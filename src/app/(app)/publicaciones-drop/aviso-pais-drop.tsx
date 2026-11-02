import type { ReactNode } from "react";
import { AvisoSoloPais } from "@/components/plataformas/aviso-solo-pais";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import type { UsuarioActual } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { PAIS_DE_DROP, plataformaDisponible } from "@/lib/plataformas";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Drop es solo de Costa Rica (3 nov 2026): con otro país elegido en la barra, cada página de Gestión de IDs Drop dice dónde existe y ofrece pasar a Costa Rica en vez de
 * mostrar una lista vacía de un país donde Drop no está. `null` si el país es Costa Rica (la página sigue).
 */
export async function avisoPaisDrop(usuario: UsuarioActual, titulo: string): Promise<ReactNode | null> {
  const pais = await getPaisActual(createServiceClient());
  if (plataformaDisponible("drop", pais.codigo)) return null;
  const permitidos = usuario.paisesPermitidos;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={titulo} oculto />
      <AvisoSoloPais plataforma="drop" paisPermitido={permitidos === null || permitidos.includes(PAIS_DE_DROP)} />
    </Pagina>
  );
}
