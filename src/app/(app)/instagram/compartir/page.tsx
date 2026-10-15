import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { RegistrarSw } from "../registrar-sw";
import { CompartirDesdeCelular } from "./compartir-celular";

export const metadata = { title: "Compartido desde el celular" };

export const dynamic = "force-dynamic";
// Guardar lee la página pública del enlace y copia el video: puede tardar unos segundos.
export const maxDuration = 60;

/**
 * Donde llega lo que se comparte desde Instagram en el celular con la plataforma instalada como app (el «share target» de
 * `src/app/manifest.ts`). Lo compartido viaja en la dirección (`?text=…&url=…`); lo lee el navegador, lo guarda y borra los datos de
 * la dirección para que recargar no lo repita.
 */
export default async function CompartirPage() {
  const usuario = await requireModulo("instagram");
  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Compartido desde el celular" oculto />
      <RegistrarSw />
      <CompartirDesdeCelular puedeEscribir={!usuario.modulosSoloLectura.includes("instagram")} />
    </Pagina>
  );
}
