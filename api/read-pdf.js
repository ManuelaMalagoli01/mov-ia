// Leitor de PDF usado pelo app grupomov ("Ler PDF").
// Feito para relatórios de atendimento de poucas páginas, não para catálogos ou arquivos compilados.
const MAX_PAGINAS = 20;

function contarPaginas(b64) {
  try {
    const txt = Buffer.from(b64, 'base64').toString('latin1');
    const m = txt.match(/\/Type\s*\/Page(?!s)/g);
    return m ? m.length : 0;
  } catch (e) { return 0; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { pdfBase64, apiKey } = req.body || {};
    if (!pdfBase64) return res.status(400).json({ error: 'pdfBase64 is required' });

    const paginas = contarPaginas(pdfBase64);
    if (paginas > MAX_PAGINAS) {
      return res.status(413).json({ error: `Este PDF tem ${paginas} páginas. O Ler PDF lê um relatório por vez (até ${MAX_PAGINAS} páginas). Separe o relatório do atendimento e envie só ele.` });
    }

    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(500).json({ error: 'API key not configured' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: 'Analise este relatorio de assistencia tecnica e retorne APENAS um JSON valido com: {"numeroRelatorio":"","data":"","cliente":"","patrimonio":"","equipamento":"","tecnico":"","servico":"","descricao":"","pecasUsadas":[],"horasTrabalhadas":"","statusFinal":""}' }
          ]
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const msg = (data && data.error && data.error.message) || '';
      if (/prompt is too long|too many|exceeds|maximum/i.test(msg)) {
        return res.status(413).json({ error: 'PDF grande demais para leitura automática. Envie só o relatório do atendimento (poucas páginas), não o arquivo completo do mês ou um catálogo.' });
      }
      return res.status(response.status).json({ error: msg || 'Erro ao ler o PDF.' });
    }
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
