import type { DataSnapshotsConfig } from '../src/utils/recordUtils';

export const DELETED_RECORD_ID: string;

export function buildNextDataSnapshots(
  snapshots: DataSnapshotsConfig,
  oldRecords: Array<{ id: string; title: string }>,
  newRecords: Array<{ id: string; title: string }>,
  dateInfo: { jstDateDot: string; jstDateDash: string }
): DataSnapshotsConfig;
