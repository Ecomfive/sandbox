"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { useToast } from "@/components/ui/toast";
import { formatearTiempoRelativo } from "@/lib/formato";
import { ActualizarIcon } from "@/lib/nav-icons";
import { traerProductosShopify } from "./actions";

/**
 * «Traer de Shopify» (12 nov 2026): lee los productos y variantes de la tienda conectada (solo lectura) y los deja aquí para unirlos con los nuestros.
 * La revisión de la tienda también los trae solos dos veces al día.
 */
export function TraerProductos({ tiendas, ultima }: { tiendas: { id: string; nombre: string }[]; ultima: string | null }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  function traer() {
    start(async () => {
      for (const t of tiendas) {
        const r = await traerProductosShopify(t.id);
        if (r.error) mostrarToast(r.error, "destructive");
        else mostrarToast(r.resumen ?? "Listo.");
      }
      router.refresh();
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <BotonAccion icono={ActualizarIcon} onClick={traer} disabled={pendiente} aria-busy={pendiente}>
        {pendiente ? "Trayendo…" : "Traer de Shopify"}
      </BotonAccion>
      <span className="text-xs text-muted-foreground">{ultima ? `Última vez ${formatearTiempoRelativo(ultima)}` : "Todavía no se trajeron los productos."}</span>
    </div>
  );
}
