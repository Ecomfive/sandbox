import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { segundoPasoActivo } from "@/lib/seguridad/segundo-paso";
import { factorTotp } from "@/lib/seguridad/segundo-paso-servidor";
import { requireSesion } from "../../ayuda/datos-ayuda";
import { SeguridadCuenta } from "./seguridad-cuenta";

export const metadata = { title: "Seguridad de la cuenta" };

export const dynamic = "force-dynamic";

/** «Seguridad de la cuenta»: la verificación en dos pasos de la propia persona. La abre cualquiera con sesión (no es un módulo). */
export default async function SeguridadCuentaPage() {
  await requireSesion();
  const totp = await factorTotp();
  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Seguridad de la cuenta" oculto />
      <SeguridadCuenta conTotp={!!totp} segundoPasoObligatorio={segundoPasoActivo()} />
    </Pagina>
  );
}
