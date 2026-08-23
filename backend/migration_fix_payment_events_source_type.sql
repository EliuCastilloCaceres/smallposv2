-- payment_events.chk_pe_source_type se creó solo con 'order'/'layaway'/'credit'
-- — se quedó desactualizado cuando returnService empezó a insertar reversas
-- con source_type = 'return'. MySQL no permite modificar un CHECK existente
-- directamente, hay que tirarlo y recrearlo.
ALTER TABLE `payment_events`
  DROP CHECK `chk_pe_source_type`;

ALTER TABLE `payment_events`
  ADD CONSTRAINT `chk_pe_source_type` CHECK (`source_type` IN ('order','layaway','credit','return'));
