import type { ReactNode } from "react";
import { BannerVistaPrevia } from "@/components/banner-vista-previa";
import { BarraMigas } from "@/components/barra-migas";
import { NavBar } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { TransicionPagina } from "@/components/transicion-pagina";
import { getUsuarioActual, getUsuarioIdSesion } from "@/lib/auth";
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
  const supabase = createServiceClient();
  // Lo que arma el menú no depende una cosa de la otra: se pide todo a la vez, no una consulta tras otra.
  // El usuario y el país arrancan primero; las plataformas dependen del país y los favoritos del id de la
  // sesión (que ya está en memoria por la comprobación de acceso), así que salen sin esperar al perfil.
  const paisP = getPaisActual(supabase);
  const usuarioP = getUsuarioActual();
  // Los contadores arrancan en cuanto se conocen el país y la persona, y no se esperan: el menú lleva la promesa y
  // los números llegan por streaming; si la consulta falla, el menú sale sin contadores en vez de romper la página.
  const pendientes: Promise<PendientesMenu> = Promise.all([paisP, usuarioP])
    .then(([p, u]) =>
      u && necesitaPendientes(u.modulos)
        ? obtenerPendientesHoy(supabase, p.id).then((datos) => calcularPendientesMenu(datos, u.modulos))
        : SIN_PENDIENTES
    )
    .catch(() => SIN_PENDIENTES);
  const [plataformasPais, favoritosDeSesion, usuario] = await Promise.all([
    paisP.then((p) => obtenerPlataformasPais(supabase, p.id)),
    getUsuarioIdSesion().then((id) => (id ? obtenerFavoritos(supabase, id) : [])),
    usuarioP,
  ]);
  const favoritos = usuario ? favoritosDeSesion : [];
  const seccionesPlataforma = construirSeccionesPlataforma(plataformasPais);
  const paginas = paginasBuscables(seccionesPlataforma, NAV_SECTIONS, usuario?.modulos ?? null);

  return (
    <ToastProvider>
      {usuario?.vistaPrevia && <BannerVistaPrevia rolNombre={usuario.vistaPrevia.rolNombre} />}
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
