# Setup do ambiente local

Guia para preparar o `clinic-management` em uma máquina nova (Windows, macOS ou Linux). Cobre o caminho automatizado (`setup.ps1`/`setup.sh`) e o caminho manual — os dois executam exatamente os mesmos comandos documentados na raiz do [`README.md`](../README.md#como-rodar-o-projeto).

## Pré-requisitos

- **Node.js 20+** e **npm** — <https://nodejs.org>
- **Docker Desktop** (Windows/macOS) ou Docker Engine (Linux) — usado para o Postgres local. Precisa estar **em execução**, não só instalado.
- Git, para clonar o repositório.

Os scripts de setup checam essas três coisas antes de fazer qualquer alteração e param com uma mensagem clara se algo faltar.

## Caminho automatizado

### Windows (PowerShell)

```powershell
cd caminho\para\clinic-management
.\setup.ps1
```

Se o PowerShell bloquear a execução do script (política de execução padrão em muitas instalações), rode uma vez:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Isso libera a execução só para a sessão atual do terminal, sem alterar a política da máquina.

### macOS / Linux

```bash
cd caminho/para/clinic-management
./setup.sh
```

Se der erro de permissão, rode `chmod +x setup.sh` uma vez e tente de novo.

### O que o script faz

1. Verifica Node.js (20+), npm, Docker (instalado e em execução) e, informativamente, Docker Compose (não é usado hoje pelo projeto — o Postgres local sobe via `docker run`).
2. Roda `npm install`.
3. Cria `.env.local` a partir de `.env.example` **somente se ele ainda não existir** — nunca sobrescreve um `.env.local` já configurado. Ao criar, já preenche `DATABASE_URL`, `BETTER_AUTH_SECRET` (gerado aleatoriamente) e `BETTER_AUTH_URL` com valores prontos para o Postgres local do próprio script.
4. Sobe um container Postgres (`clinic-mgmt-dev-db`, porta `5434` no host) com um volume nomeado persistente (`clinic-mgmt-dev-db-data`). Se o container já existir de uma execução anterior, reaproveita — só inicia se estiver parado.
5. Espera o Postgres aceitar conexões.
6. Aplica as migrations: `npm run db:migrate` (domínio) e `npm run auth:db:migrate` (Better Auth).
7. Roda `npm run db:seed:dev` **apenas na primeira vez** que o container é criado (o seed não é reexecutado em máquinas já configuradas, para não rodar duas vezes no mesmo banco).

O script é idempotente: rodar de novo numa máquina já configurada não recria nada que já existe, só garante que container/dependências estejam no estado esperado.

### Depois do script

```bash
npm run dev
```

O seed cria profissionais **sem login vinculado** (mesmo fluxo real de provisionamento, ADR-0017). Para entrar em `/login`, crie a conta uma vez por profissional via endpoint do Better Auth:

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"angelica@clinica-exemplo.test","password":"dev12345678","name":"Angélica"}'
```

> Ajuste a porta na URL se o `next dev` tiver subido em outra (ele pula para a próxima porta livre se 3000 estiver ocupada — confira o log do `npm run dev`). Profissionais disponíveis no seed: `angelica@clinica-exemplo.test` e `patricia@clinica-exemplo.test` (gestoras), `fernanda@clinica-exemplo.test` e `sophia@clinica-exemplo.test` (fisioterapeutas) — todas com a senha usada no signup.

## Caminho manual

Equivalente ao que os scripts automatizam, caso prefira rodar cada passo à mão ou algo no script não se aplique ao seu ambiente:

```bash
npm install

docker volume create clinic-mgmt-dev-db-data
docker run -d --name clinic-mgmt-dev-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=clinic_management \
  -p 5434:5432 -v clinic-mgmt-dev-db-data:/var/lib/postgresql/data \
  postgres:16-alpine

cp .env.example .env.local
# Preencha DATABASE_URL (porta escolhida acima), gere BETTER_AUTH_SECRET
# (openssl rand -base64 32) e ajuste BETTER_AUTH_URL.

npm run db:migrate
npm run auth:db:migrate
npm run db:seed:dev   # uma vez por banco

npm run dev
```

No Windows sem `openssl`/`curl` nativos, use o PowerShell equivalente para gerar o segredo:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Gerenciando o container entre sessões

```bash
docker stop clinic-mgmt-dev-db     # pausa, mantém os dados
docker start clinic-mgmt-dev-db    # retoma

# Descartar tudo e recomeçar do zero:
docker rm -f clinic-mgmt-dev-db && docker volume rm clinic-mgmt-dev-db-data
```

## Solução de problemas

- **"Docker está instalado mas não parece estar em execução"** — abra o Docker Desktop e espere o ícone indicar que o engine subiu, depois rode o script de novo.
- **Porta `5434` já em uso** — outro processo/container já ocupa a porta. Pare o outro processo ou suba o container manualmente numa porta livre (ajustando `-p` e `DATABASE_URL` em `.env.local` de acordo).
- **`npm run db:migrate` falha com erro de conexão** — confirme que o container está rodando (`docker ps`) e que `DATABASE_URL` em `.env.local` aponta para a porta correta.
- **Erro de política de execução no Windows** — ver a seção "Windows (PowerShell)" acima.

## Referências

- [`README.md`](../README.md) — visão geral do projeto e scripts npm disponíveis
- [`../CLAUDE.md`](../CLAUDE.md) — regras arquiteturais e estado atual do projeto
- [`src/db/README.md`](../src/db/README.md) e [`src/db/repositories/README.md`](../src/db/repositories/README.md) — detalhes de schema e testes de integração
