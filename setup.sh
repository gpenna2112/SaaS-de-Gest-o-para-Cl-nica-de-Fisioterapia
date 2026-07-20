#!/usr/bin/env bash
# Setup local para macOS/Linux — clinic-management.
#
# Reproduz em script os passos documentados em README.md ("Como rodar o
# projeto") e docs/SETUP.md: checa pré-requisitos, instala dependências,
# cria .env.local (sem sobrescrever um existente), sobe o Postgres de
# desenvolvimento em Docker e aplica migrations + seed.
#
# Idempotente: pode ser executado de novo com segurança em uma máquina já
# configurada (não recria .env.local, não recria o container se já existir,
# só roda o seed na primeira vez que o container é criado).
set -euo pipefail

CONTAINER_NAME="clinic-mgmt-dev-db"
VOLUME_NAME="clinic-mgmt-dev-db-data"
HOST_PORT="5434"
DB_NAME="clinic_management"
DB_USER="postgres"
DB_PASSWORD="postgres"

# Garante que o script funcione a partir de qualquer diretório e mesmo que o
# caminho do projeto tenha espaços.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
cd -- "$SCRIPT_DIR"

log() { printf '\n[setup] %s\n' "$1"; }
die() {
  printf '\n[setup] ERRO: %s\n' "$1" >&2
  exit 1
}

log "Verificando pré-requisitos..."

command -v node >/dev/null 2>&1 || die "Node.js não encontrado. Instale Node.js 20+ (https://nodejs.org) e rode este script de novo."
NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js 20+ é exigido (detectado: $(node -v))."
fi

command -v npm >/dev/null 2>&1 || die "npm não encontrado (normalmente instalado junto com Node.js)."

command -v docker >/dev/null 2>&1 || die "Docker não encontrado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop) e rode este script de novo."
docker info >/dev/null 2>&1 || die "Docker está instalado mas não parece estar em execução. Abra o Docker Desktop e tente de novo."

if docker compose version >/dev/null 2>&1; then
  log "Docker Compose detectado (não é usado por este projeto hoje — apenas checagem informativa)."
else
  log "AVISO: Docker Compose não encontrado. Não é necessário para este setup (o Postgres local sobe via 'docker run')."
fi

log "Instalando dependências (npm install)..."
npm install

if [ -f .env.local ]; then
  log ".env.local já existe — não foi sobrescrito."
else
  log "Criando .env.local a partir de .env.example..."
  if command -v openssl >/dev/null 2>&1; then
    AUTH_SECRET="$(openssl rand -base64 32)"
  else
    AUTH_SECRET="$(head -c 32 /dev/urandom | base64)"
  fi
  DEFAULT_DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@localhost:${HOST_PORT}/${DB_NAME}"
  DEFAULT_BETTER_AUTH_URL="http://localhost:3000"
  awk -v db_url="$DEFAULT_DATABASE_URL" -v secret="$AUTH_SECRET" -v auth_url="$DEFAULT_BETTER_AUTH_URL" '
    /^DATABASE_URL=/      { print "DATABASE_URL=" db_url; next }
    /^BETTER_AUTH_SECRET=/{ print "BETTER_AUTH_SECRET=" secret; next }
    /^BETTER_AUTH_URL=/   { print "BETTER_AUTH_URL=" auth_url; next }
    { print }
  ' .env.example > .env.local
  log ".env.local criado com DATABASE_URL/BETTER_AUTH_SECRET/BETTER_AUTH_URL preenchidos para o Postgres local deste script."
fi

FRESH_DB=0
if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
  log "Container '$CONTAINER_NAME' já existe."
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]; then
    log "Iniciando container existente..."
    docker start "$CONTAINER_NAME" >/dev/null
  fi
else
  log "Criando volume e container Postgres ('$CONTAINER_NAME', porta ${HOST_PORT})..."
  docker volume create "$VOLUME_NAME" >/dev/null
  docker run -d --name "$CONTAINER_NAME" \
    -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" \
    -p "${HOST_PORT}:5432" -v "${VOLUME_NAME}:/var/lib/postgresql/data" \
    postgres:16-alpine >/dev/null
  FRESH_DB=1
fi

log "Aguardando o Postgres aceitar conexões..."
ATTEMPTS=0
until docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 30 ]; then
    die "Postgres não respondeu em 30s. Verifique 'docker logs ${CONTAINER_NAME}'."
  fi
  sleep 1
done

# drizzle-kit (db:migrate/auth:db:migrate) lê DATABASE_URL de process.env, não
# faz load automático de .env.local — expõe as variáveis para este processo,
# mesmo padrão documentado em src/db/repositories/README.md.
set -a
# shellcheck disable=SC1091
source .env.local
set +a

log "Aplicando migrations de domínio (npm run db:migrate)..."
npm run db:migrate

log "Aplicando migrations do Better Auth (npm run auth:db:migrate)..."
npm run auth:db:migrate

if [ "$FRESH_DB" -eq 1 ]; then
  log "Populando dados de exemplo (npm run db:seed:dev)..."
  npm run db:seed:dev
else
  log "Container já existia — pulando 'npm run db:seed:dev' (rode manualmente se o banco ainda estiver vazio)."
fi

log "Setup concluído."
cat <<EOF

Próximos passos:
  1. npm run dev
  2. Crie o login de um profissional do seed (uma vez cada), ex.:
     curl -X POST http://localhost:3000/api/auth/sign-up/email \\
       -H "Content-Type: application/json" \\
       -d '{"email":"angelica@clinica-exemplo.test","password":"dev12345678","name":"Angélica"}'
  3. Entre em /login com esse e-mail/senha.

Detalhes: docs/SETUP.md e README.md.
EOF
