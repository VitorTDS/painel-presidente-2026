// Baixa as manchetes do Google Notícias de cada candidato e grava noticias.json.
// Roda no GitHub Actions (.github/workflows/noticias.yml); o painel lê o arquivo gerado.
// Uso local: node scripts/noticias.mjs
import { readFile, writeFile } from "node:fs/promises";

// número do candidato no TSE -> termo de busca
const CANDIDATOS = {
  "13": "Lula",
  "22": "\"Flávio Bolsonaro\"",
};
const POR_CANDIDATO = 4;

const urlFeed = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-BR`;

const entidades = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodificar = s => String(s ?? "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(\w+);/g, (m, e) => entidades[e] ?? m)
  .trim();
const tag = (xml, nome) => decodificar((xml.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`)) || [])[1]);

async function baixar(q) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = await fetch(urlFeed(q), { headers: { "User-Agent": "Mozilla/5.0 (painel-presidente-2026)" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const xml = await r.text();
      const itens = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
        const fonte = tag(it, "source");
        let titulo = tag(it, "title");
        // o Google põe " - Fonte" no fim do título
        if (fonte && titulo.endsWith(" - " + fonte)) titulo = titulo.slice(0, -(fonte.length + 3));
        const quando = new Date(tag(it, "pubDate"));
        return { titulo, fonte, link: tag(it, "link"), quando: isNaN(quando) ? null : quando.toISOString() };
      });
      if (!itens.length) throw new Error("sem itens");
      itens.sort((a, b) => (b.quando || "").localeCompare(a.quando || ""));
      return itens.slice(0, POR_CANDIDATO);
    } catch (e) {
      console.error(`${q}: tentativa ${tentativa} falhou (${e.message})`);
      if (tentativa < 3) await new Promise(ok => setTimeout(ok, 3000));
    }
  }
  return null;
}

// se a busca de um candidato falhar, fica com as manchetes da rodada anterior
let anterior = {};
try { anterior = JSON.parse(await readFile("noticias.json", "utf8")).candidatos || {}; } catch { }

const candidatos = {};
let novos = 0;
for (const [n, q] of Object.entries(CANDIDATOS)) {
  const itens = await baixar(q);
  if (itens) { candidatos[n] = itens; novos++; }
  else if (anterior[n]) candidatos[n] = anterior[n];
}
if (!novos) {
  console.error("Nenhuma notícia baixada; mantendo o noticias.json anterior.");
  process.exit(1);
}
await writeFile("noticias.json", JSON.stringify({ atualizado: new Date().toISOString(), candidatos }, null, 2) + "\n");
console.log("noticias.json:", Object.entries(candidatos).map(([n, l]) => `${n}=${l.length}`).join(" "));
