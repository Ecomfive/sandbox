import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

// Se instala en el celular como su propia app (24 nov 2026): «Agregar a la pantalla de inicio» deja el ícono «Mi ruta», que abre el panel directo, sin
// Play Store. Su manifiesto (`public/repartidor.webmanifest`) reemplaza aquí al del sistema («Fuentes», que abre Instagram).
export const metadata: Metadata = {
  title: "Mi ruta",
  manifest: "/repartidor.webmanifest",
  appleWebApp: { capable: true, title: "Mi ruta", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#8a35c9" };

/**
 * El panel del repartidor (24 nov 2026) va aparte del sistema, como el portal del proveedor: sin menú, buscador, campana ni nada más, pensado para el
 * celular. Solo lo abre una cuenta de `despacho_repartidores` (cada página lo exige con `requireRepartidor`).
 */
export default function LayoutRepartidor({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-dvh bg-[#ececee]">
        <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[#fafafa] text-[#18181b]">{children}</div>
      </div>
    </ToastProvider>
  );
}
