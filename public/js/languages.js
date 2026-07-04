// Maps file names / extensions to Monaco language ids.
// Monaco ships grammars for ~90 languages; this table covers the common ones
// and everything else falls back to plaintext (still fully editable).

const BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  json: 'json', json5: 'json', jsonc: 'json', map: 'json',
  html: 'html', htm: 'html', xhtml: 'html', vue: 'html', svelte: 'html',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  py: 'python', pyw: 'python', pyi: 'python',
  rb: 'ruby', gemspec: 'ruby',
  php: 'php',
  java: 'java', kt: 'kotlin', kts: 'kotlin', groovy: 'java', gradle: 'java', scala: 'scala',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  cs: 'csharp', fs: 'fsharp', vb: 'vb',
  go: 'go', rs: 'rust', swift: 'swift', dart: 'dart', lua: 'lua', r: 'r', jl: 'julia',
  pl: 'perl', pm: 'perl', ex: 'elixir', exs: 'elixir', erl: 'erlang', clj: 'clojure', cljs: 'clojure',
  hs: 'haskell', ml: 'plaintext', nim: 'plaintext', zig: 'plaintext', v: 'plaintext',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ps1: 'powershell', bat: 'bat', cmd: 'bat',
  sql: 'sql', graphql: 'graphql', gql: 'graphql', proto: 'plaintext',
  yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', env: 'ini', properties: 'ini',
  xml: 'xml', svg: 'xml', plist: 'xml', xsl: 'xml', xsd: 'xml',
  dockerfile: 'dockerfile', tf: 'hcl', hcl: 'hcl', tfvars: 'hcl',
  makefile: 'makefile', mk: 'makefile', cmake: 'cmake',
  tex: 'latex', bib: 'latex', rst: 'restructuredtext', asciidoc: 'plaintext', adoc: 'plaintext',
  csv: 'plaintext', tsv: 'plaintext', log: 'plaintext', txt: 'plaintext',
  sol: 'sol', wat: 'wat', wasm: 'plaintext', coffee: 'coffeescript', pug: 'pug', jade: 'pug',
  handlebars: 'handlebars', hbs: 'handlebars', ejs: 'html', razor: 'razor', astro: 'html',
};

const BY_NAME = {
  dockerfile: 'dockerfile', makefile: 'makefile', 'cmakelists.txt': 'cmake',
  '.gitignore': 'ini', '.gitattributes': 'ini', '.editorconfig': 'ini', '.npmrc': 'ini',
  '.env': 'ini', '.bashrc': 'shell', '.zshrc': 'shell', '.profile': 'shell',
  'package.json': 'json', 'tsconfig.json': 'json', '.babelrc': 'json', '.prettierrc': 'json',
  'go.mod': 'plaintext', 'go.sum': 'plaintext', 'cargo.toml': 'ini', 'gemfile': 'ruby',
  'rakefile': 'ruby', 'procfile': 'yaml',
};

export function languageFor(filename) {
  const name = String(filename || '').toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  const base = name.split('/').pop();
  if (BY_NAME[base]) return BY_NAME[base];
  const dot = base.lastIndexOf('.');
  const ext = dot === -1 ? base : base.slice(dot + 1);
  return BY_EXT[ext] || 'plaintext';
}

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'avif', 'tiff',
  'pdf', 'zip', 'gz', 'tar', 'rar', '7z', 'jar', 'war', 'class',
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'wasm', 'obj',
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'avi', 'flac', 'm4a',
  'ttf', 'otf', 'woff', 'woff2', 'eot', 'db', 'sqlite', 'sqlite3', 'lock',
]);

export function isProbablyBinary(filename) {
  const ext = String(filename).toLowerCase().split('.').pop();
  return BINARY_EXT.has(ext);
}

export function isImage(filename) {
  const ext = String(filename).toLowerCase().split('.').pop();
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'avif', 'svg'].includes(ext);
}
