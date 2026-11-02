// MOV IA - acesso aos catalogos e planilhas (Supabase).
// Leitura: exige MOV_ACCESS_CODE. Escrita: exige MOV_ADMIN_CODE.
// Variaveis no Vercel: SUPABASE_URL, SUPABASE_SERVICE_KEY, MOV_ACCESS_CODE, MOV_ADMIN_CODE.
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const BUCKET = 'catalogos';

function headersSb(extra) {
  const k = process.env.SUPABASE_SERVICE_KEY;
  const h = { apikey: k, 'Content-Type': 'application/json' };
  if (!k.startsWith('sb_')) h.Authorization = 'Bearer ' + k;
  return Object.assign(h, extra || {});
}
const base = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');

async function rest(path, opts) {
  const r = await fetch(base() + '/rest/v1/' + path, Object.assign({}, opts, { headers: headersSb(opts && opts.headers) }));
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error((d && (d.message || d.error)) || ('Erro ' + r.status));
  return d;
}
async function storage(path, body, method) {
  const r = await fetch(base() + '/storage/v1/' + path, { method: method || 'POST', headers: headersSb(), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error((d && (d.message || d.error)) || ('Erro storage ' + r.status));
  return d;
}

// termos seguros para o filtro do PostgREST
function termos(q) {
  return String(q || '').toLowerCase()
    .replace(/[^0-9a-zà-ÿ\-\. ]/gi, ' ')
    .split(/\s+/).map(t => t.replace(/^[\-\.]+|[\-\.]+$/g, ''))
    .filter(t => t.length >= 2).slice(0, 6);
}
function trecho(texto, ts) {
  const low = (texto || '').toLowerCase();
  let pos = -1;
  for (const t of ts) { pos = low.indexOf(t); if (pos >= 0) break; }
  if (pos < 0) pos = 0;
  const ini = Math.max(0, pos - 120), fim = Math.min(texto.length, pos + 220);
  return (ini > 0 ? '…' : '') + texto.slice(ini, fim).replace(/\s+/g, ' ') + (fim < texto.length ? '…' : '');
}
function filtroAnd(campo, ts) {
  return 'and=(' + ts.map(t => `${campo}.ilike.*${t}*`).join(',') + ')';
}

// lista completa da escala, paginando de 1000 em 1000
async function escalaTodos(filtro) {
  const cols = 'id,chave,linha,data,data_original,equipe,empresa,cidade,pat,equipamento,lider,executor,tipo,status,data_realizada,horimetro,relatorio,obs,atualizado_por,atualizado_em';
  const temSelect = /(^|&)select=/.test(filtro);
  let out = [];
  for (let ini = 0; ; ini += 1000) {
    const q = 'escala_preventivas?' + (temSelect ? '' : 'select=' + cols + '&') + filtro;
    const lote = await rest(q, { headers: { Range: `${ini}-${ini + 999}`, 'Range-Unit': 'items' } });
    out = out.concat(lote || []);
    if (!lote || lote.length < 1000) break;
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    res.status(500).json({ erro: 'Servidor sem configuracao do banco. Avise a coordenacao.' }); return;
  }
  const codigo = req.headers['x-mov-code'] || '';
  const admin = req.headers['x-mov-admin'] || '';
  const ehAdmin = !!process.env.MOV_ADMIN_CODE && admin === process.env.MOV_ADMIN_CODE;
  if (!ehAdmin && codigo !== process.env.MOV_ACCESS_CODE) { res.status(401).json({ erro: 'Codigo de acesso invalido.' }); return; }

  const b = req.method === 'POST' ? (req.body || {}) : {};
  let autor = ''; try { autor = decodeURIComponent(req.headers['x-mov-user'] || '').slice(0, 60); } catch (e) {}
  const acao = (req.query.acao || b.acao || '').toString();
  const precisaAdmin = ['importar_escala', 'decidir_escala', 'salvar_escala', 'excluir_escala']; // o resto e liberado para quem tem o codigo de acesso
  if (precisaAdmin.includes(acao) && !ehAdmin) { res.status(403).json({ erro: 'Somente administrador.' }); return; }

  try {
    switch (acao) {
      case 'verificar_admin':
        res.json({ ok: ehAdmin }); return;

      case 'listar': {
        const cats = await rest('catalogos?select=id,titulo,marca,modelo,paginas,sem_texto,criado_em,autor&order=marca.asc,titulo.asc');
        const plans = await rest('planilhas?select=id,titulo,tipo,colunas,linhas,criado_em,autor&order=criado_em.desc');
        res.json({ catalogos: cats, planilhas: plans }); return;
      }

      case 'buscar': {
        const ts = termos(req.query.q || b.q);
        if (!ts.length) { res.json({ catalogos: [], planilhas: [] }); return; }
        const lim = Math.min(parseInt(req.query.limite || b.limite || 40, 10), 80);
        const pags = await rest(`catalogo_paginas?select=catalogo_id,pagina,texto,catalogos(titulo,marca,modelo)&${filtroAnd('texto', ts)}&order=catalogo_id,pagina&limit=${lim}`);
        const lins = await rest(`planilha_linhas?select=planilha_id,ordem,dados,planilhas(titulo,tipo,colunas)&${filtroAnd('texto', ts)}&order=planilha_id,ordem&limit=${lim}`);
        res.json({
          termos: ts,
          catalogos: pags.map(p => ({ catalogo_id: p.catalogo_id, pagina: p.pagina, trecho: trecho(p.texto || '', ts), catalogo: p.catalogos })),
          planilhas: lins
        }); return;
      }

      case 'linhas_planilha': {
        const id = (req.query.id || '').replace(/[^0-9a-f\-]/gi, '');
        const off = parseInt(req.query.offset || 0, 10) || 0;
        const d = await rest(`planilha_linhas?select=ordem,dados&planilha_id=eq.${id}&order=ordem&limit=500&offset=${off}`);
        res.json({ linhas: d }); return;
      }

      case 'abrir_catalogo': {
        const id = (req.query.id || '').replace(/[^0-9a-f\-]/gi, '');
        const c = await rest(`catalogos?select=arquivo,titulo&id=eq.${id}`);
        if (!c.length) throw new Error('Catalogo nao encontrado');
        const s = await storage(`object/sign/${BUCKET}/${encodeURI(c[0].arquivo)}`, { expiresIn: 3600 });
        res.json({ url: base() + '/storage/v1' + s.signedURL, titulo: c[0].titulo }); return;
      }

      case 'upload_url': {
        const nome = String(b.nome || 'catalogo.pdf').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9\.\-_]/g, '_');
        const caminho = Date.now() + '_' + nome;
        const s = await storage(`object/upload/sign/${BUCKET}/${caminho}`, {});
        res.json({ caminho, url: base() + '/storage/v1' + s.url }); return;
      }

      case 'criar_catalogo': {
        const row = { titulo: b.titulo, marca: b.marca || null, modelo: b.modelo || null, arquivo: b.caminho, paginas: b.paginas || 0, sem_texto: !!b.sem_texto, autor: autor || null };
        const d = await rest('catalogos', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } });
        res.json({ id: d[0].id }); return;
      }

      case 'paginas': {
        const rows = (b.paginas || []).map(p => ({ catalogo_id: b.id, pagina: p.pagina, texto: String(p.texto || '').slice(0, 20000) }));
        if (rows.length) await rest('catalogo_paginas', { method: 'POST', body: JSON.stringify(rows) });
        res.json({ ok: true, n: rows.length }); return;
      }

      case 'excluir_catalogo': {
        const id = String(b.id || '').replace(/[^0-9a-f\-]/gi, '');
        const c = await rest(`catalogos?select=arquivo&id=eq.${id}`);
        await rest(`catalogos?id=eq.${id}`, { method: 'DELETE' });
        if (c.length) { try { await storage(`object/${BUCKET}`, { prefixes: [c[0].arquivo] }, 'DELETE'); } catch (e) {} }
        res.json({ ok: true }); return;
      }

      case 'criar_planilha': {
        const row = { titulo: b.titulo, tipo: b.tipo || 'Outros', colunas: b.colunas || [], linhas: b.linhas || 0, autor: autor || null };
        const d = await rest('planilhas', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } });
        res.json({ id: d[0].id }); return;
      }

      case 'linhas': {
        const rows = (b.linhas || []).map(l => ({ planilha_id: b.id, ordem: l.ordem, dados: l.dados, texto: Object.values(l.dados || {}).join(' | ').slice(0, 8000) }));
        if (rows.length) await rest('planilha_linhas', { method: 'POST', body: JSON.stringify(rows) });
        res.json({ ok: true, n: rows.length }); return;
      }

      case 'excluir_planilha': {
        const id = String(b.id || '').replace(/[^0-9a-f\-]/gi, '');
        await rest(`planilhas?id=eq.${id}`, { method: 'DELETE' });
        res.json({ ok: true }); return;
      }

      case 'buscar_pecas': {
        const ts = termos(req.query.q || b.q);
        if (!ts.length) { res.json({ termos: [], pecas: [], catalogos: [] }); return; }
        const lins = await rest(`planilha_linhas?select=planilha_id,ordem,dados,planilhas!inner(titulo,tipo)&planilhas.tipo=eq.Pe%C3%A7as&${filtroAnd('texto', ts)}&order=planilha_id,ordem&limit=120`);
        const pags = await rest(`catalogo_paginas?select=catalogo_id,pagina,texto,catalogos(titulo,marca,modelo)&${filtroAnd('texto', ts)}&order=catalogo_id,pagina&limit=20`);
        res.json({
          termos: ts, pecas: lins,
          catalogos: pags.map(p => ({ catalogo_id: p.catalogo_id, pagina: p.pagina, trecho: trecho(p.texto || '', ts), catalogo: p.catalogos }))
        }); return;
      }

      case 'adicionar_peca': {
        const dados = {};
        Object.keys(b.dados || {}).forEach(k => { const v = String(b.dados[k] || '').trim(); if (v) dados[k] = v; });
        if (!Object.keys(dados).length) throw new Error('Preencha pelo menos um campo.');
        if (autor) dados['Cadastrado por'] = autor;
        const TIT = 'Peças cadastradas manualmente';
        let pl = await rest(`planilhas?select=id,linhas&titulo=eq.${encodeURIComponent(TIT)}&tipo=eq.Pe%C3%A7as&limit=1`);
        if (!pl.length) pl = await rest('planilhas', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ titulo: TIT, tipo: 'Peças', colunas: ['Código interno', 'Código fabricante', 'Descrição', 'Marca', 'Modelo / aplicação', 'Localização', 'Observação'], linhas: 0 }) });
        const n = (pl[0].linhas || 0) + 1;
        await rest('planilha_linhas', { method: 'POST', body: JSON.stringify([{ planilha_id: pl[0].id, ordem: n, dados, texto: Object.values(dados).join(' | ') }]) });
        await rest(`planilhas?id=eq.${pl[0].id}`, { method: 'PATCH', body: JSON.stringify({ linhas: n }) });
        res.json({ ok: true }); return;
      }

      case 'planos': {
        const d = await rest('planos_preventiva?select=id,marca,modelo,fonte,obs,intervalos,atualizado_em,autor&order=marca.asc,modelo.asc');
        res.json({ planos: d }); return;
      }

      case 'salvar_plano': {
        const ints = (b.intervalos || []).map(i => ({ horas: parseInt(i.horas, 10), itens: (i.itens || []).map(x => String(x).trim()).filter(Boolean) }))
          .filter(i => i.horas > 0 && i.itens.length).sort((x, y) => x.horas - y.horas);
        if (!b.modelo || !ints.length) throw new Error('Informe o modelo e pelo menos um intervalo com itens.');
        const row = { marca: b.marca || null, modelo: b.modelo, fonte: b.fonte || null, obs: b.obs || null, intervalos: ints, atualizado_em: new Date().toISOString(), autor: autor || null };
        const id = String(b.id || '').replace(/[^0-9a-f\-]/gi, '');
        if (id) await rest(`planos_preventiva?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(row) });
        else await rest('planos_preventiva', { method: 'POST', body: JSON.stringify(row) });
        res.json({ ok: true }); return;
      }

      case 'excluir_plano': {
        const id = String(b.id || '').replace(/[^0-9a-f\-]/gi, '');
        await rest(`planos_preventiva?id=eq.${id}`, { method: 'DELETE' });
        res.json({ ok: true }); return;
      }

      // ---------- ESCALA DE PREVENTIVAS ----------
      case 'escala': {
        const de = String(req.query.de || '').slice(0, 10), ate = String(req.query.ate || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw new Error('Período inválido.');
        const itens = await escalaTodos(`data=gte.${de}&data=lte.${ate}&order=data.asc,empresa.asc`);
        res.json({ itens }); return;
      }
      case 'escala_pendentes': {
        const itens = await escalaTodos(`status=in.(${encodeURIComponent('"Pendente execução","Não realizada"')})&order=data.asc`);
        res.json({ itens }); return;
      }
      case 'baixa_escala': {
        const id = String(b.id || '').replace(/[^0-9a-f\-]/gi, '');
        const atual = (await rest(`escala_preventivas?select=id,status,lider,executor&id=eq.${id}`))[0];
        if (!atual) throw new Error('Atendimento não encontrado.');
        if (!ehAdmin) {
          if (atual.status === 'Cancelada') throw new Error('Atendimento cancelado pela coordenação.');
          if (atual.status === 'Realizada' || atual.status === 'Não realizada') throw new Error('A baixa já foi registrada. Para corrigir, fale com a coordenação.');
          const nz = t => String(t || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
          if (!autor || ![atual.lider, atual.executor].some(n => n && nz(n) === nz(autor)))
            throw new Error(`Esse atendimento é de ${[atual.lider, atual.executor].filter(Boolean).join(' e ')}. Confira se seu nome em Configurações está igual ao da escala.`);
        }
        const st = String(b.status || '');
        const row = { atualizado_em: new Date().toISOString(), atualizado_por: autor || null, obs: String(b.obs || '').slice(0, 500) || null };
        if (st === 'Realizada') {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.data_realizada || ''))) throw new Error('Informe a data em que foi feita.');
          Object.assign(row, { status: 'Realizada', data_realizada: b.data_realizada, horimetro: String(b.horimetro || '').slice(0, 30) || null, relatorio: String(b.relatorio || '').slice(0, 30) || null });
        } else if (st === 'Não realizada') {
          if (!row.obs) throw new Error('Informe o motivo.');
          Object.assign(row, { status: 'Não realizada', data_realizada: null });
        } else throw new Error('Status inválido.');
        await rest(`escala_preventivas?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(row) });
        res.json({ ok: true }); return;
      }
      case 'decidir_escala': {
        const id = String(b.id || '').replace(/[^0-9a-f\-]/gi, '');
        const atual = (await rest(`escala_preventivas?select=id,data,data_original&id=eq.${id}`))[0];
        if (!atual) throw new Error('Atendimento não encontrado.');
        const st = String(b.status || '');
        if (!['Pendente execução', 'Cancelada', 'Programada'].includes(st)) throw new Error('Decisão inválida.');
        const row = { status: st, atualizado_em: new Date().toISOString(), atualizado_por: (autor || 'Coordenação') + ' (coordenação)' };
        if (st !== 'Cancelada' && st !== 'Programada') row.data_realizada = null;
        if (st === 'Programada') row.data_realizada = null;
        if (b.obs !== undefined && String(b.obs).trim()) row.obs = String(b.obs).slice(0, 500);
        const nova = String(b.nova_data || '');
        if (nova) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(nova)) throw new Error('Nova data inválida.');
          if (nova !== atual.data) { row.data = nova; if (!atual.data_original) row.data_original = atual.data; }
        }
        await rest(`escala_preventivas?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(row) });
        res.json({ ok: true }); return;
      }
      case 'importar_escala': {
        // o app é o oficial: a planilha só acrescenta atendimentos que ainda não existem.
        const linhas = (b.linhas || []).filter(l => l && l.chave && /^\d{4}-\d{2}-\d{2}$/.test(String(l.data || '')));
        if (!linhas.length) throw new Error('Nenhuma linha válida.');
        const txt = (v, n) => { const t = String(v == null ? '' : v).trim(); return t ? t.slice(0, n || 200) : null; };
        const existentes = await escalaTodos('select=id,chave');
        const tem = new Set(existentes.map(e => e.chave));
        const agora = new Date().toISOString();
        const novos = linhas.filter(l => !tem.has(l.chave)).map(l => ({
          chave: l.chave, linha: Number.isInteger(l.linha) ? l.linha : null, data: l.data, equipe: txt(l.equipe, 20), empresa: txt(l.empresa), cidade: txt(l.cidade, 80),
          pat: txt(l.pat, 40), equipamento: txt(l.equipamento, 120), lider: txt(l.lider, 80), executor: txt(l.executor, 80), tipo: txt(l.tipo, 80),
          status: txt(l.status, 40) || 'Programada', data_realizada: /^\d{4}-\d{2}-\d{2}$/.test(String(l.data_realizada || '')) ? l.data_realizada : null,
          horimetro: txt(l.horimetro, 30), relatorio: txt(l.relatorio, 30), obs: txt(l.obs, 500), atualizado_em: agora, atualizado_por: 'Importação ' + (autor || '') }));
        for (let i = 0; i < novos.length; i += 400) await rest('escala_preventivas', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(novos.slice(i, i + 400)) });
        res.json({ ok: true, novos: novos.length, ignorados: linhas.length - novos.length }); return;
      }
      case 'salvar_escala': {
        const txt = (v, n) => { const t = String(v == null ? '' : v).trim(); return t ? t.slice(0, n || 200) : null; };
        const data = String(b.data || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data.');
        if (!txt(b.empresa)) throw new Error('Informe o cliente.');
        if (!txt(b.lider)) throw new Error('Informe o técnico líder.');
        const row = { data, equipe: txt(b.equipe, 20), empresa: txt(b.empresa), cidade: txt(b.cidade, 80), pat: txt(b.pat, 40), equipamento: txt(b.equipamento, 120),
          lider: txt(b.lider, 80), executor: txt(b.executor, 80), tipo: txt(b.tipo, 80) || 'Preventiva mensal', obs: txt(b.obs, 500),
          atualizado_em: new Date().toISOString(), atualizado_por: (autor || 'Coordenação') + ' (coordenação)' };
        const id = String(b.id || '').replace(/[^0-9a-f\-]/gi, '');
        if (id) {
          const atual = (await rest(`escala_preventivas?select=id,data,data_original,status&id=eq.${id}`))[0];
          if (!atual) throw new Error('Atendimento não encontrado.');
          if (atual.data !== data && !atual.data_original && atual.status !== 'Programada') row.data_original = atual.data;
          await rest(`escala_preventivas?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(row) });
        } else {
          row.chave = 'app-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
          row.status = 'Programada';
          await rest('escala_preventivas', { method: 'POST', body: JSON.stringify(row) });
        }
        res.json({ ok: true }); return;
      }
      case 'excluir_escala': {
        const id = String(b.id || '').replace(/[^0-9a-f\-]/gi, '');
        if (!id) throw new Error('Atendimento inválido.');
        await rest(`escala_preventivas?id=eq.${id}`, { method: 'DELETE' });
        res.json({ ok: true }); return;
      }
      case 'escala_cadastros': {
        // listas para preencher o formulário: clientes, técnicos e o último registro de cada PAT
        const todos = await escalaTodos('select=pat,empresa,cidade,equipamento,equipe,lider,executor,data&order=data.asc');
        const pats = {}, empresas = {}, tecnicos = {}, lideres = {};
        todos.forEach(r => {
          if (r.pat) pats[r.pat] = { empresa: r.empresa, cidade: r.cidade, equipamento: r.equipamento };
          if (r.empresa) empresas[r.empresa] = r.cidade || '';
          if (r.lider) { tecnicos[r.lider] = 1; if (r.equipe) lideres[r.lider] = r.equipe; }
          if (r.executor) tecnicos[r.executor] = 1;
        });
        res.json({ pats, empresas, tecnicos: Object.keys(tecnicos).sort(), lideres }); return;
      }

      default:
        res.status(400).json({ erro: 'Acao desconhecida' });
    }
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
