import type { ReactNode } from "react";
import { NavBar } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { getUsuarioActual } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { obtenerPlataformasPais } from "@/lib/pais-plataformas";
import { construirSeccionesPlataforma } from "@/lib/nav-data";
import { createServiceClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioActual();
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const plataformasPais = await obtenerPlataformasPais(supabase, pais.id);
  const seccionesPlataforma = construirSeccionesPlataforma(plataformasPais);

  return (
    <div className="flex min-h-full">
      <Sidebar
        modulosPermitidos={usuario?.modulos ?? null}
        usuario={usuario}
        seccionesPlataforma={seccionesPlataforma}
      />
      <div className="flex min-h-full flex-1 flex-col">
        <NavBar />
        {children}
      </div>
    </div>
  );
}
