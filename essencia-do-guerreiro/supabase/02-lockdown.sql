-- ============================================================
-- ESSÊNCIA DO GUERREIRO — COMANDO 1C1613
-- Rode ISTO DEPOIS de publicar a Edge Function e testar o envio.
--
-- Tira o acesso direto da chave pública. A partir daqui, só a
-- Edge Function (que usa a service_role) consegue gravar.
-- ============================================================

-- 1) A chave pública não insere mais direto na tabela
drop policy if exists "form pode inserir" on public.inscricoes;

-- 2) Nem sobe mais arquivos direto no bucket
drop policy if exists "form pode subir comprovantes" on storage.objects;

-- A service_role ignora RLS por natureza, então a Edge Function
-- continua gravando normalmente. Você segue vendo tudo pelo painel.

-- ------------------------------------------------------------
-- CONFERÊNCIA — o resultado deve vir vazio
-- ------------------------------------------------------------
-- select policyname, cmd, roles from pg_policies
-- where tablename = 'inscricoes';

-- ------------------------------------------------------------
-- SE PRECISAR VOLTAR ATRÁS (desligar a Edge Function)
-- ------------------------------------------------------------
-- create policy "form pode inserir" on public.inscricoes
--   for insert to anon with check (true);
-- create policy "form pode subir comprovantes" on storage.objects
--   for insert to anon with check (bucket_id = 'comprovantes');
