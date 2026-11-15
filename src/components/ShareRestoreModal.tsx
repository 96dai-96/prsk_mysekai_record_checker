import React from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  AlertCircle,
  KeyRound,
  ArrowRight,
  Link as LinkIcon,
} from 'lucide-react';
import type { ParsedShareData } from '../utils/recordUtils';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface ShareRestoreModalProps {
  parsed: ParsedShareData | null;
  currentOwnedCount: number;
  totalCount: number;
  source: 'url' | 'code';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 進捗コードおよび共有URLからのデータ復元時に表示する確認・警告モーダル。
 * 既存データの上書き保護、チェックサムエラー通知、旧形式コードの警告と選択を行います。
 */
export const ShareRestoreModal: React.FC<ShareRestoreModalProps> = ({
  parsed,
  currentOwnedCount,
  totalCount,
  source,
  onConfirm,
  onCancel,
}) => {
  useBodyScrollLock(Boolean(parsed));

  if (!parsed) return null;

  const isError = !parsed.ok;
  const isLegacy = parsed.ok && parsed.isLegacy;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs overscroll-contain animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-2xl shrink-0 ${
              isError
                ? 'bg-rose-50 text-rose-600'
                : isLegacy
                ? 'bg-amber-50 text-amber-600'
                : 'bg-[#33ccbb]/15 text-[#0d9488]'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-6 h-6" />
            ) : isLegacy ? (
              <AlertTriangle className="w-6 h-6" />
            ) : source === 'url' ? (
              <LinkIcon className="w-6 h-6" />
            ) : (
              <KeyRound className="w-6 h-6" />
            )}
          </div>
          <div>
            <h4 className="font-bold text-base text-slate-800">
              {isError ? 'チェック状態を正しく読み込めませんでした' : 'チェック状態の更新'}
            </h4>
            {isError && <p className="text-xs text-slate-400">データ検証エラー</p>}
          </div>
        </div>

        {/* エラー表示（チェックサム不一致・破損など） */}
        {isError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 leading-relaxed space-y-1.5">
            <p className="font-bold">コードまたはURLが正しくありません</p>
            <p>{parsed.errorMessage}</p>
            <p className="text-[11px] text-rose-600/80 pt-1">
              ※ 現在の端末のデータは変更されずそのまま保持されています。
            </p>
          </div>
        )}

        {/* 正常デコード時の確認内容 */}
        {!isError && (
          <>
            {/* 旧形式警告バナー */}
            {isLegacy && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>旧形式のコードが検出されました</span>
                </div>
                <p className="text-[11px] text-amber-800/90 leading-relaxed">
                  以前の形式で発行されたコードのため、データ更新や楽曲構成の変更により
                  <strong className="font-bold underline decoration-amber-400">
                    チェック状態の一部が正しく更新できない可能性
                  </strong>
                  があります。可能であれば移行元の端末で
                  <strong className="font-bold">新形式の進捗コードを再発行</strong>
                  して更新することをおすすめします。
                </p>
              </div>
            )}

            {/* 未知リビジョン警告（より新しいデータ世代で発行された場合） */}
            {parsed.unknownRevision && (
              <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-sky-900 leading-relaxed">
                <p className="font-bold text-sky-800 mb-1">
                  新しいデータ構成で発行されたコードです
                </p>
                <p className="text-[11px] text-sky-800/90">
                  発行元よりも古いデータ状態で開いている可能性があります。ページを再読み込みして最新データに更新してから再度読み込むことをおすすめします。
                </p>
              </div>
            )}

            {/* 更新前後の比較カード */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs text-slate-600 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 bg-white rounded-xl p-2.5 border border-slate-200/70 text-center">
                  <div className="text-[11px] text-slate-400 mb-0.5">現在の所持曲数</div>
                  <div className="font-bold font-mono text-sm text-slate-700">
                    {currentOwnedCount} <span className="text-[11px] font-normal">/ {totalCount}</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 bg-white rounded-xl p-2.5 border border-[#33ccbb]/40 text-center">
                  <div className="text-[11px] text-[#0d9488] font-medium mb-0.5">更新後の所持曲数</div>
                  <div className="font-bold font-mono text-sm text-[#0d9488]">
                    {parsed.ownedCount} <span className="text-[11px] font-normal">/ {totalCount}</span>
                  </div>
                </div>
              </div>

              {parsed.ownedCount === 0 && (
                <p className="text-[11px] text-slate-500 text-center">
                  ※ すべて未所持（0曲）の状態で更新されます。
                </p>
              )}

              {/* コード作成時の総曲数 */}
              {typeof parsed.sourceRecordCount === 'number' && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                  <span>コード作成時の総曲数</span>
                  <span className="font-mono font-semibold text-slate-700">
                    {parsed.sourceRecordCount} 曲
                  </span>
                </div>
              )}

              {parsed.unmappedCount > 0 && (
                <p className="text-[11px] text-amber-700 pt-1">
                  ※ 現在の楽曲データに対応しない {parsed.unmappedCount} 件は除外されます。
                </p>
              )}
            </div>

            {/* 目立つ上書き確認メッセージ */}
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50/80 border border-rose-200/80 text-center">
              <p className="text-xs sm:text-sm font-bold text-rose-700">
                チェック状態が上書きされます。よろしいですか？
              </p>
            </div>
          </>
        )}

        {/* アクションボタン */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            {isError ? '閉じる' : 'キャンセル'}
          </button>
          {!isError && (
            <button
              type="button"
              onClick={onConfirm}
              className={`px-4 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 ${
                isLegacy
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-[#33ccbb] hover:bg-[#2cb3a5]'
              }`}
            >
              {isLegacy ? '旧形式で更新を行う' : 'この内容で更新する'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

