import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

export const metadata = { title: "Portal de proveedores" };

/**
 * El portal del proveedor (fase 3 de PORTAL-PROVEEDOR.md) va aparte del sistema: sin menú, buscador, campana ni nada más. Solo lo
 * abre una cuenta de `proveedor_usuarios` (la página lo exige con `requireProveedor`).
 */
export default function LayoutProveedor({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-full bg-muted/40">{children}</div>
    </ToastProvider>
  );
}
