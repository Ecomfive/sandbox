import { AtajosTeclado } from "@/components/atajos-teclado";
import { BusquedaGlobal } from "@/components/busqueda-global";
import { CampanaPendientes } from "@/components/campana-pendientes";
import { MenuCrear } from "@/components/menu-crear";
import { MenuCuenta } from "@/components/menu-cuenta";
import { SelectorContexto } from "@/components/selector-contexto";
import { getUsuarioActual } from "@/lib/auth";
import type { PendientesMenu } from "@/lib/contadores-menu";
import { accionesCrearPermitidas } from "@/lib/crear-global";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import type { PaginaBuscable } from "@/lib/paleta";

/**
 * Barra de arriba: el buscador (⌘K) a la izquierda y, a la derecha, el contexto (país y plataforma), «Crear», la campana
 * de pendientes y el menú de la persona. `pendientes` es la misma promesa del menú lateral; `plataforma` es la que
 * tiene datos en este país (hoy, Dropi).
 */
export async function NavBar({
  paginas,
  pendientes,
  plataforma,
}: {
  paginas: PaginaBuscable[];
  pendientes: Promise<PendientesMenu>;
  plataforma: string | null;
}) {
  const supabase = createServiceClient();
  const [pais, usuario] = await Promise.all([getPaisActual(supabase), getUsuarioActual()]);
  const accionesCrear = usuario ? accionesCrearPermitidas(usuario.modulos, usuario.modulosSoloLectura) : [];

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between gap-3 py-3 pr-6 pl-14 md:pl-6">
        <BusquedaGlobal paginas={paginas} acciones={accionesCrear} />
        <div className="flex items-center gap-2">
          <SelectorContexto pais={pais.codigo} plataforma={plataforma} />
          <MenuCrear acciones={accionesCrear} />
          {usuario?.modulos.includes("notificaciones") && <CampanaPendientes pendientes={pendientes} />}
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
