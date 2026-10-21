import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { AfinarModulo } from "../../../../afinar/afinar-modulo";
import { cargarDatosAfinar } from "../../../../afinar/datos-afinar";

export const metadata = { title: "Afinar · Usuarios y roles" };

export const dynamic = "force-dynamic";

export default async function AfinarPage({ params }: { params: Promise<{ id: string; modulo: string }> }) {
  const { id, modulo } = await params;
  const datos = await cargarDatosAfinar("rol", id, modulo);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={`Afinar «${datos.catalogo.etiqueta}»`} oculto />
      <EtiquetaMiga texto={`Afinar «${datos.catalogo.etiqueta}»`} />
      <AfinarModulo datos={datos} />
    </Pagina>
  );
}
