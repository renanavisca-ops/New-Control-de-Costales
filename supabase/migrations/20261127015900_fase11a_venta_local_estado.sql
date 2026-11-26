alter type public.estado_costal add value if not exists 'VENDIDO';
alter table public.tiendas add column es_venta_local boolean not null default false;
alter table public.costales add column vendido_at timestamptz, add column vendido_por uuid references auth.users(id);
