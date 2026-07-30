-- El rótulo de etapa que ve el cliente, separado del estado de pipeline.
--
-- `projects.current_stage` hacía las dos cosas: estado interno y pill visible en
-- el lobby y en la sala. Escribir "Ganada · contrato en preparación" pensando en
-- pipeline lo puso frente al cliente (MPS, 2026-07-29). El campo invitaba al
-- error porque es texto libre sin dueño declarado.
--
-- Desde acá: current_stage es interno y punto. Lo que ve el cliente sale de
-- clientStageLabel() en src/lib/client-stage.ts, que traduce por lista blanca y
-- cae a un rótulo neutro si la etapa no está mapeada — así un término nuevo de
-- pipeline no puede filtrarse aunque nadie recuerde esta regla. Este campo es el
-- escape para decir algo más preciso que el mapa.
alter table public.projects
  add column if not exists client_stage_label text;

comment on column public.projects.client_stage_label is
  'Rótulo de etapa de cara al cliente. Si está vacío se traduce current_stage por lista blanca (src/lib/client-stage.ts). NUNCA escribir acá lenguaje de pipeline: lo lee el cliente en el lobby y en la sala.';

comment on column public.projects.current_stage is
  'Estado INTERNO de pipeline. No se renderiza crudo al cliente — pasa por clientStageLabel(). Ver client_stage_label.';
