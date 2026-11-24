"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Piezas del panel del repartidor (24 nov 2026), con los colores y medidas del prototipo aprobado: morado del sistema (#8a35c9), suave #f3ecfc, borde
// suave #dcc6f3 y texto morado oscuro #5b2386; tarjetas blancas con borde #e3e3e3 y esquinas de 14 px; botones de al menos 44 px.

/** El teléfono para llamar o para WhatsApp de Panamá (507 + 8 dígitos). */
export function telefonoLimpio(t: string | null | undefined): { tel: string; wa: string; corto: string } | null {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length < 7) return null;
  const local = d.startsWith("507") && d.length > 8 ? d.slice(3) : d;
  return { tel: `+507${local}`, wa: `https://wa.me/507${local}`, corto: `tel. ••${local.slice(-2)}` };
}

/** Google Maps con la dirección del cliente (en el celular abre la app de mapas o Waze desde ahí). */
export function enlaceMapa(direccion: string | null | undefined, corregimiento: string | null | undefined): string | null {
  const q = [direccion, corregimiento, "Panamá"].filter((x) => x && String(x).trim()).join(", ");
  return direccion || corregimiento ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** «En línea · guardado» o «Sin señal», según la conexión del celular. */
export function EstadoConexion() {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    actualizar();
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, []);
  return <span className="rounded-full bg-white/20 px-2.5 py-1.5 text-xs font-semibold">{enLinea ? "En línea · guardado" : "Sin señal"}</span>;
}

/** `?dia=` para los enlaces del panel cuando se mira otro día de la semana (vacío si es hoy). */
export const consultaDia = (dia: string, hoy: string) => (dia === hoy ? "" : `?dia=${dia}`);

/** La barra de abajo: «Mi ruta» y «Cierre del día» (del día que se está mirando). */
export function NavRepartidor({ activa, consulta = "" }: { activa: "ruta" | "cierre"; consulta?: string }) {
  const clase = (a: boolean) => `flex min-h-14 items-center justify-center gap-1.5 text-[13px] no-underline ${a ? "font-semibold text-primario" : "font-medium text-[#636363]"}`;
  return (
    <nav aria-label="Secciones" className="sticky bottom-0 z-10 grid grid-cols-2 border-t border-[#e3e3e3] bg-white">
      <Link href={`/repartidor${consulta}`} aria-current={activa === "ruta" ? "page" : undefined} className={clase(activa === "ruta")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7h13l5 5v5h-2" />
          <path d="M3 7v10h2" />
          <circle cx="7.5" cy="17.5" r="2" />
          <circle cx="17" cy="17.5" r="2" />
        </svg>
        Mi ruta
      </Link>
      <Link href={`/repartidor/cierre${consulta}`} aria-current={activa === "cierre" ? "page" : undefined} className={clase(activa === "cierre")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
        Cierre del día
      </Link>
    </nav>
  );
}

/** La pastilla del estado de un pedido. */
export function PastillaEstado({ estado }: { estado: string | null }) {
  const e = (estado ?? "").toUpperCase();
  const [texto, clase] =
    e === "ENTREGADO"
      ? ["Entregado", "bg-[#dcfce7] text-[#15803d]"]
      : e === "FALLIDO"
        ? ["Fallido", "bg-[#ffe4e6] text-[#be123c]"]
        : e === "POSPUESTO"
          ? ["Pospuesto", "bg-[#fef3c7] text-[#8a4b08]"]
          : ["En ruta", "bg-primario-suave text-[#5b2386]"];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${clase}`}>{texto}</span>;
}
