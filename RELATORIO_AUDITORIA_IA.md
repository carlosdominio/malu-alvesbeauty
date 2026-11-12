# 💈 Relatório de Auditoria Técnica e Diagnóstico de Sistema — Barber OS

> **Data da Auditoria:** 12 de Novembro de 2026  
> **Equipe de Análise:** Arquiteto de Software, Engenheiro Sênior de Código e Auditor de Segurança (IA Multi-Agente)  
> **Repositório Analisado:** `barber-os` (Next.js 14 + Supabase + Baileys WhatsApp)

---

## 📌 1. Visão Geral do Sistema

O **Barber OS** é um sistema completo e de alto valor prático para barbearias e salões, combinando:
1. **Portal do Cliente (`/agendar`):** Fluxo de auto-agendamento responsivo com escolha de serviços, barbeiro, data e horários dinâmicos.
2. **Painel Administrativo (`/admin`):** Dashboard gerencial com controle financeiro, gestão de clientes, controle de expediente/bloqueios e conexão WhatsApp.
3. **Servidor Autônomo de WhatsApp (`whatsapp-server.js`):** Robô integrado via `@whiskeysockets/baileys` e PostgreSQL para responder clientes, confirmar agendamentos e gerar QR Codes de conexão.

---

## 🏗️ 2. Análise Arquitetural e Stack

* **Frontend:** Next.js 14.2 (App Router), React 18, TailwindCSS, Lucide React, PWA install ready.
* **Backend:** Next.js Route Handlers (`src/app/api/...`) + Node.js HTTP Server (`whatsapp-server.js` na porta 3001).
* **Persistência de Dados:** Modelo Híbrido Triplo:
  * **Supabase (PostgreSQL):** Tabelas `barbearia_config`, `agendamentos`, `clientes`, `servicos`, `expediente`.
  * **Arquivo Local JSON (`data_storage.json` / `serverStore.ts`):** Fallback quando o Supabase estiver desconectado.
  * **Browser (`localStorage` via `dataStore.ts`):** Cache do lado do cliente.

---

## 🔒 3. Diagnóstico Crítico de Segurança (Atenção Imediata)

> [!CAUTION]
> **Vulnerabilidade 1: Credenciais de Banco de Dados Expostas no Código**
> No arquivo `whatsapp-server.js` (linhas 21-23), a URL de conexão direta com senha do PostgreSQL da AWS/Supabase está exposta em texto plano:
> ```javascript
> const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres.lsgewrzvdviqthzegowv:aEB4_...sa-east-1.pooler.supabase.com:6543/postgres";
> ```
> **Risco:** Qualquer pessoa com acesso ao código ou commit pode ter controle total sobre o banco de dados.  
> **Solução:** Remover o valor hardcoded e obrigar o uso exclusivo de variáveis no `.env`.

> [!WARNING]
> **Vulnerabilidade 2: Autenticação Administrativa Insegura**
> No arquivo `src/app/api/auth/login/route.ts`:
> 1. Senha mestre padrão em texto plano (`Malu@2026`).
> 2. Senha de admin salva no banco sem hash criptográfico (bcrypt/argon2).
> 3. Token de sessão gerado em Base64 simples sem assinatura secreta HMAC/JWT (`Buffer.from('${usuario}:${Date.now()}...').toString('base64')`).
> 4. Cookie `malu_admin_auth` com `httpOnly: false`, vulnerável a roubo de sessão via ataques XSS.

> [!WARNING]
> **Vulnerabilidade 3: Chaves de API do Supabase com Fallback Hardcoded**
> Em `src/lib/supabase.ts` (linhas 7 e 15), existem tokens de fallback fixos no código fonte. Devem ser movidos 100% para o `.env.local`.

---

## ⚡ 4. Diagnóstico de Código e Performance

| Área | Situação Atual | Recomendação Técnica |
| :--- | :--- | :--- |
| **Monolito no Bot (`whatsapp-server.js`)** | O arquivo tem mais de **1.840 linhas**, misturando servidor HTTP, lógica de Baileys, regras de negócio e consultas SQL diretas. | Modularizar em `src/bot/handlers/`, `src/bot/connection.js` e `src/bot/db.js`. |
| **Consistência de Estado (Dual Storage)** | O sistema tenta sincronizar `data_storage.json` e `Supabase`. Isso causa condições de corrida onde o bot lê do arquivo local enquanto o admin atualizou no Supabase. | Eleger o Supabase/PostgreSQL como a **Fonte Única da Verdade (SSOT)**. Usar o JSON apenas para testes offline locais. |
| **Bloqueios de Concorrência na Agenda** | Dois clientes agendando o mesmo horário no WhatsApp ao mesmo segundo podem gerar agendamento duplo (*double booking*). | Adicionar uma restrição única no banco (`UNIQUE(data_hora, barbeiro_id)`) e transação atômica. |

---

## 🚀 5. Top 5 Recomendações Prioritárias

1. **Trocar a senha do banco e proteger `.env`:** Gerar uma nova senha no painel do Supabase e remover as strings de conexão hardcoded de `whatsapp-server.js` e `src/lib/supabase.ts`.
2. **Implementar JWT + Bcrypt no Login:** Usar `bcryptjs` para comparar senhas e `jose` / `jsonwebtoken` para assinar cookies com `httpOnly: true` e `secure: true`.
3. **Modularizar o `whatsapp-server.js`:** Dividir as 1.840 linhas em pequenos módulos para facilitar correções de bugs e evitar travamento do processo Baileys.
4. **Unificar a Camada de Dados:** Eliminar a redundância do `data_storage.json` em produção, direcionando todas as operações para o cliente Supabase oficial.
5. **Adicionar PM2 ou Docker Compose:** Orquestrar o Next.js e o WhatsApp Server juntos, garantindo que o bot reinicie automaticamente caso o WhatsApp caia.
