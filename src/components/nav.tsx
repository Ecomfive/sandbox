import { PaisSelector } from "@/components/pais-selector";
import { AtajosTeclado } from "@/components/atajos-teclado";
import { BusquedaGlobal } from "@/components/busqueda-global";
import { MenuCrear } from "@/components/menu-crear";
import { getUsuarioActual } from "@/lib/auth";
import { accionesCrearPermitidas } from "@/lib/crear-global";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import type { PaginaBuscable } from "@/lib/paleta";

export async function NavBar({ paginas }: { paginas: PaginaBuscable[] }) {
  const supabase = createServiceClient();
  const [pais, usuario] = await Promise.all([getPaisActual(supabase), getUsuarioActual()]);
  const accionesCrear = usuario ? accionesCrearPermitidas(usuario.modulos, usuario.modulosSoloLectura) : [];

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between gap-3 py-3 pr-6 pl-14 md:pl-6">
        <BusquedaGlobal paginas={paginas} />
        <div className="flex items-center gap-2">
          <MenuCrear acciones={accionesCrear} />
          <AtajosTeclado paginas={paginas} />
          <PaisSelector actual={pais.codigo} />
        </div>
      </div>
    </header>
  );
}
