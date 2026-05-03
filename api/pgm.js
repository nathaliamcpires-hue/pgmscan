export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { page, bairro } = req.query;

  let url;
  if (bairro) {
    url = `https://leilao.procuradoria.rio/?bairro=${encodeURIComponent(bairro)}`;
  } else {
    url = `https://leilao.procuradoria.rio/?page=${parseInt(page) || 1}`;
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RIOscan/1.0; +https://rioscan.vercel.app)' },
    });
    if (!response.ok) throw new Error(`PGM retornou ${response.status}`);
    const html = await response.text();
    const imoveis = parsePGM(html, parseInt(page) || 0);
    res.status(200).json({ imoveis, total: imoveis.length, source: url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function parsePGM(html, page) {
  const results = [];
  const blocks = html.split(/Endere[çc]o:/i).slice(1);

  for (const bloco of blocks) {
    const inscM = bloco.match(/Inscri[çc][ãa]o Associada:\s*(\d+)/i);
    if (!inscM) continue;
    const valorM = bloco.match(/Valor\*?:\s*R\$\s*([\d.]+(?:,\d+)?)/i);
    if (!valorM) continue;

    const valor = parseFloat(valorM[1].replace(/\./g, '').replace(',', '.'));
    if (!valor || valor <= 0) continue;

    const endStr = bloco.split(/Inscri[çc][ãa]o/i)[0]?.trim() || '';
    const parts  = endStr.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);

    let logradouro = '', numero = '', complemento = '', bairroStr = '';
    if (parts.length === 2)      { [logradouro, numero] = parts; }
    else if (parts.length === 3) { [logradouro, numero, bairroStr] = parts; }
    else if (parts.length >= 4)  { [logradouro, numero, complemento, ...rest] = parts; bairroStr = rest.join(', '); }

    const c = (complemento + logradouro).toUpperCase();
    let tipologia = 'Casa/Terreno';
    if (/APT|APTO|COBERT|PENT/.test(c))  tipologia = 'Apartamento';
    else if (/LOJ/.test(c))              tipologia = 'Loja';
    else if (/SAL/.test(c))              tipologia = 'Sala Comercial';
    else if (/GARAGE|BOX/.test(c))       tipologia = 'Garagem';
    else if (/LOT|LTM|PAL|TERR/.test(c)) tipologia = 'Terreno/Lote';
    else if (/CAS/.test(c))              tipologia = 'Casa';

    results.push({
      inscricao:   inscM[1],
      logradouro:  logradouro.trim(),
      numero:      numero.trim(),
      complemento: complemento.trim(),
      bairro:      bairroStr.trim().toUpperCase(),
      tipologia,
      valor,
      pgm_page:    page,
    });
  }
  return results;
}
