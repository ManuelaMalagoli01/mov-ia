-- MOV IA - login individual (técnicos e coordenação)
-- Rodar uma vez no Supabase: SQL Editor > New query > colar tudo > Run.
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  login text not null unique,
  nome text not null,
  perfil text not null default 'tecnico',   -- 'tecnico' ou 'coordenacao'
  senha_hash text not null,                 -- senha criptografada, ninguém vê a senha
  trocar_senha boolean not null default true,
  ativo boolean not null default true,
  ultimo_acesso timestamptz,
  criado_em timestamptz default now()
);
-- acesso só pelo servidor do app (chave service_role)
alter table usuarios enable row level security;
