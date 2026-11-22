-- Fase 1b (parte 1): borra las tablas de la primera versión (solo tenían datos semilla).
drop function if exists public.crear_empresa(text);
drop function if exists public.marcar_password_cambiada();
drop table if exists public.perfil_bodegas, public.perfiles, public.categorias, public.bodegas,
  public.centro_empresas, public.empresas, public.centros cascade;
drop function if exists app.mi_rol(), app.mi_centro(), app.mi_empresa(), app.empresas_visibles(), app.centros_visibles();
drop type if exists public.rol_usuario, public.tipo_bodega;

