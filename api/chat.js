// MOV IA - proxy para a API da Anthropic.
// A chave fica so no Vercel (ANTHROPIC_API_KEY). O tecnico informa apenas o
// codigo de acesso (MOV_ACCESS_CODE), que pode ser trocado a qualquer momento.
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

import crypto from 'crypto';
const MODELO = 'claude-sonnet-4-6';
// aceita o login individual (mesma assinatura do api/dados.js)
function tokenValido(tok) {
  const seg = process.env.MOV_SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY || '';
  const [corpo, sig] = String(tok || '').split('.');
  if (!seg || !corpo || !sig) return false;
  const esp = crypto.createHmac('sha256', seg).update(corpo).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (esp.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(esp), Buffer.from(sig))) return false;
  try { return JSON.parse(Buffer.from(corpo.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).exp > Date.now(); } catch (e) { return false; }
}
const MAX_TOKENS = 2000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mov-code, x-mov-token');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'Metodo nao permitido' } }); return; }

  const chave = process.env.ANTHROPIC_API_KEY;
  const codigo = process.env.MOV_ACCESS_CODE;
  if (!chave) {
    res.status(500).json({ error: { message: 'Servidor sem configuracao. Avise a coordenacao de manutencao.' } });
    return;
  }
  const okCodigo = !!codigo && (req.headers['x-mov-code'] || '') === codigo;
  if (!okCodigo && !tokenValido(req.headers['x-mov-token'])) {
    res.status(401).json({ error: { message: 'Codigo de acesso invalido. Confira em Configuracoes.' } });
    return;
  }

  try {
    const { system, messages } = req.body || {};
    if (!Array.isArray(messages)) { res.status(400).json({ error: { message: 'Requisicao invalida' } }); return; }
    const corpo = { model: MODELO, max_tokens: MAX_TOKENS, messages };
    if (system) corpo.system = system;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(corpo)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: 'Erro no servidor: ' + e.message } });
  }
}
