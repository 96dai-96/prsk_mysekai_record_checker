import type {
  RecordItem,
  SortType,
  SortDirection,
  FilterOptions,
  SavedCompareCondition,
} from '../types/record';
import { ALL_RECORDS } from '../data/allRecords';
import defaultDataSnapshots from '../data/dataSnapshots.json';

/**
 * 達成率・所持率の計算結果
 */
export interface ProgressResult {
  total: number;
  owned: number;
  percentage: number;
  percentageString: string;
}

/**
 * 全体または指定リストの所持率を計算する
 */
export const calculateProgress = (
  records: RecordItem[],
  ownedRecordIds: Record<string, boolean>
): ProgressResult => {
  const total = records.length;
  if (total === 0) {
    return { total: 0, owned: 0, percentage: 0, percentageString: '0.0' };
  }
  const owned = records.filter((r) => !!ownedRecordIds[r.id]).length;
  const percentage = (owned / total) * 100;
  return {
    total,
    owned,
    percentage,
    percentageString: percentage.toFixed(1),
  };
};

/**
 * プロセカの周年（9月30日）を基準とした「○年目」を計算する
 * 1年目: 2020-09-30 〜 2021-09-29
 * 2年目: 2021-09-30 〜 2022-09-29 ...
 */
export const getAnniversaryYear = (dateStr: string): number => {
  const parts = dateStr.split('-');
  if (parts.length < 3) return 1;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);

  const isAfterSep30 = m > 9 || (m === 9 && d >= 30);
  const annivYear = isAfterSep30 ? y - 2020 + 1 : y - 2020;
  return Math.max(1, annivYear);
};

/**
 * レコードのフィルタリングとソート処理
 */
const ALL_UNIT_KEYS: RecordItem['unit'][] = [
  'virtual_singer',
  'leo_need',
  'more_more_jump',
  'vivid_bad_squad',
  'wonderlands_showtime',
  'nightcord_at_25',
  'other',
];

