import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { LecturaBiblioteca } from "./lectura-biblioteca";

export const metadata = { title: "Biblioteca de anuncios" };

export const dynamic = "force-dynamic";

/**
 * Donde llega la lectura que el marcador hizo de la Biblioteca de anuncios de Meta: la lectura viaja en el fragmento de la dirección
 * (`#d=…`), que el servidor nunca ve; la lee el navegador y se la entrega a la acción `guardarLecturaBiblioteca`.
 */
export default async function BibliotecaPage() {
  const usuario = await requireModulo("instagram");
  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Biblioteca de anuncios" oculto />
      <LecturaBiblioteca puedeEscribir={!usuario.modulosSoloLectura.includes("instagram")} />
    </Pagina>
  );
}
