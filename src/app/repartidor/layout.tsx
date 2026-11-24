import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = { title: "Mi ruta" };
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
