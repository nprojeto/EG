# Essência do Guerreiro — Comando 1C1613

Ficha de alistamento do acampamento. Página estática no GitHub Pages,
dados e arquivos no Supabase.

```
index.html                                  a ficha (42 KB, editável no GitHub)
media/                                      fotos, vídeos, trilha e o termo em Word
supabase/01-estrutura.sql                   tabela, bucket e políticas       ✅ já rodado
supabase/02-lockdown.sql                    fecha o acesso direto            ⬅ rodar por último
supabase/functions/inscricao/index.ts       a Edge Function que recebe a ficha
```

---

## 1. Publicar no GitHub

Suba o conteúdo desta pasta na raiz do repositório — o `index.html` e a pasta
`media/` precisam ficar lado a lado, senão as fotos não carregam.

A pasta `supabase/` pode subir junto: ela não atrapalha o Pages e mantém o
histórico do banco versionado. Se preferir, deixe fora do repositório.

Em **Settings → Pages**, aponte a origem para a branch `main`, pasta raiz.

## 2. Publicar a Edge Function

O Supabase exige que o arquivo se chame `index.ts` dentro de uma pasta com o
nome da função — daí o caminho `supabase/functions/inscricao/index.ts`.

```bash
supabase link --project-ref tnpjoawcsdlmuewstsif
supabase functions deploy inscricao
```

Não precisa configurar variável de ambiente: `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente.

Sem CLI: **Edge Functions → Deploy a new function**, nome `inscricao`, e cole
o conteúdo do arquivo.

## 3. Testar

Abra a página publicada, preencha uma ficha de teste e conclua a etapa 03.
Confira em **Table Editor → inscricoes** e em **Storage → comprovantes**.

Testar pelo endereço do GitHub Pages, não abrindo o arquivo direto do
computador: em `file://` alguns navegadores bloqueiam a chamada à função.

## 4. Fechar a porta

Deu tudo certo no teste? Rode `supabase/02-lockdown.sql` no SQL Editor.
Ele remove as políticas que permitem gravar direto com a chave pública,
deixando a Edge Function como único caminho de entrada.

Apague a inscrição de teste antes de divulgar o link.

---

## Ajustes rápidos no `index.html`

| O quê | Onde procurar |
|---|---|
| Chave Pix | `COLOQUE-AQUI-A-CHAVE-PIX` |
| Valor | `R$&nbsp;95` e `pix_valor` na Edge Function |
| Link do squad | `nprojeto.github.io/squadpray/squad/...` |
| Link do grupo | `chat.whatsapp.com/...` |
| Brilho do fundo | `#bg .fit` → `brightness(.72)` |
| Volume inicial | `#somVol` → `value="35"` |

## Onde ficam os arquivos enviados

Bucket privado `comprovantes`, uma pasta por inscrito:

```
comprovantes/joao-pedro-silva-1788126847391/
├── pix.jpg            comprovante do Pix
├── squad.png          print da solicitação no SquadPray
└── autorizacao.pdf    termo assinado (só menores de 18)
```

Os caminhos ficam nas colunas `comprovante_pix_path`, `print_squad_path` e
`autorizacao_path` da tabela. Consultas prontas no fim do `01-estrutura.sql`.
