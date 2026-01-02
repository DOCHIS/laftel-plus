const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// 포함할 파일/폴더
const INCLUDE = [
  'manifest.json',
  'icons',
  'src'
];

// 제외할 파일 패턴
const EXCLUDE = ['.DS_Store', 'Thumbs.db', '.gitkeep'];

function clean() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
    console.log('✓ dist 폴더 삭제됨');
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      if (EXCLUDE.includes(file)) continue;
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function build() {
  // manifest에서 버전 읽기
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const version = manifest.version;
  const zipName = `laftel-plus-${version}.zip`;

  console.log(`\n라프텔 Plus v${version} 빌드 시작...\n`);

  // dist 폴더 정리 및 생성
  clean();
  fs.mkdirSync(DIST, { recursive: true });

  // 파일 복사
  for (const item of INCLUDE) {
    const src = path.join(ROOT, item);
    const dest = path.join(DIST, item);
    if (fs.existsSync(src)) {
      copyRecursive(src, dest);
      console.log(`✓ ${item} 복사됨`);
    }
  }

  // ZIP 생성
  const zipPath = path.join(DIST, zipName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const size = (archive.pointer() / 1024).toFixed(1);
      console.log(`\n✓ ${zipName} 생성됨 (${size} KB)`);
      console.log(`  경로: ${zipPath}\n`);
      resolve();
    });

    archive.on('error', reject);
    archive.pipe(output);

    // 개별 파일/폴더 추가 (zip 자체 제외)
    for (const item of INCLUDE) {
      const itemPath = path.join(DIST, item);
      if (fs.existsSync(itemPath)) {
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          archive.directory(itemPath, item);
        } else {
          archive.file(itemPath, { name: item });
        }
      }
    }

    archive.finalize();
  });
}

// CLI
const args = process.argv.slice(2);
if (args.includes('--clean')) {
  clean();
} else {
  build().catch(err => {
    console.error('빌드 실패:', err);
    process.exit(1);
  });
}
