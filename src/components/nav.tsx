import { AtajosTeclado } from "@/components/atajos-teclado";
import { BusquedaGlobal } from "@/components/busqueda-global";
import { CampanaPendientes } from "@/components/campana-pendientes";
import { MenuCrear } from "@/components/menu-crear";
import { MenuCuenta } from "@/components/menu-cuenta";
import { SelectorContexto } from "@/components/selector-contexto";
import { SelectorTienda } from "@/components/tienda-global/selector-tienda";
import { getUsuarioActual } from "@/lib/auth";
import type { PendientesMenu } from "@/lib/contadores-menu";
import { accionesCrearPermitidas } from "@/lib/crear-global";
import { getTiendaActual, listarTiendas } from "@/lib/finanzas/tienda-actual";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { getPlataformaActual } from "@/lib/plataforma-actual";
import { plataformasDePais } from "@/lib/plataformas";
import type { PaginaBuscable } from "@/lib/paleta";
import { Suspense } from "react";

/** Módulos con páginas que usan la tienda global de Finanzas (sin ninguno, no se muestra la tienda). */
const MODULOS_CON_TIENDA = ["estado-resultados", "rentabilidad", "ventas-tiendas", "presupuesto"];

/**
 * Barra de arriba: el buscador (⌘K) a la izquierda y, a la derecha, la tienda (solo en las páginas de Finanzas que la
 * usan), el contexto (país y plataforma), «Crear», la campana de pendientes y el menú de la persona. `pendientes` es la
 * misma promesa del menú lateral; la plataforma (Dropi o Drop) es la que se eligió con el selector.
 */
export async function NavBar({
  paginas,
  pendientes,
}: {
  paginas: PaginaBuscable[];
  pendientes: Promise<PendientesMenu>;
}) {
  const supabase = createServiceClient();
  // Las tiendas se guardan un minuto en memoria (iguales para todos): se piden a la vez que lo demás.
  const [pais, usuario, todasLasTiendas, tiendaActual] = await Promise.all([getPaisActual(supabase), getUsuarioActual(), listarTiendas(supabase), getTiendaActual(supabase)]);
  const plataforma = await getPlataformaActual(pais.codigo);
  const accionesCrear = usuario ? accionesCrearPermitidas(usuario.modulos, usuario.modulosSoloLectura) : [];
  const conTienda = !!usuario && MODULOS_CON_TIENDA.some((m) => usuario.modulos.includes(m));
  const tiendas = conTienda ? todasLasTiendas : [];

  return (
    <header data-sin-imprimir className="border-b border-border bg-card">
      <div className="flex items-center justify-between gap-2 py-3 pr-4 pl-14 sm:gap-3 sm:pr-6 md:pl-6">
        <BusquedaGlobal paginas={paginas} acciones={accionesCrear} />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {tiendas.length > 0 && (
            <Suspense fallback={null}>
              <SelectorTienda tiendas={tiendas} global={tiendaActual?.id ?? null} />
            </Suspense>
          )}
          <SelectorContexto pais={pais.codigo} plataforma={plataforma} plataformas={plataformasDePais(pais.codigo)} permitidos={usuario?.paisesPermitidos ?? null} />
          <MenuCrear acciones={accionesCrear} />
          {usuario?.modulos.includes("tareas") && <CampanaPendientes pendientes={pendientes} />}
          {/* Los atajos de teclado siguen activos; su ayuda se abre desde el menú de la persona. */}
          <AtajosTeclado paginas={paginas} conBoton={false} />
          {usuario && (
            <MenuCuenta
              nombre={usuario.nombre}
              email={usuario.email}
              rol={usuario.rolNombre}
              avatarUrl={usuario.avatarUrl}
              puedeConfigurar={usuario.modulos.includes("configuracion")}
            />
          )}
        </div>
      </div>
    </header>
  );
}
