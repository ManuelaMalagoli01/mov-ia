// MOV IA - proxy para a API da Anthropic.
// A chave fica so no Vercel (ANTHROPIC_API_KEY). O tecnico informa apenas o
// codigo de acesso (MOV_ACCESS_CODE), que pode ser trocado a qualquer momento.
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

import crypto from 'crypto';
const MODELO = 'claude-sonnet-4-6';
// aceita o login individual (mesma assinatura do api/dados.js)
function lerToken(tok) {
  const seg = process.env.MOV_SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY || '';
  const [corpo, sig] = String(tok || '').split('.');
  if (!seg || !corpo || !sig) return null;
  const esp = crypto.createHmac('sha256', seg).update(corpo).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (esp.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(esp), Buffer.from(sig))) return null;
  try { const d = JSON.parse(Buffer.from(corpo.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); return d.exp > Date.now() ? d : null; } catch (e) { return null; }
}
// Fase de testes: a IA fica liberada so para a coordenacao (perfil coordenacao ou codigo de administrador).
async function ehCoordenacao(req) {
  const adm = req.headers['x-mov-admin'] || '';
  if (process.env.MOV_ADMIN_CODE && adm === process.env.MOV_ADMIN_CODE) return true;
  const d = lerToken(req.headers['x-mov-token']);
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  if (!d || !url || !key) return false;
  try {
    const id = String(d.u).replace(/[^0-9a-f\-]/gi, '');
    const r = await fetch(`${url}/rest/v1/mov_usuarios?select=perfil,ativo&id=eq.${id}`, { headers: key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: 'Bearer ' + key } });
    const u = (await r.json())[0];
    return !!(u && u.ativo && u.perfil === 'coordenacao');
  } catch (e) { return false; }
}
const MAX_TOKENS = 2000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mov-code, x-mov-token, x-mov-admin');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'Metodo nao permitido' } }); return; }

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    res.status(500).json({ error: { message: 'Servidor sem configuracao. Avise a coordenacao de manutencao.' } });
    return;
  }
  if (!(await ehCoordenacao(req))) {
    res.status(403).json({ error: { message: 'A análise com IA está liberada só para a coordenação nesta fase de testes.' } });
    return;
  }

  try {
    const { system, messages } = req.body || {};
    if (!Array.isArray(messages)) { res.status(400).json({ error: { message: 'Requisicao invalida' } }); return; }
    const tamanho = JSON.stringify({ system: system || '', messages }).length;
    if (tamanho > 1500000) {
      res.status(413).json({ error: { message: 'Consulta grande demais para a IA. Reduza o texto ou avise a coordenação de manutenção.' } });
      return;
    }
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
