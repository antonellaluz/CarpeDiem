/*
  CARPE DIEM — verificador do projeto (não altera nada, só lê).
  Uso, na raiz do repositório:   node verificar.js
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = process.cwd();
const SRC = fs.existsSync(path.join(RAIZ, "src")) ? path.join(RAIZ, "src") : RAIZ;

let erros = 0;
let avisos = 0;

const erro = t => { erros++; console.log("❌ " + t); };
const aviso = t => { avisos++; console.log("⚠️  " + t); };
const ok = t => console.log("✅ " + t);

const IGNORAR = new Set([".git", "node_modules"]);

function listar(dir) {
  let saida = [];

  for (const nome of fs.readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue;

    const p = path.join(dir, nome);
    const st = fs.statSync(p);

    if (st.isDirectory()) saida = saida.concat(listar(p));
    else saida.push({ p, tamanho: st.size });
  }

  return saida;
}

const rel = p => path.relative(RAIZ, p).split(path.sep).join("/");
const ler = p => fs.readFileSync(p, "utf8");

const arquivos = listar(RAIZ);
const textos = arquivos.filter(a => /\.(js|html|css|json|md|ts|py|txt|sql|yml|yaml)$/i.test(a.p) || /(^|\/)\.env/.test(rel(a.p)));

console.log(`\nVerificando: ${RAIZ}\nPasta do site: ${rel(SRC) || "."}\n`);

// 1. Arquivos que o site precisa ter
console.log("— Arquivos necessários —");

const obrigatorios = [
  "welcome.html", "users_info.html", "cronograma-pronto.html", "escolher-vestibular.html",
  "index.html", "calendario.html", "adicionar_tarefa.html", "formulario.html", "perfil.html",
  "regras.js", "planos.js", "calendario.js", "perfil.js", "notificacoes.js", "service-worker.js",
  "ui.js", "frases.js", "manifest.json", "style.css", "calendario.css", "perfil.css", "formulario.css",
  "img/logo.png", "img/logo_minus.png", "img/icon-192.png", "img/icon-512.png", "img/badge-96.png"
];

let faltando = 0;

obrigatorios.forEach(f => {
  if (!fs.existsSync(path.join(SRC, f))) { erro(`Falta o arquivo: ${f}`); faltando++; }
});

if (!faltando) ok("Todos os arquivos necessários existem.");

// 2. Arquivos grandes ou que não devem subir
console.log("\n— Arquivos que não devem subir —");

let proibidos = 0;

arquivos.forEach(a => {
  const r = rel(a.p);
  const mb = a.tamanho / 1048576;

  if (mb >= 100) { erro(`${r} tem ${mb.toFixed(0)} MB. O GitHub bloqueia arquivos acima de 100 MB.`); proibidos++; }
  else if (mb >= 25) { aviso(`${r} tem ${mb.toFixed(0)} MB. Confira se precisa mesmo subir.`); proibidos++; }

  if (/\.(zip|csv)$/i.test(r) && a.tamanho > 1048576) { aviso(`${r}: dados/pacotes grandes costumam ficar fora do repositório.`); proibidos++; }
  if (/(^|\/)\.env/.test(r)) { erro(`${r}: arquivo .env nunca deve subir.`); proibidos++; }
});

if (!proibidos) ok("Nenhum arquivo grande ou sensível.");

// 3. Segredos no código
console.log("\n— Segredos no código —");

let segredos = 0;

function papelDoJWT(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return payload.role || "";
  } catch { return ""; }
}

textos.filter(a => !/(^|\/)verificar\.js$/.test(rel(a.p))).forEach(a => {
  const texto = ler(a.p);
  const r = rel(a.p);

  (texto.match(/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/g) || []).forEach(jwt => {
    if (papelDoJWT(jwt) === "service_role") { erro(`${r}: contém uma chave service_role. Troque a chave no Supabase e remova do código.`); segredos++; }
  });

  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(texto)) { erro(`${r}: contém uma chave sb_secret (privada).`); segredos++; }
  if (/VAPID_PRIVATE_KEY\s*[=:]\s*["'`][A-Za-z0-9_-]{20,}/.test(texto)) { erro(`${r}: contém a chave privada VAPID.`); segredos++; }
  if (/BRAVE_API_KEY\s*[=:]\s*["'`][^"'`]{10,}/.test(texto)) { erro(`${r}: contém a chave do Brave.`); segredos++; }
  if (texto.includes("hmHiYZPmW8")) { erro(`${r}: contém a chave privada VAPID que foi colada no chat. Gere um par novo.`); segredos++; }
});

if (!segredos) ok("Nenhum segredo encontrado.");

// 4. Sintaxe dos scripts (compila sem executar)
console.log("\n— Sintaxe dos scripts —");

let sintaxe = 0;

function compilar(codigo, nome) {
  try { new vm.Script(codigo, { filename: nome }); }
  catch (e) { erro(`${nome}: erro de sintaxe — ${e.message}`); sintaxe++; }
}

textos.filter(a => /\.js$/i.test(a.p) && !/(^|\/)verificar\.js$/.test(rel(a.p)) && !/supabase\/functions/.test(rel(a.p)))
  .forEach(a => compilar(ler(a.p), rel(a.p)));

textos.filter(a => /\.html$/i.test(a.p)).forEach(a => {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, n = 0;

  while ((m = re.exec(ler(a.p)))) {
    n++;
    if (m[1].trim()) compilar(m[1], `${rel(a.p)} (script ${n})`);
  }
});

if (!sintaxe) ok("Todos os scripts compilam.");

// 5. Páginas: links, ordem dos scripts, `events` duplicado
console.log("\n— Páginas HTML —");

let paginas = 0;

textos.filter(a => /\.html$/i.test(a.p)).forEach(a => {
  const html = ler(a.p);
  const r = rel(a.p);
  const dir = path.dirname(a.p);

  const refs = [];
  let m;

  const reRef = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  while ((m = reRef.exec(html))) refs.push(m[1]);

  const reLoc = /location\.href\s*=\s*["']([^"']+\.html[^"']*)["']/gi;
  while ((m = reLoc.exec(html))) refs.push(m[1]);

  [...new Set(refs)].forEach(ref => {
    if (/^(https?:|\/\/|data:|mailto:|#|javascript:|tel:)/i.test(ref)) return;

    const alvo = ref.split("#")[0].split("?")[0];
    if (!alvo) return;

    if (!fs.existsSync(path.resolve(dir, alvo))) { erro(`${r}: aponta para "${alvo}", que não existe.`); paginas++; }
  });

  const htmlSemComentarios = html.replace(/<!--[\s\S]*?-->/g, "");
const pos = nome => htmlSemComentarios.indexOf(nome);

  if (pos("regras.js") !== -1) {
    if (pos("supabase-js") === -1) { erro(`${r}: usa regras.js mas não carrega o Supabase.`); paginas++; }
    else if (pos("supabase-js") > pos("regras.js")) { erro(`${r}: o Supabase precisa vir ANTES do regras.js.`); paginas++; }
  }

  ["calendario.js", "planos.js", "notificacoes.js", "perfil.js"].forEach(js => {
    if (pos(js) !== -1 && pos("regras.js") === -1) { erro(`${r}: usa ${js} mas não carrega o regras.js.`); paginas++; }
    else if (pos(js) !== -1 && pos(js) < pos("regras.js")) { erro(`${r}: ${js} precisa vir DEPOIS do regras.js.`); paginas++; }
  });

  const usaUi = /\b(avisar|confirmar|toast)\(/.test(html);
  if (usaUi && pos("ui.js") === -1) { aviso(`${r}: usa avisar/confirmar/toast mas não carrega o ui.js.`); paginas++; }
});

textos.filter(a => /\.(js|html)$/i.test(a.p) && !/(^|\/)regras\.js$/.test(rel(a.p)) && !/verificar\.js$/.test(rel(a.p)))
  .forEach(a => {
    if (/\b(let|const|var)\s+events\b/.test(ler(a.p))) { erro(`${rel(a.p)}: declara "events" de novo (já existe no regras.js).`); paginas++; }
    if (/localStorage\.(set|get)Item\(\s*["']carpeDiemEventos["']/.test(ler(a.p))) { aviso(`${rel(a.p)}: usa o armazenamento antigo (carpeDiemEventos). As tarefas agora ficam no Supabase.`); paginas++; }
  });

if (!paginas) ok("Páginas consistentes.");

// 6. .gitignore
console.log("\n— .gitignore —");

const gi = path.join(RAIZ, ".gitignore");

if (!fs.existsSync(gi)) aviso("Não existe .gitignore. Crie um (veja o passo a passo).");
else {
  const c = ler(gi);
  ["node_modules", ".env"].forEach(i => { if (!c.includes(i)) aviso(`.gitignore não ignora "${i}".`); });
  ok(".gitignore encontrado.");
}

console.log(`\nResumo: ${erros} erro(s), ${avisos} aviso(s).`);
console.log(erros ? "Corrija os ❌ antes de subir." : "Sem erros bloqueantes.");
process.exit(erros ? 1 : 0);