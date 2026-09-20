import type { ReactNode } from "react";
import { BarraMigas } from "@/components/barra-migas";
import { NavBar } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { TransicionPagina } from "@/components/transicion-pagina";
import { getUsuarioActual } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { obtenerPlataformasPais } from "@/lib/pais-plataformas";
import { construirSeccionesPlataforma } from "@/lib/nav-data";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerFavoritos } from "@/lib/favoritos";
import { obtenerPendientesHoy } from "@/lib/pendientes-hoy";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioActual();
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const plataformasPais = await obtenerPlataformasPais(supabase, pais.id);
  const seccionesPlataforma = construirSeccionesPlataforma(plataformasPais);
  const favoritos = usuario ? await obtenerFavoritos(supabase, usuario.id) : [];
  const pendientesHoy =
    usuario?.modulos.includes("notificaciones") ? await obtenerPendientesHoy(supabase, pais.id) : null;
  const totalPendientes = pendientesHoy
    ? pendientesHoy.alertasInventario +
      pendientesHoy.pedidosConNovedad +
      pendientesHoy.saldosSinRegistrar +
      pendientesHoy.retirosDropiSinVincular
    : 0;

  return (
    <ToastProvider>
      <div className="flex min-h-full">
        <Sidebar
          modulosPermitidos={usuario?.modulos ?? null}
          usuario={usuario}
          seccionesPlataforma={seccionesPlataforma}
          favoritos={favoritos}
          totalPendientes={totalPendientes}
        />
        <div className="flex min-h-full min-w-0 flex-1 flex-col">
          <NavBar />
          <BarraMigas seccionesPlataforma={seccionesPlataforma} favoritos={favoritos} />
          <TransicionPagina>{children}</TransicionPagina>
        </div>
      </div>
    </ToastProvider>
  );
}
