-- Documento del sistema con el que el centro envía a cada sucursal (ej. T0103 TRASLADO CENTRO DIST-TIENDA 2 EMPQ)
alter table public.tiendas add column documento_traslado text, add column documento_nombre text;
