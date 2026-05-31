# MOV Diagnóstico IA — Guia de Uso

## O que é
App web completo para diagnóstico inteligente de empilhadeiras usando IA (Claude da Anthropic).
Funciona no navegador do celular e PC. Pode ser instalado como app (PWA).

---

## Como usar

### 1. Abrir o app
- Abra o arquivo `index.html` no navegador (Chrome recomendado)
- Ou hospede os arquivos em qualquer servidor web

### 2. Configurar a chave da API
- Acesse **Configurações** no menu lateral
- Cole sua chave da API Anthropic (obtida em https://console.anthropic.com)
- A chave começa com `sk-ant-...`
- Clique em **Salvar**

### 3. Usar o diagnóstico
- Clique em **Novo Diagnóstico**
- Escolha o tipo: Corretiva, Info do Cliente ou Preventiva
- Preencha modelo, PAT, horímetro e sintoma
- Clique em **Analisar com IA**
- Salve o resultado no histórico se desejar

### 4. Importar relatórios PDF
- Acesse **Importar Relatórios**
- Arraste ou selecione seus PDFs de AT ou manutenção preventiva
- A IA extrai automaticamente os dados e adiciona à base

### 5. Base de Conhecimento
- Visualize todos os casos cadastrados
- Adicione casos manualmente
- Exporte a base em JSON para backup

---

## Tipos de relatório suportados
1. **Relatório de Assistência Técnica (Corretiva)** — ex: 030371
   - Sintoma, causa, solução, peças, mau uso
2. **Relatório de Manutenção Preventiva** — ex: 030466
   - Checklist 500h/1000h/2000h, estado dos acessórios
3. **Informações do cliente** — texto livre, WhatsApp, e-mail

---

## Instalar como app no celular (Android)
1. Abra o app no Chrome
2. Toque nos 3 pontinhos (menu)
3. Toque em "Adicionar à tela inicial"
4. Confirme — aparece como app!

## Instalar como app no PC (Chrome)
1. Abra o app no Chrome
2. Clique no ícone de instalar na barra de endereços (ícone de computador com seta)
3. Clique em "Instalar"

---

## Hospedagem gratuita (para todos os técnicos acessarem)
Opção mais fácil: **Netlify Drop**
1. Acesse https://app.netlify.com/drop
2. Arraste a pasta com os arquivos
3. Recebe um link como: https://mov-diagnostico.netlify.app
4. Compartilhe com todos os técnicos!

Outras opções: Vercel, GitHub Pages, Cloudflare Pages

---

## Dados
- Todos os dados ficam salvos localmente no navegador (localStorage)
- Use "Exportar Base" em Configurações para fazer backup
- A chave da API fica salva apenas no dispositivo, nunca é enviada para terceiros (apenas para a API da Anthropic)

---

## Suporte
Grupo MOV · suporte@grupomov.com.br · (31) 3317-3915
