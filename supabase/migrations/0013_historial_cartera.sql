-- Historial de Cartera de Dropi (cuenta proveedor): cada movimiento de
-- billetera queda ligado a una orden y su guia. Sirve para detectar ordenes
-- que Dropi ya liquido (tiene "ENTRADA POR GANANCIA") pero que en nuestra
-- tabla `ordenes` todavia no aparecen como ENTREGADO.

create table historial_cartera (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  plataforma_id uuid not null references plataformas(id),
  dropi_id bigint not null,
  tipo text not null,
  monto numeric(12, 2) not null,
  orden_referencia_externa text,
  guia text,
  descripcion text,
  fecha date not null,
  fecha_hora text,
  unique (pais_id, plataforma_id, dropi_id)
);

alter table historial_cartera enable row level security;
create policy "authenticated read/write" on historial_cartera for all using (auth.role() = 'authenticated');
