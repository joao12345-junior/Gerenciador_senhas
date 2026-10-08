# Cofre Optare — Checklist de progresso

Fonte do `npm run progress`. Regras do formato (o script lê isto):
- Cada bloco é um título `## Nome (peso N)`. A soma dos pesos deve dar 100.
- Cada entregável é uma linha `- [ ]` ou `- [x]`. Marque `[x]` só quando estiver
  verde nos testes e commitado.
- Item grande demais? Quebre em itens menores: o percentual fica mais honesto.

## Fundação (peso 15)
- [x] Migrations 001–012 aplicadas no optare4
- [x] `env.ts` com validação (zod)
- [x] `migrate.ts` com checksum canônico e `.gitattributes`
- [x] Cifra AES-GCM
- [x] Hash de senha (argon2)
- [x] Gerador e hash de tokens
- [x] TOTP (otpauth)
- [x] Integridade de conta (HMAC `auth_mac`)
- [x] Logger LogDash
- [x] `PostgresUserRepository` (9 métodos)
- [x] `AccountSigning` + script `sign-users`

## Domínio e repositórios (peso 20)
- [x] `permissions` e `private-access`
- [x] `discipline`, `discipline-access`, `credential-access`
- [x] `rotation-flag` (domínio)
- [x] `errors` (AuthIntegrity, DuplicateName, NotFound)
- [x] Domínio e portas de grupo e subgrupo
- [x] `PostgresGroupRepository` + `group-row` (53 integração, 17 mutações)
- [x] `PostgresSubgroupRepository` + `subgroup-row` (77 integração)
- [x] Mutações do subgrupo (27 de 27 mortas, `mutate-subgroup-repository.mjs`)
- [ ] Disciplina: entidade + porta
- [ ] `PostgresDisciplineRepository`
- [ ] `RotationFlagRepository` (porta + adaptador)
- [ ] Credencial: entidade + porta + `credential-row`
- [ ] `PostgresCredentialRepository` (com cifra)
- [ ] Sessão: porta + adaptador
- [ ] Códigos de recuperação: porta + adaptador
- [ ] Auditoria: porta + adaptador banco + LogDash
- [ ] Envio de e-mail (Resend): porta + adaptador
- [ ] Aceite de política (migration 011): porta + adaptador

## Casos de uso (peso 25)
- [x] `signPendingAccounts`
- [ ] Montar `ActorContext` (usuário + disciplinas)
- [ ] Login (senha + falha genérica + `AuthIntegrityError`)
- [ ] Verificar MFA
- [ ] Setup de 2FA
- [ ] Logout / encerrar sessão
- [ ] Recuperação com código
- [ ] Trocar senha
- [ ] Listar grupos e subgrupos visíveis ao usuário
- [ ] Listar credenciais de um subgrupo
- [ ] Revelar credencial (com motivo para Privada da coordenação)
- [ ] Criar credencial (valida contenção de disciplinas)
- [ ] Editar credencial
- [ ] Desativar / excluir credencial
- [ ] Admin: grupos (criar, editar, ativar, escopo)
- [ ] Admin: subgrupos (criar, editar, mover, ativar, escopo)
- [ ] Admin: usuários (criar, papel, desativar, disciplinas)
- [ ] Admin: disciplinas
- [ ] Flag de rotação no desligamento (`flag-on-offboarding`)
- [ ] Consultar auditoria
- [ ] Aceite da política de conteúdo

## Telas (peso 30)
- [ ] Layout base + navegação
- [ ] Login
- [ ] MFA
- [ ] Setup 2FA
- [ ] Home (grupos)
- [ ] Lista de subgrupos + filtro por plataforma
- [ ] Lista de credenciais
- [ ] Revelar credencial / copiar
- [ ] Formulário de credencial
- [ ] Admin: grupos
- [ ] Admin: subgrupos (plataformas)
- [ ] Admin: usuários
- [ ] Admin: disciplinas
- [ ] Auditoria
- [ ] Aceite da política
- [ ] Estados vazio, erro e carregando
- [ ] Responsivo (mobile)

## Deploy e endurecimento (peso 10)
- [ ] Cookies de sessão seguros + `proxy.ts` protegendo rotas
- [ ] Limite de tentativas de login
- [ ] Cabeçalhos de segurança (CSP etc.)
- [ ] Variáveis na Vercel conferidas (`AUTH_MAC_KEY` igual ao `.env`)
- [ ] Rota `api/credentials/[id]/reveal`
- [ ] Testes ponta a ponta do fluxo principal
- [ ] Primeiro `sign-users --apply` com contas reais
- [ ] Revisão de segurança final
- [ ] Runbook (backup, rotação de chaves)
