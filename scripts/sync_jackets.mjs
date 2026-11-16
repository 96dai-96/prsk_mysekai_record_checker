/**
 * allRecords.ts 内の外部ジャケット画像URL（pjsekai.com 等）を
 * public/assets/jackets/ 配下へダウンロード保存し、
 * allRecords.ts の参照パスをローカルアセット（/assets/jackets/...）へ置換するスクリプト。
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALL_RECORDS_PATH = path.join(__dirname, '..', 'src', 'data', 'allRecords.ts');
const JACKETS_DIR = path.join(__dirname, '..', 'public', 'assets', 'jackets');
const URL_MAP_PATH = path.join(__dirname, 'jacket_url_map.json');

const CONCURRENCY = 6;
const MAX_RETRIES = 3;

/**
 * URL と Content-Type から適切な画像拡張子を判定する
 * @param {string} url
 * @param {string | null} contentType
 * @returns {string}
 */
function detectExtension(url, contentType) {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes('image/png')) return '.png';
    if (ct.includes('image/webp')) return '.webp';
    if (ct.includes('image/gif')) return '.gif';
    if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return '.jpg';
  }
  try {
    const u = new URL(url);
    const srcParam = u.searchParams.get('src') || u.pathname;
    const ext = path.extname(srcParam).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
  } catch {
    // ignore
  }
  return '.jpg';
}

/**
 * URL から一意で安全なハッシュベース名を生成する
 * @param {string} url
 * @returns {string}
 */
function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/**
 * 既存のファイルが public/assets/jackets に存在するか探す
 * @param {string} hash
 * @returns {string | null} ファイル名（見つからない場合は null）
 */
function findExistingByHash(hash) {
  for (const ext of ['.jpg', '.png', '.webp', '.gif']) {
    const fileName = `${hash}${ext}`;
    if (fs.existsSync(path.join(JACKETS_DIR, fileName))) {
      return fileName;
    }
  }
  return null;
}

/**
 * 指定 URL の画像をダウンロードして保存する（リトライ付き）
 * @param {string} url
 * @returns {Promise<string>} 保存したローカルパス (/assets/jackets/...)
 */
async function downloadJacket(url) {
  const hash = hashUrl(url);
  const existing = findExistingByHash(hash);
  if (existing) {
    return `/assets/jackets/${existing}`;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RecordCheckerBot/1.0)',
          Accept: 'image/*,*/*;q=0.8',
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const contentType = res.headers.get('content-type');
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 100) {
        throw new Error(`画像サイズが小さすぎます (${buffer.length} bytes)`);
      }
      if (contentType && contentType.toLowerCase().includes('text/html')) {
        throw new Error(`HTMLレスポンスを受信しました (${contentType})`);
      }

      const ext = detectExtension(url, contentType);
      const fileName = `${hash}${ext}`;
      fs.writeFileSync(path.join(JACKETS_DIR, fileName), buffer);
      return `/assets/jackets/${fileName}`;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw new Error(`ジャケット取得失敗 (${url}): ${lastError?.message}`);
}

/**
 * 並列数を制限してタスクを実行する
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function main() {
  if (!fs.existsSync(ALL_RECORDS_PATH)) {
    throw new Error(`allRecords.ts が見つかりません: ${ALL_RECORDS_PATH}`);
  }
  fs.mkdirSync(JACKETS_DIR, { recursive: true });

  const content = fs.readFileSync(ALL_RECORDS_PATH, 'utf8');
  const match = content.match(/^([\s\S]*?export const ALL_RECORDS: RecordItem\[\] = )(\[[\s\S]*\])(;\s*)$/);
  if (!match) {
    throw new Error('allRecords.ts から ALL_RECORDS 配列を抽出できませんでした。');
  }

  const prefix = match[1];
  const records = JSON.parse(match[2]);
  const suffix = match[3];

  /** @type {Record<string, string>} */
  let urlMap = {};
  if (fs.existsSync(URL_MAP_PATH)) {
    try {
      urlMap = JSON.parse(fs.readFileSync(URL_MAP_PATH, 'utf8'));
    } catch {
      urlMap = {};
    }
  }

  // 外部URL（http:// または https://）を収集
  const externalUrls = new Set();
  for (const rec of records) {
    if (rec.jacketUrl && /^https?:\/\//.test(rec.jacketUrl)) externalUrls.add(rec.jacketUrl);
    if (rec.jacketUrlVs && /^https?:\/\//.test(rec.jacketUrlVs)) externalUrls.add(rec.jacketUrlVs);
    if (rec.jacketUrlSekai && /^https?:\/\//.test(rec.jacketUrlSekai)) externalUrls.add(rec.jacketUrlSekai);
    if (Array.isArray(rec.jackets)) {
      for (const j of rec.jackets) {
        if (j?.url && /^https?:\/\//.test(j.url)) externalUrls.add(j.url);
      }
    }
  }

  const urlList = Array.from(externalUrls);
  console.log(`対象となる外部ジャケットURL数: ${urlList.length}件`);

  if (urlList.length > 0) {
    let completed = 0;
    let failed = 0;

    await mapWithConcurrency(urlList, CONCURRENCY, async (url) => {
      // マップに登録済みかつ実ファイルが存在する場合はそのまま利用
      if (urlMap[url]) {
        const mappedFile = path.join(__dirname, '..', 'public', urlMap[url].replace(/^\//, ''));
        if (fs.existsSync(mappedFile)) {
          completed++;
          return;
        }
      }

      try {
        const localPath = await downloadJacket(url);
        urlMap[url] = localPath;
        completed++;
        if (completed % 50 === 0 || completed === urlList.length) {
          console.log(`進捗: ${completed} / ${urlList.length} 件完了`);
        }
      } catch (err) {
        failed++;
        console.error(`⚠ ${err.message}`);
      }
    });

    if (failed > 0) {
      console.warn(`⚠ ${failed}件のジャケット画像取得に失敗しました。`);
    }
  }

  // URLマップを保存
  fs.writeFileSync(URL_MAP_PATH, JSON.stringify(urlMap, null, 2) + '\n', 'utf8');

  // allRecords.ts の各ジャケットURLをローカルパスへ置換
  let replacedFields = 0;
  for (const rec of records) {
    if (rec.jacketUrl && urlMap[rec.jacketUrl]) {
      rec.jacketUrl = urlMap[rec.jacketUrl];
      replacedFields++;
    }
    if (rec.jacketUrlVs && urlMap[rec.jacketUrlVs]) {
      rec.jacketUrlVs = urlMap[rec.jacketUrlVs];
      replacedFields++;
    }
    if (rec.jacketUrlSekai && urlMap[rec.jacketUrlSekai]) {
      rec.jacketUrlSekai = urlMap[rec.jacketUrlSekai];
      replacedFields++;
    }
    if (Array.isArray(rec.jackets)) {
      for (const j of rec.jackets) {
        if (j?.url && urlMap[j.url]) {
          j.url = urlMap[j.url];
          replacedFields++;
        }
      }
    }
  }

  const updatedContent = `${prefix}${JSON.stringify(records, null, 2)}${suffix}`;
  fs.writeFileSync(ALL_RECORDS_PATH, updatedContent, 'utf8');
  console.log(`✔ allRecords.ts 内の ${replacedFields} 箇所をローカルアセットパスへ更新しました。`);
}

main().catch((err) => {
  console.error('ジャケット同期エラー:', err);
  process.exit(1);
});
