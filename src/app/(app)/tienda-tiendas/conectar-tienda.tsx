"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { useToast } from "@/components/ui/toast";
import { ActualizarIcon, EnlaceIcon } from "@/lib/nav-icons";
import { conectarTiendaShopify, revisarTiendaShopify } from "./actions";

/**
 * «Conectar» (la primera vez) o «Revisar ahora» de una tienda en Tiendas Shopify (12 nov 2026). Solo lo ve un administrador. Conectar tarda unos segundos:
 * prueba el acceso, pide a Shopify los avisos de pedidos y trae lo que faltaba desde el Excel de Finanzas.
 */
export function ConectarTienda({ tiendaId, conectada }: { tiendaId: string; conectada: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  function hacer() {
    start(async () => {
      const r = conectada ? await revisarTiendaShopify(tiendaId) : await conectarTiendaShopify(tiendaId);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(r.resumen ?? "Listo.");
        router.refresh();
      }
    });
  }
  return (
    <BotonAccion icono={conectada ? ActualizarIcon : EnlaceIcon} onClick={hacer} disabled={pendiente} aria-busy={pendiente}>
      {pendiente ? (conectada ? "Revisando…" : "Conectando…") : conectada ? "Revisar ahora" : "Conectar"}
    </BotonAccion>
  );
}
