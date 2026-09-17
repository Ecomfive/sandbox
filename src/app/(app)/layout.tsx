import type { ReactNode } from "react";
import { NavBar } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { getUsuarioActual } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioActual();

  return (
    <div className="flex min-h-full">
      <Sidebar modulosPermitidos={usuario?.modulos ?? null} />
      <div className="flex min-h-full flex-1 flex-col">
        <NavBar usuario={usuario} />
        {children}
      </div>
    </div>
  );
}
