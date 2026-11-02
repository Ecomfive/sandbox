"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ContadorPestana } from "@/components/migas/contador-pestana";
import { contarSinResponderCrm } from "./bandeja/contador-actions";

const HREF_BANDEJA = "/crm-dropshippers/bandeja";
const CADA_MS = 60_000;

/**
 * El globo rojo de la pestaña «Bandeja de WhatsApp» en todas las pestañas del CRM (30 oct 2026, pedido de Jhokser): cuántos chats esperan respuesta en las áreas de
 * quien mira (Atención, las suyas; Comercial, las suyas y las de Atención; Dirección, todas). Se pide al entrar y cada minuto con la pestaña visible. Dentro de la
 * propia bandeja no se pide: ella pone su cuenta al instante con lo que va leyendo.
 */
export function ContadorBandeja() {
  const enBandeja = usePathname().startsWith(HREF_BANDEJA);
  const [cantidad, setCantidad] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (enBandeja) return;
    let vigente = true;
    const leer = () => {
      if (document.visibilityState !== "visible") return;
      contarSinResponderCrm()
        .then((n) => vigente && n !== null && setCantidad(n))
        .catch(() => {});
    };
    leer();
    const reloj = setInterval(leer, CADA_MS);
    document.addEventListener("visibilitychange", leer);
    return () => {
      vigente = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", leer);
    };
  }, [enBandeja]);
  return <ContadorPestana href={HREF_BANDEJA} cantidad={cantidad} />;
}
