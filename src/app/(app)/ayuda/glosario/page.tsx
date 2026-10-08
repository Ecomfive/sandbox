import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { glosarioPara } from "@/lib/ayuda/contenido";
import { requireSesion } from "../datos-ayuda";
import { GlosarioBuscable } from "./glosario-buscable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Glosario" };

/** Los términos del sistema que usa la persona (los generales y los de sus módulos), con buscador. */
export default async function GlosarioPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const usuario = await requireSesion();
  const terminos = glosarioPara(usuario.modulos)
    .map(({ termino, definicion }) => ({ termino, definicion }))
    .sort((a, b) => a.termino.localeCompare(b.termino, "es"));
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Glosario" oculto />
      <GlosarioBuscable key={typeof q === "string" ? q : ""} terminos={terminos} inicial={typeof q === "string" ? q : ""} />
    </Pagina>
  );
}
