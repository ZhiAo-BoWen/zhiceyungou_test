/** 根据文件名返回资源管理器文件图标类型 */
function getFileIconType(filename) {
  const lower = (filename || '').toLowerCase();
  const base = lower.split(/[/\\]/).pop() || lower;

  const special = {
    dockerfile: 'docker',
    makefile: 'make',
    cmake: 'make',
    gemfile: 'ruby',
    rakefile: 'ruby',
    procfile: 'ruby',
    vagrantfile: 'ruby',
    gradle: 'java',
    'package.json': 'json',
    'package-lock.json': 'json',
    'tsconfig.json': 'ts',
    'composer.json': 'php',
    requirements: 'py',
    pipfile: 'py',
    'cargo.toml': 'rust',
    'go.mod': 'go',
    'go.sum': 'go',
    readme: 'md',
    license: 'txt',
    '.gitignore': 'git',
    '.env': 'env',
    '.env.example': 'env',
  };
  if (special[base]) return special[base];
  if (base.startsWith('readme')) return 'md';
  if (base.startsWith('license')) return 'txt';
  if (base.startsWith('requirements')) return 'py';

  let ext = base.includes('.') ? base.split('.').pop() : '';
  if (base.endsWith('.d.ts')) return 'ts';
  if (base.endsWith('.test.js') || base.endsWith('.spec.js')) return 'js';
  if (base.endsWith('.test.ts') || base.endsWith('.spec.ts')) return 'ts';

  const map = {
    py: 'py', pyw: 'py', ipynb: 'py',
    java: 'java', class: 'java', jar: 'java', kotlin: 'kt', kt: 'kt', kts: 'kt',
    js: 'js', mjs: 'js', cjs: 'js',
    ts: 'ts', mts: 'ts', cts: 'ts',
    jsx: 'jsx', tsx: 'tsx',
    vue: 'vue', svelte: 'svelte',
    json: 'json', jsonc: 'json', json5: 'json',
    html: 'html', htm: 'html', xhtml: 'html',
    css: 'css', scss: 'scss', sass: 'scss', less: 'less',
    md: 'md', markdown: 'md',
    xml: 'xml', xsd: 'xml', xsl: 'xml', xslt: 'xml', svg: 'svg',
    yml: 'yaml', yaml: 'yaml',
    sql: 'sql', mysql: 'sql', pgsql: 'sql',
    go: 'go',
    rs: 'rust',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
    cs: 'cs',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
    ps1: 'ps', psm1: 'ps', bat: 'ps', cmd: 'ps',
    dockerfile: 'docker',
    toml: 'toml', ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'ini',
    txt: 'txt', log: 'txt',
    pdf: 'pdf',
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
    bmp: 'image', ico: 'image', icns: 'image',
    zip: 'zip', tar: 'zip', gz: 'zip', rar: 'zip', '7z': 'zip',
    wasm: 'wasm',
    lua: 'lua',
    r: 'r',
    scala: 'scala',
    dart: 'dart',
    ex: 'elixir', exs: 'elixir',
    erl: 'erl', hrl: 'erl',
    clj: 'clj', cljs: 'clj',
    hs: 'hs',
    tf: 'terraform', tfvars: 'terraform',
    proto: 'proto',
    graphql: 'graphql', gql: 'graphql',
    lock: 'lock',
  };

  return map[ext] || 'default';
}

function fileIconClass(filename, isFolder, isOpen) {
  if (isFolder) return isOpen ? 'folder-open' : 'folder';
  return `file-type file-${getFileIconType(filename)}`;
}
