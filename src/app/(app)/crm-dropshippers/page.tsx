import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import type { FilaDropshipper, FilaInteraccion } from "./def-crm";
import { ListaDropshippers } from "./lista-dropshippers";
import { TablaInteracciones } from "./tabla-interacciones";

export const metadata = { title: "CRM Dropshippers" };

export const dynamic = "force-dynamic";

export default async function CrmDropshippersPage() {
  const usuario = await requireModulo("crm-dropshippers");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("crm-dropshippers");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: dropshippers }, { data: interacciones }] = await Promise.all([
    supabase
      .from("dropshippers")
      .select("id, nombre, contacto_email, contacto_telefono, estado, volumen_mensual_estimado, notas")
      .eq("pais_id", pais.id)
      .order("nombre"),
    supabase
      .from("interacciones_dropshipper")
      .select("id, fecha, tipo, nota, dropshippers!inner(nombre, pais_id)")
      .eq("dropshippers.pais_id", pais.id)
      .order("fecha", { ascending: false })
      .limit(50),
  ]);

  const filasDropshippers: FilaDropshipper[] = (dropshippers ?? []).map((d) => ({
    id: d.id,
    nombre: d.nombre,
    email: d.contacto_email,
    telefono: d.contacto_telefono,
    estado: d.estado,
    volumen: d.volumen_mensual_estimado === null ? null : Number(d.volumen_mensual_estimado),
    notas: d.notas,
  }));

  const filasInteracciones: FilaInteraccion[] = (interacciones ?? []).map((i) => ({
    id: i.id,
    fecha: i.fecha,
    dropshipper: (i.dropshippers as unknown as { nombre: string } | null)?.nombre ?? "",
    tipo: i.tipo,
    nota: i.nota,
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="CRM Dropshippers" oculto />

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Dropshippers</h2>
        <div className="mt-3">
          <ListaDropshippers
            dropshippers={filasDropshippers}
            pais={pais.nombre}
            paisId={pais.id}
            codigoPais={pais.codigo}
            puedeEscribir={puedeEscribir}
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Interacciones recientes</h2>
        <div className="mt-3">
          <TablaInteracciones
            interacciones={filasInteracciones}
            dropshippers={(dropshippers ?? []).map((d) => ({ id: d.id, nombre: d.nombre }))}
            puedeEscribir={puedeEscribir}
          />
        </div>
      </div>
    </Pagina>
  );
}
