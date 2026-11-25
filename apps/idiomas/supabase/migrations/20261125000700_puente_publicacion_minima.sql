-- Puente · Migración 7: superficie de API mínima en el proyecto dedicado.
-- Puente solo usa RPC del esquema idiomas_api (PostgREST). GraphQL no se usa: se retira la
-- extensión para que ningún endpoint refleje tablas. En el panel, Data API → Exposed schemas debe
-- contener únicamente `idiomas_api` (paso documentado en el README).
drop extension if exists pg_graphql;

-- public queda vacío y sin uso por parte de la app.
revoke create on schema public from public;
