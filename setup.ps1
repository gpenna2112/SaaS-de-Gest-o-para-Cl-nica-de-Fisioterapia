<#
.SYNOPSIS
    Setup local para Windows (PowerShell) — clinic-management.

.DESCRIPTION
    Reproduz em script os passos documentados em README.md ("Como rodar o
    projeto") e docs/SETUP.md: checa pré-requisitos, instala dependências,
    cria .env.local (sem sobrescrever um existente), sobe o Postgres de
    desenvolvimento em Docker e aplica migrations + seed.

    Idempotente: pode ser executado de novo com segurança em uma máquina já
    configurada (não recria .env.local, não recria o container se já
    existir, só roda o seed na primeira vez que o container é criado).

.EXAMPLE
    .\setup.ps1
#>

$ErrorActionPreference = "Stop"

$ContainerName = "clinic-mgmt-dev-db"
$VolumeName = "clinic-mgmt-dev-db-data"
$HostPort = "5434"
$DbName = "clinic_management"
$DbUser = "postgres"
$DbPassword = "postgres"

function Write-Log {
    param([string]$Message)
    Write-Host ""
    Write-Host "[setup] $Message"
}

function Fail {
    param([string]$Message)
    Write-Host ""
    Write-Host "[setup] ERRO: $Message" -ForegroundColor Red
    exit 1
}

function Assert-Success {
    param([string]$Message)
    if ($LASTEXITCODE -ne 0) {
        Fail $Message
    }
}

# $PSScriptRoot resolve o diretório do próprio script mesmo se o caminho do
# projeto tiver espaços.
Set-Location -LiteralPath $PSScriptRoot

Write-Log "Verificando pré-requisitos..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js não encontrado. Instale Node.js 20+ (https://nodejs.org) e rode este script de novo."
}
$nodeVersionRaw = (node -v).Trim()
if ($nodeVersionRaw -notmatch '^v(\d+)\.') {
    Fail "Não foi possível interpretar a versão do Node.js: $nodeVersionRaw"
}
if ([int]$Matches[1] -lt 20) {
    Fail "Node.js 20+ é exigido (detectado: $nodeVersionRaw)."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail "npm não encontrado (normalmente instalado junto com Node.js)."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker não encontrado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop) e rode este script de novo."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "Docker está instalado mas não parece estar em execução. Abra o Docker Desktop e tente de novo."
}

docker compose version *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Log "Docker Compose detectado (não é usado por este projeto hoje — apenas checagem informativa)."
} else {
    Write-Log "AVISO: Docker Compose não encontrado. Não é necessário para este setup (o Postgres local sobe via 'docker run')."
}

Write-Log "Instalando dependências (npm install)..."
npm install
Assert-Success "Falha ao rodar 'npm install'."

if (Test-Path .env.local) {
    Write-Log ".env.local já existe — não foi sobrescrito."
} else {
    Write-Log "Criando .env.local a partir de .env.example..."

    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $authSecret = [Convert]::ToBase64String($bytes)

    $defaultDatabaseUrl = "postgres://${DbUser}:${DbPassword}@localhost:${HostPort}/${DbName}"
    $defaultAuthUrl = "http://localhost:3000"

    $output = Get-Content .env.example | ForEach-Object {
        if ($_ -match '^DATABASE_URL=') {
            "DATABASE_URL=$defaultDatabaseUrl"
        } elseif ($_ -match '^BETTER_AUTH_SECRET=') {
            "BETTER_AUTH_SECRET=$authSecret"
        } elseif ($_ -match '^BETTER_AUTH_URL=') {
            "BETTER_AUTH_URL=$defaultAuthUrl"
        } else {
            $_
        }
    }

    $envLocalPath = Join-Path (Get-Location) ".env.local"
    [System.IO.File]::WriteAllLines($envLocalPath, $output, (New-Object System.Text.UTF8Encoding($false)))
    Write-Log ".env.local criado com DATABASE_URL/BETTER_AUTH_SECRET/BETTER_AUTH_URL preenchidos para o Postgres local deste script."
}

$existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $ContainerName }
$freshDb = $false
if ($existing) {
    Write-Log "Container '$ContainerName' já existe."
    $running = (docker inspect -f '{{.State.Running}}' $ContainerName).Trim()
    if ($running -ne 'true') {
        Write-Log "Iniciando container existente..."
        docker start $ContainerName | Out-Null
        Assert-Success "Falha ao iniciar o container '$ContainerName'."
    }
} else {
    Write-Log "Criando volume e container Postgres ('$ContainerName', porta $HostPort)..."
    docker volume create $VolumeName | Out-Null
    Assert-Success "Falha ao criar o volume '$VolumeName'."
    docker run -d --name $ContainerName `
        -e "POSTGRES_PASSWORD=$DbPassword" -e "POSTGRES_DB=$DbName" `
        -p "${HostPort}:5432" -v "${VolumeName}:/var/lib/postgresql/data" `
        postgres:16-alpine | Out-Null
    Assert-Success "Falha ao criar o container '$ContainerName'."
    $freshDb = $true
}

Write-Log "Aguardando o Postgres aceitar conexões..."
$attempts = 0
while ($true) {
    docker exec $ContainerName pg_isready -U $DbUser -d $DbName *> $null
    if ($LASTEXITCODE -eq 0) { break }
    $attempts++
    if ($attempts -ge 30) {
        Fail "Postgres não respondeu em 30s. Verifique 'docker logs $ContainerName'."
    }
    Start-Sleep -Seconds 1
}

# drizzle-kit (db:migrate/auth:db:migrate) lê DATABASE_URL de process.env, não
# faz load automático de .env.local — expõe as variáveis para este processo,
# mesmo padrão documentado em src/db/repositories/README.md.
Get-Content .env.local | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx)
    $value = $line.Substring($idx + 1)
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
}

Write-Log "Aplicando migrations de domínio (npm run db:migrate)..."
npm run db:migrate
Assert-Success "Falha ao rodar 'npm run db:migrate'."

Write-Log "Aplicando migrations do Better Auth (npm run auth:db:migrate)..."
npm run auth:db:migrate
Assert-Success "Falha ao rodar 'npm run auth:db:migrate'."

if ($freshDb) {
    Write-Log "Populando dados de exemplo (npm run db:seed:dev)..."
    npm run db:seed:dev
    Assert-Success "Falha ao rodar 'npm run db:seed:dev'."
} else {
    Write-Log "Container já existia — pulando 'npm run db:seed:dev' (rode manualmente se o banco ainda estiver vazio)."
}

Write-Log "Setup concluído."
Write-Host @"

Próximos passos:
  1. npm run dev
  2. Crie o login de um profissional do seed (uma vez cada), ex.:
     curl -X POST http://localhost:3000/api/auth/sign-up/email `
       -H "Content-Type: application/json" `
       -d '{"email":"angelica@clinica-exemplo.test","password":"dev12345678","name":"Angélica"}'
  3. Entre em /login com esse e-mail/senha.

Detalhes: docs/SETUP.md e README.md.
"@
