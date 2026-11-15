/**
 * データ更新時に dataSnapshots.json の世代番号・ラベル・構成変更時スナップショット（ids / idAliases）を
 * 自動更新・連鎖更新するためのユーティリティ。
 */

/**
 * 削除された楽曲IDが繰り上がった別楽曲IDへ誤マッピングされるのを防ぐためのセンチネル値
 */
export const DELETED_RECORD_ID = '__deleted__';

/**
 * 更新前後のレコード一覧から、次のリビジョン情報と過去リビジョンの構成スナップショットを更新します。
 *
 * @param {object} snapshots 現在の dataSnapshots.json オブジェクト
 * @param {Array<{ id: string, title: string }>} oldRecords 更新前のレコード一覧
 * @param {Array<{ id: string, title: string }>} newRecords 更新後のレコード一覧
 * @param {{ jstDateDot: string, jstDateDash: string }} dateInfo JST日付情報
 * @returns {object} 更新後の snapshots オブジェクト
 */
export function buildNextDataSnapshots(snapshots, oldRecords, newRecords, dateInfo) {
  const nextSnapshots = {
    currentRevision: snapshots?.currentRevision || 0,
    revisions: structuredClone(snapshots?.revisions || {}),
  };

  // 先頭からのID順序がすべて保たれているか（末尾への新曲追加・既存曲のメタ情報更新のみか）を判定
  const isPrefixOrderPreserved =
    oldRecords.length > 0 &&
    newRecords.length >= oldRecords.length &&
    oldRecords.every((r, idx) => newRecords[idx]?.id === r.id);

  if (!isPrefixOrderPreserved && oldRecords.length > 0) {
    const newIdByTitle = new Map(newRecords.map((r) => [r.title, r.id]));

    // 今回の更新における oldId -> nextId (または DELETED_RECORD_ID) マップを構築
    /** @type {Record<string, string>} */
    const stepAliases = {};
    for (const oldRec of oldRecords) {
      const nextId = newIdByTitle.get(oldRec.title);
      if (!nextId) {
        stepAliases[oldRec.id] = DELETED_RECORD_ID;
      } else if (nextId !== oldRec.id) {
        stepAliases[oldRec.id] = nextId;
      }
    }

    const oldIds = oldRecords.map((r) => r.id);

    for (const rev of Object.values(nextSnapshots.revisions)) {
      if (!rev.ids) {
        rev.ids = oldIds.slice(0, rev.recordCount || oldIds.length);
      }

      /** @type {Record<string, string>} */
      const nextAliases = {};

      // 既存のエイリアスを最新IDへ連鎖更新
      if (rev.idAliases) {
        for (const [origId, prevTargetId] of Object.entries(rev.idAliases)) {
          if (prevTargetId === DELETED_RECORD_ID) {
            nextAliases[origId] = DELETED_RECORD_ID;
          } else if (stepAliases[prevTargetId]) {
            nextAliases[origId] = stepAliases[prevTargetId];
          } else {
            nextAliases[origId] = prevTargetId;
          }
        }
      }

      // 今回初めてID変更または削除が起きたIDを追記
      for (const origId of rev.ids) {
        if (!nextAliases[origId] && stepAliases[origId]) {
          nextAliases[origId] = stepAliases[origId];
        }
      }

      if (Object.keys(nextAliases).length > 0) {
        rev.idAliases = nextAliases;
      }
    }
  }

  const nextRevision = (nextSnapshots.currentRevision || 0) + 1;
  const nextLabel = `${dateInfo.jstDateDot}-r${nextRevision}`;
  nextSnapshots.currentRevision = nextRevision;
  nextSnapshots.revisions[String(nextRevision)] = {
    label: nextLabel,
    updatedAt: dateInfo.jstDateDash,
    recordCount: newRecords.length,
  };

  return nextSnapshots;
}

