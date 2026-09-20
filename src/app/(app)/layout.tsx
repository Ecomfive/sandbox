import type { ReactNode } from "react";
import { BarraMigas } from "@/components/barra-migas";
import { NavBar } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { TransicionPagina } from "@/components/transicion-pagina";
import { getUsuarioActual } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { obtenerPlataformasPais } from "@/lib/pais-plataformas";
import { NAV_SECTIONS, construirSeccionesPlataforma } from "@/lib/nav-data";
import { paginasBuscables } from "@/lib/paleta";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerFavoritos } from "@/lib/favoritos";
import { obtenerPendientesHoy } from "@/lib/pendientes-hoy";
import {
  SIN_PENDIENTES,
  calcularPendientesMenu,
  necesitaPendientes,
  type PendientesMenu,
} from "@/lib/contadores-menu";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioActual();
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const plataformasPais = await obtenerPlataformasPais(supabase, pais.id);
  const seccionesPlataforma = construirSeccionesPlataforma(plataformasPais);
  const paginas = paginasBuscables(seccionesPlataforma, NAV_SECTIONS, usuario?.modulos ?? null);
  const favoritos = usuario ? await obtenerFavoritos(supabase, usuario.id) : [];
  // Sin await a propósito: el menú lleva la promesa y los contadores llegan por streaming; si la consulta
  // falla, el menú sale sin contadores en vez de romper la página.
  const pendientes: Promise<PendientesMenu> =
    usuario && necesitaPendientes(usuario.modulos)
      ? obtenerPendientesHoy(supabase, pais.id)
          .then((p) => calcularPendientesMenu(p, usuario.modulos))
          .catch(() => SIN_PENDIENTES)
      : Promise.resolve(SIN_PENDIENTES);

  return (
    <ToastProvider>
      <div className="flex min-h-full">
        <Sidebar
          modulosPermitidos={usuario?.modulos ?? null}
          usuario={usuario}
          seccionesPlataforma={seccionesPlataforma}
          favoritos={favoritos}
          pendientes={pendientes}
        />
        <div className="flex min-h-full min-w-0 flex-1 flex-col">
          <NavBar paginas={paginas} />
          <BarraMigas seccionesPlataforma={seccionesPlataforma} favoritos={favoritos} />
          <TransicionPagina>{children}</TransicionPagina>
        </div>
      </div>
    </ToastProvider>
  );
}
