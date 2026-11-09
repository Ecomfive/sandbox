import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, mesEnCursoPanama, mesMedio, sumarMeses } from "@/lib/af4/fecha";
import { requireModulo } from "@/lib/auth";
import { cargarConfigCierre } from "@/lib/finanzas/cargar-cierre-control";
import { fechaObjetivo } from "@/lib/finanzas/cierre-control";
import { createServiceClient } from "@/lib/supabase/server";
import { FormularioConfigCierre } from "./formulario-config";

export const metadata = { title: "Configuración del cierre" };

export const dynamic = "force-dynamic";

export default async function ConfiguracionCierrePage() {
  const usuario = await requireModulo("cierre-mes");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Cierre de mes" />;
  const { config } = await cargarConfigCierre(createServiceClient());
  const editable =
    !usuario.modulosSoloLectura.includes("cierre-mes") && usuario.modulos.includes("usuarios") && !usuario.modulosSoloLectura.includes("usuarios");
  const anterior = sumarMeses(mesEnCursoPanama(), -1);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Configuración del cierre" imprimir={false} />
      <KpiGroup titulo="Con estos ajustes">
        <KpiGrid compacta>
          <KpiCard compacta titulo={`${mesMedio(anterior)} se cierra a más tardar`} valor={fechaCorta(fechaObjetivo(anterior, config.diaHabil))} />
          <KpiCard compacta titulo={`${mesMedio(mesEnCursoPanama())} se cierra a más tardar`} valor={fechaCorta(fechaObjetivo(mesEnCursoPanama(), config.diaHabil))} />
        </KpiGrid>
      </KpiGroup>
      <MarcoAF4 id="titulo-config" titulo="Ajustes del cierre">
        <FormularioConfigCierre config={config} editable={editable} />
      </MarcoAF4>
    </Pagina>
  );
}