export const filterAndSortRecords = (
  records: RecordItem[],
  ownedRecordIds: Record<string, boolean>,
  sortType: SortType,
  sortDirection: SortDirection,
  filterOptions: FilterOptions
): RecordItem[] => {
  const isAllUnitsSelected =
    filterOptions.units.length === ALL_UNIT_KEYS.length &&
    ALL_UNIT_KEYS.every((u) => filterOptions.units.includes(u));
  const unitMatchMode = filterOptions.unitMatchType || 'or';
  const charMatchMode = filterOptions.characterMatchType || 'or';
  const vocalMatchMode = filterOptions.vocalMatchType || 'or';

  // 選択されている歌唱バージョンキーの抽出
  const selectedVocals: ('sekai' | 'virtualSinger' | 'connectLive' | 'anotherVocal' | 'inst')[] = [];
  if (filterOptions.vocalVersions.sekai) selectedVocals.push('sekai');
  if (filterOptions.vocalVersions.virtualSinger) selectedVocals.push('virtualSinger');
  if (filterOptions.vocalVersions.connectLive) selectedVocals.push('connectLive');
  if (filterOptions.vocalVersions.anotherVocal) selectedVocals.push('anotherVocal');
  if (filterOptions.vocalVersions.inst) selectedVocals.push('inst');

  return records
    .filter((record) => {
      const isOwned = !!ownedRecordIds[record.id];

      // 1. 所持ステータス絞り込み
      if (filterOptions.ownership === 'owned' && !isOwned) return false;
      if (filterOptions.ownership === 'unowned' && isOwned) return false;

      // 2. 検索クエリ
      if (filterOptions.searchQuery.trim() !== '') {
        const q = filterOptions.searchQuery.toLowerCase();
        const matchTitle = record.title.toLowerCase().includes(q);
        const matchReading = record.reading.toLowerCase().includes(q);
        if (!matchTitle && !matchReading) return false;
      }

      // 3. 対象ユニット絞り込み
      if (filterOptions.units.length === 0) {
        return false;
      }
      const recordUnits =
        record.units && record.units.length > 0 ? record.units : [record.unit];
      if (unitMatchMode === 'and') {
        const hasAllUnits = filterOptions.units.every((u) => recordUnits.includes(u));
        if (!hasAllUnits) return false;
      } else {
        if (!isAllUnitsSelected) {
          const hasAnyUnit = recordUnits.some((u) => filterOptions.units.includes(u));
          if (!hasAnyUnit) return false;
        }
      }

      // 4. 歌唱キャラクター絞り込み
      if (filterOptions.characters.length > 0) {
        if (charMatchMode === 'and_same_track') {
          // 1つの歌唱バージョン（トラック）で選択キャラ全員が歌唱しているか
          const tracks = record.vocalTracks || [];
          const hasTrackWithAllChars = tracks.some((track) =>
            filterOptions.characters.every((cId) => track.singers && track.singers.includes(cId))
          );
          if (!hasTrackWithAllChars) return false;
        } else if (charMatchMode === 'and_all') {
          // 曲全体（いずれかのVer）で選択キャラ全員が存在するか
          const hasAllCharsInSong = filterOptions.characters.every((cId) =>
            record.characters.includes(cId)
          );
          if (!hasAllCharsInSong) return false;
        } else {
          // OR: 選択キャラのいずれかが歌唱しているか
          const hasAnyChar = filterOptions.characters.some((cId) =>
            record.characters.includes(cId)
          );
          if (!hasAnyChar) return false;
        }
      }

      // 5. 歌唱バージョン条件絞り込み
      if (selectedVocals.length > 0) {
        if (vocalMatchMode === 'and') {
          const hasAllVocals = selectedVocals.every((vKey) => Boolean(record.vocalVersions[vKey]));
          if (!hasAllVocals) return false;
        } else {
          const hasAnyVocal = selectedVocals.some((vKey) => Boolean(record.vocalVersions[vKey]));
          if (!hasAnyVocal) return false;
        }
      }

      // 6. 楽曲分類（書き下ろし種別）
      if (filterOptions.originalTypes && filterOptions.originalTypes.length > 0) {
        const type = record.originalType || 'cover';
        if (!filterOptions.originalTypes.includes(type)) return false;
      }

      // 7. バナーキャラクター
      if (filterOptions.bannerCharacters && filterOptions.bannerCharacters.length > 0) {
        if (!record.bannerCharacter || !filterOptions.bannerCharacters.includes(record.bannerCharacter)) {
          return false;
        }
      }

      // 8. 実装年
      if (filterOptions.releaseYears && filterOptions.releaseYears.length > 0) {
        const year = getAnniversaryYear(record.releaseDate);
        if (!filterOptions.releaseYears.includes(year)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      let compare = 0;
      if (sortType === 'defaultSort') {
        compare = (a.defaultSort ?? a.defaultOrder) - (b.defaultSort ?? b.defaultOrder);
      } else if (sortType === 'defaultOrder') {
        compare = a.defaultOrder - b.defaultOrder;
      } else if (sortType === 'releaseDate') {
        compare = a.releaseDate.localeCompare(b.releaseDate) || (a.defaultOrder - b.defaultOrder);
      } else if (sortType === 'reading') {
        compare = a.reading.localeCompare(b.reading, 'ja');
      }
      return sortDirection === 'asc' ? compare : -compare;
    });
};

/**
 * データ世代スナップショット情報
 */
export interface DataRevisionSnapshot {
  label: string;
  updatedAt: string;
  recordCount: number;
  ids?: string[];
  idAliases?: Record<string, string>;
}

/**
 * データ世代管理設定
 */
export interface DataSnapshotsConfig {
  currentRevision: number;
  revisions: Record<string, DataRevisionSnapshot>;
}

/**
 * 進捗コードのエンコードオプション
 */
export interface EncodeShareOptions {
  records?: RecordItem[];
  snapshots?: DataSnapshotsConfig;
  totalCount?: number;
}

/**
 * 進捗コードのデコード解析結果
 */
export interface ParsedShareData {
  ok: boolean;
  format: 'b2' | 'b1' | 'legacy_json' | 'invalid';
  isLegacy: boolean;
  isChecksumValid: boolean;
  dataRevision?: number;
  dataLabel?: string;
  sourceRecordCount?: number;
  unknownRevision?: boolean;
  ownedMap: Record<string, boolean>;
  ownedCount: number;
  unmappedCount: number;
  errorMessage?: string;
}

const B2_FORMAT_VERSION = 0x02;
const B2_HEADER_BYTES = 5;
const B2_CHECKSUM_BYTES = 2;

/**
 * CRC-16-CCITT (多項式 0x1021, 初期値 0xFFFF) を計算する
 */
function computeCrc16(bytes: Uint8Array, length: number): number {
  let crc = 0xffff;
  for (let i = 0; i < length; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

/**
 * Uint8Array を Base64URL 文字列に変換する
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64URL 文字列を Uint8Array に変換する（不正な文字や形式は null を返す）
 */
function base64UrlToBytes(token: string): Uint8Array | null {
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return null;
  }
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (b64.length % 4)) % 4;
    const binary = atob(b64 + '='.repeat(padLen));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * 入力文字列（URL または進捗コード本体）から共有トークンを抽出する
 */
export const extractShareToken = (rawInput: string): string => {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  if (trimmed.includes('share=')) {
    try {
      const urlObj = new URL(trimmed);
      return (urlObj.searchParams.get('share') || trimmed).trim();
    } catch {
      const match = trimmed.match(/share=([^&\s#]+)/);
      if (match && match[1]) return match[1].trim();
    }
  }
  return trimmed;
};

/**
 * 所持リストを新形式（b2_: データラベル・曲数ヘッダ・CRC-16チェックサム付き BitSet Base64URL）で圧縮エンコードする
 */
export const encodeShareData = (
  ownedRecordIds: Record<string, boolean>,
  totalCountOrOptions: number | RecordItem[] | EncodeShareOptions = ALL_RECORDS
): string => {
  let records: RecordItem[] = ALL_RECORDS;
  let snapshots: DataSnapshotsConfig = defaultDataSnapshots as DataSnapshotsConfig;
  let explicitCount: number | undefined;

  if (typeof totalCountOrOptions === 'number') {
    explicitCount = totalCountOrOptions;
  } else if (Array.isArray(totalCountOrOptions)) {
    records = totalCountOrOptions;
  } else if (totalCountOrOptions && typeof totalCountOrOptions === 'object') {
    if (totalCountOrOptions.records) records = totalCountOrOptions.records;
    if (totalCountOrOptions.snapshots) snapshots = totalCountOrOptions.snapshots;
    if (typeof totalCountOrOptions.totalCount === 'number') {
      explicitCount = totalCountOrOptions.totalCount;
    }
  }

  const revision = snapshots.currentRevision || 1;
  const revSnapshot = snapshots.revisions[String(revision)];

  // エンコード対象となるID順序リストを決定
  let orderedIds: string[];
  if (typeof explicitCount === 'number' && !Array.isArray(totalCountOrOptions)) {
    if (revSnapshot?.ids && revSnapshot.ids.length >= explicitCount) {
      orderedIds = revSnapshot.ids.slice(0, explicitCount);
    } else if (records.length >= explicitCount && explicitCount > 0) {
      orderedIds = records.slice(0, explicitCount).map((r) => r.id);
    } else {
      orderedIds = Array.from({ length: Math.max(0, explicitCount) }, (_, i) => `rec_${i + 1}`);
    }
  } else if (revSnapshot?.ids && revSnapshot.ids.length > 0 && records === ALL_RECORDS) {
    orderedIds = revSnapshot.ids;
  } else {
    orderedIds = records.map((r) => r.id);
  }

  const bitCount = orderedIds.length;
  const bitByteLen = Math.ceil(bitCount / 8);
  const totalBytes = B2_HEADER_BYTES + bitByteLen + B2_CHECKSUM_BYTES;
  const bytes = new Uint8Array(totalBytes);

  // ヘッダ部 (5バイト): [version(1)] [revision(2)] [bitCount(2)]
  bytes[0] = B2_FORMAT_VERSION;
  bytes[1] = (revision >> 8) & 0xff;
  bytes[2] = revision & 0xff;
  bytes[3] = (bitCount >> 8) & 0xff;
  bytes[4] = bitCount & 0xff;

  // データ部 (BitSet)
  for (let i = 0; i < bitCount; i++) {
    if (ownedRecordIds[orderedIds[i]]) {
      const byteIdx = B2_HEADER_BYTES + (i >> 3);
      const bitIdx = i & 7;
      bytes[byteIdx] |= 1 << bitIdx;
    }
  }

  // 末尾チェックサム (CRC-16, 2バイト)
  const crc = computeCrc16(bytes, B2_HEADER_BYTES + bitByteLen);
  bytes[B2_HEADER_BYTES + bitByteLen] = (crc >> 8) & 0xff;
  bytes[B2_HEADER_BYTES + bitByteLen + 1] = crc & 0xff;

  return `b2_${bytesToBase64Url(bytes)}`;
};

/**
 * 共有文字列（b2_ 新形式、b1_ 旧形式、JSON Base64 旧形式）を詳細解析し、チェックサム検証およびデータラベル解決を行う
 */
export const parseShareData = (
  shareString: string,
  options?: { records?: RecordItem[]; snapshots?: DataSnapshotsConfig }
): ParsedShareData => {
  const token = extractShareToken(shareString || '');
  if (!token) {
    return {
      ok: false,
      format: 'invalid',
      isLegacy: false,
      isChecksumValid: false,
      ownedMap: {},
      ownedCount: 0,
      unmappedCount: 0,
      errorMessage: '進捗コードが空です。',
    };
  }

  const records = options?.records ?? ALL_RECORDS;
  const snapshots = options?.snapshots ?? (defaultDataSnapshots as DataSnapshotsConfig);
  const validIdSet = new Set(records.map((r) => r.id));

  // 1. 新形式: b2_ (ヘッダ + BitSet + CRC-16チェックサム)
  if (token.startsWith('b2_')) {
    const bytes = base64UrlToBytes(token.slice(3));
    if (!bytes || bytes.length < B2_HEADER_BYTES + B2_CHECKSUM_BYTES) {
      return {
        ok: false,
        format: 'invalid',
        isLegacy: false,
        isChecksumValid: false,
        ownedMap: {},
        ownedCount: 0,
        unmappedCount: 0,
        errorMessage: 'コードが途中で切れているか、使用できない文字が含まれています。',
      };
    }

    if (bytes[0] !== B2_FORMAT_VERSION) {
      return {
        ok: false,
        format: 'invalid',
        isLegacy: false,
        isChecksumValid: false,
        ownedMap: {},
        ownedCount: 0,
        unmappedCount: 0,
        errorMessage: '未対応の進捗コードバージョンです。',
      };
    }

    const revision = (bytes[1] << 8) | bytes[2];
    const bitCount = (bytes[3] << 8) | bytes[4];
    const bitByteLen = Math.ceil(bitCount / 8);
    const expectedTotalBytes = B2_HEADER_BYTES + bitByteLen + B2_CHECKSUM_BYTES;

    if (bytes.length !== expectedTotalBytes) {
      return {
        ok: false,
        format: 'invalid',
        isLegacy: false,
        isChecksumValid: false,
        ownedMap: {},
        ownedCount: 0,
        unmappedCount: 0,
        errorMessage:
          '進捗コードまたはURLの長さが一致しません。末尾まで正しくコピーされているか確認してください。',
      };
    }

    const expectedCrc = computeCrc16(bytes, B2_HEADER_BYTES + bitByteLen);
    const actualCrc =
      (bytes[B2_HEADER_BYTES + bitByteLen] << 8) | bytes[B2_HEADER_BYTES + bitByteLen + 1];

    if (expectedCrc !== actualCrc) {
      return {
        ok: false,
        format: 'invalid',
        isLegacy: false,
        isChecksumValid: false,
        ownedMap: {},
        ownedCount: 0,
        unmappedCount: 0,
        errorMessage:
          'チェックサム検証に失敗しました。コードの一部が欠けているか書き換わっている可能性があります。',
      };
    }

    const revSnapshot = snapshots.revisions[String(revision)];
    const unknownRevision = !revSnapshot;
    const ownedMap: Record<string, boolean> = {};
    let unmappedCount = 0;

    for (let i = 0; i < bitCount; i++) {
      const byteIdx = B2_HEADER_BYTES + (i >> 3);
      const bitIdx = i & 7;
      if ((bytes[byteIdx] & (1 << bitIdx)) !== 0) {
        const rawId =
          revSnapshot?.ids && revSnapshot.ids[i]
            ? revSnapshot.ids[i]
            : records[i]?.id ?? `rec_${i + 1}`;
        const resolvedId = revSnapshot?.idAliases?.[rawId] ?? rawId;
        if (validIdSet.has(resolvedId)) {
          ownedMap[resolvedId] = true;
        } else {
          unmappedCount++;
        }
      }
    }

    const ownedCount = Object.keys(ownedMap).length;
    return {
      ok: true,
      format: 'b2',
      isLegacy: false,
      isChecksumValid: true,
      dataRevision: revision,
      dataLabel: revSnapshot?.label ?? `r${revision}`,
      sourceRecordCount: bitCount,
      unknownRevision,
      ownedMap,
      ownedCount,
      unmappedCount,
    };
  }

  // 2. 旧形式: b1_ (チェックサムなし BitSet)
  if (token.startsWith('b1_')) {
    const bytes = base64UrlToBytes(token.slice(3));
    if (!bytes || bytes.length === 0) {
      return {
        ok: false,
        format: 'invalid',
        isLegacy: true,
        isChecksumValid: false,
        ownedMap: {},
        ownedCount: 0,
        unmappedCount: 0,
        errorMessage: '旧形式の進捗コードが破損しています。',
      };
    }

    const ownedMap: Record<string, boolean> = {};
    let unmappedCount = 0;

    for (let byteIdx = 0; byteIdx < bytes.length; byteIdx++) {
      const byteVal = bytes[byteIdx];
      for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
        if ((byteVal & (1 << bitIdx)) !== 0) {
          const order = byteIdx * 8 + bitIdx + 1;
          const id = `rec_${order}`;
          if (validIdSet.has(id)) {
            ownedMap[id] = true;
          } else {
            unmappedCount++;
          }
        }
      }
    }

    const ownedCount = Object.keys(ownedMap).length;
    return {
      ok: true,
      format: 'b1',
      isLegacy: true,
      isChecksumValid: false,
      ownedMap,
      ownedCount,
      unmappedCount,
    };
  }

  // 3. 旧形式: JSON配列のBase64エンコード
  try {
    const decoded = decodeURIComponent(atob(token));
    const list: unknown = JSON.parse(decoded);
    if (Array.isArray(list)) {
      const ownedMap: Record<string, boolean> = {};
      let unmappedCount = 0;
      list.forEach((id) => {
        if (typeof id === 'string') {
          if (validIdSet.has(id)) {
            ownedMap[id] = true;
          } else {
            unmappedCount++;
          }
        }
      });
      return {
        ok: true,
        format: 'legacy_json',
        isLegacy: true,
        isChecksumValid: false,
        ownedMap,
        ownedCount: Object.keys(ownedMap).length,
        unmappedCount,
      };
    }
  } catch {
    // ignore
  }

  return {
    ok: false,
    format: 'invalid',
    isLegacy: false,
    isChecksumValid: false,
    ownedMap: {},
    ownedCount: 0,
    unmappedCount: 0,
    errorMessage: 'コードの形式が無効です。正しい進捗コードまたは共有URLを入力してください。',
  };
};

/**
 * 共有文字列（b2_ / b1_ / 旧形式JSON Base64）から所持マップを復元する
 */
export const decodeShareData = (shareString: string): Record<string, boolean> => {
  const parsed = parseShareData(shareString);
  return parsed.ok ? parsed.ownedMap : {};
};

/**
 * カスタム比較条件に合致するか判定（各条件枠ごとの AND / OR 条件評価、条件間はすべて AND）
 */
export const checkRecordMatchesCustomCondition = (
  record: RecordItem,
  cond: SavedCompareCondition
): boolean => {
  const units = cond.conditionUnits || [];
  const characters = cond.conditionCharacters || [];
  const originalTypes = cond.conditionOriginalTypes || [];
  const vocalTypes = cond.conditionVocalTypes || [];
  const bannerCharacters = cond.conditionBannerCharacters || [];
  const releaseYears = cond.conditionReleaseYears || [];

  const hasSpecificConditions =
    units.length > 0 ||
    characters.length > 0 ||
    originalTypes.length > 0 ||
    vocalTypes.length > 0 ||
    bannerCharacters.length > 0 ||
    releaseYears.length > 0;

  if (!hasSpecificConditions) {
    return true;
  }

  // 過去の保存データで全体ORが指定され、個別MatchTypeが未定義の場合の後方互換
  const isLegacyGlobalOr =
    cond.matchType === 'or' &&
    !cond.unitMatchType &&
    !cond.characterMatchType &&
    !cond.vocalMatchType;

  if (isLegacyGlobalOr) {
    const legacyResults: boolean[] = [];
    if (units.length > 0) {
      const recordUnits = record.units && record.units.length > 0 ? record.units : [record.unit];
      legacyResults.push(recordUnits.some((u) => units.includes(u)));
    }
    if (characters.length > 0) {
      legacyResults.push(characters.some((c) => record.characters.includes(c)));
    }
    if (originalTypes.length > 0) {
      const type = record.originalType || 'cover';
      legacyResults.push(originalTypes.includes(type));
    }
    if (vocalTypes.length > 0) {
      const hasAny = vocalTypes.some((vt) => Boolean(record.vocalVersions?.[vt]));
      legacyResults.push(hasAny);
    }
    if (bannerCharacters.length > 0) {
      legacyResults.push(Boolean(record.bannerCharacter && bannerCharacters.includes(record.bannerCharacter)));
    }
    if (releaseYears.length > 0) {
      const year = getAnniversaryYear(record.releaseDate);
      legacyResults.push(releaseYears.includes(year));
    }
    return legacyResults.some((r) => r === true);
  }

  // 1. ユニット判定
  if (units.length > 0) {
    const recordUnits = record.units && record.units.length > 0 ? record.units : [record.unit];
    if (cond.unitMatchType === 'and') {
      const hasAll = units.every((u) => recordUnits.includes(u));
      if (!hasAll) return false;
    } else {
      const hasAny = recordUnits.some((u) => units.includes(u));
      if (!hasAny) return false;
    }
  }

  // 2. キャラクター判定
  if (characters.length > 0) {
    if (cond.characterMatchType === 'and_same_track') {
      const tracks = record.vocalTracks || [];
      const hasSameTrack = tracks.some((track) =>
        characters.every((cId) => track.singers && track.singers.includes(cId))
      );
      if (!hasSameTrack) return false;
    } else if (cond.characterMatchType === 'and_all') {
      const hasAll = characters.every((cId) => record.characters.includes(cId));
      if (!hasAll) return false;
    } else {
      const hasAny = characters.some((cId) => record.characters.includes(cId));
      if (!hasAny) return false;
    }
  }

  // 3. 歌唱バージョン判定
  if (vocalTypes.length > 0) {
    if (cond.vocalMatchType === 'and') {
      const hasAll = vocalTypes.every((vt) => Boolean(record.vocalVersions?.[vt]));
      if (!hasAll) return false;
    } else {
      const hasAny = vocalTypes.some((vt) => Boolean(record.vocalVersions?.[vt]));
      if (!hasAny) return false;
    }
  }

  // 4. 楽曲分類判定
  if (originalTypes.length > 0) {
    const type = record.originalType || 'cover';
    if (!originalTypes.includes(type)) return false;
  }

  // 5. バナーキャラクター判定
  if (bannerCharacters.length > 0) {
    if (!record.bannerCharacter || !bannerCharacters.includes(record.bannerCharacter)) {
      return false;
    }
  }

  // 6. 実装年判定
  if (releaseYears.length > 0) {
    const year = getAnniversaryYear(record.releaseDate);
    if (!releaseYears.includes(year)) return false;
  }

  return true;
};
