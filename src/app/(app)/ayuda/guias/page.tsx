import Link from "next/link";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { guiasPara } from "@/lib/ayuda/contenido";
import { requireSesion } from "../datos-ayuda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guías" };

/** Las guías de los módulos que la persona puede abrir. */
export default async function GuiasPage() {
  const usuario = await requireSesion();
  const guias = guiasPara(usuario.modulos);
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Guías" oculto />
      {guias.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no tienes módulos con guía.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
          {guias.map((g) => (
            <li key={g.modulo}>
              <Link href={`/ayuda/guias/${g.modulo}`} className={`flex h-full flex-col gap-1 rounded-[10px] border border-border bg-card p-4 transition-colors hover:bg-muted ${anilloFoco}`}>
                <span className="font-semibold">{g.titulo}</span>
                <span className="text-sm text-muted-foreground">{g.resumen}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Pagina>
  );
}
