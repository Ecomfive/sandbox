import { PaisSelector } from "@/components/pais-selector";
import { BusquedaGlobal } from "@/components/busqueda-global";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";

export async function NavBar() {
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between gap-3 py-3 pr-6 pl-14 md:pl-6">
        <BusquedaGlobal />
        <PaisSelector actual={pais.codigo} />
      </div>
    </header>
  );
}
