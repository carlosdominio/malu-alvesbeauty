FROM evoapicloud/evolution-api:v2.3.7

ENV SERVER_PORT=8080
ENV SERVER_TYPE=http
ENV DATABASE_ENABLED=true
ENV DATABASE_PROVIDER=postgresql
ENV DATABASE_CONNECTION_URI="postgresql://postgres.lsgewrzvdviqthzegowv:aEB4_2Fgg!k5EZC@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?schema=public&sslmode=require"
ENV DATABASE_CONNECTION_CLIENT_NAME=evolution_v2

EXPOSE 8080
