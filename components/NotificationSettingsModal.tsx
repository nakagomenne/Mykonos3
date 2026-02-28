import React from 'react';
import { BellIcon } from './icons';

// ────────────────────────────────────────────────
// 型定義
// ────────────────────────────────────────────────

/** 架電時間の通知タイミング */
export type NotifyTiming = 'exact' | '5min' | '10min' | '15min' | '30min';

/** 通知設定オブジェクト */
export interface NotificationSettings {
  /** 架電通知を有効にするか */
  callNotifyEnabled: boolean;
  /** 架電の何分前（または ちょうど）に通知するか（複数選択可） */
  callNotifyTimings: NotifyTiming[];
  /** 回線前確案件が追加されたら即時通知するか（isLinePrechecker のみ有効） */
  precheckInstantNotify: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  callNotifyEnabled: false,
  callNotifyTimings: ['exact'],
  precheckInstantNotify: false,
};

const TIMING_LABELS: Record<NotifyTiming, string> = {
  exact: 'ちょうど（時刻通り）',
  '5min': '5分前',
  '10min': '10分前',
  '15min': '15分前',
  '30min': '30分前',
};

const TIMING_OPTIONS: NotifyTiming[] = ['30min', '15min', '10min', '5min', 'exact'];

// ────────────────────────────────────────────────
// コンポーネント
// ────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: NotificationSettings;
  onChange: (next: NotificationSettings) => void;
  isLinePrechecker: boolean;
  /** 通知権限の状態を変更する（OFF→ON 時に requestPermission を呼ぶ） */
  onRequestPermission: () => Promise<boolean>;
  notificationPermission: NotificationPermission | 'unsupported';
}

const NotificationSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  isLinePrechecker,
  onRequestPermission,
  notificationPermission,
}) => {
  if (!isOpen) return null;

  const handleCallNotifyToggle = async () => {
    if (!settings.callNotifyEnabled) {
      // ON にするとき権限確認
      if (notificationPermission !== 'granted') {
        const granted = await onRequestPermission();
        if (!granted) return;
      }
      onChange({ ...settings, callNotifyEnabled: true });
    } else {
      onChange({ ...settings, callNotifyEnabled: false });
    }
  };

  const handlePrecheckToggle = async () => {
    if (!settings.precheckInstantNotify) {
      if (notificationPermission !== 'granted') {
        const granted = await onRequestPermission();
        if (!granted) return;
      }
      onChange({ ...settings, precheckInstantNotify: true });
    } else {
      onChange({ ...settings, precheckInstantNotify: false });
    }
  };

  const toggleTiming = (timing: NotifyTiming) => {
    const current = settings.callNotifyTimings;
    const next = current.includes(timing)
      ? current.filter(t => t !== timing)
      : [...current, timing];
    // 少なくとも1つは選択必須
    if (next.length === 0) return;
    onChange({ ...settings, callNotifyTimings: next });
  };

  const permissionBadge = () => {
    if (notificationPermission === 'unsupported') {
      return <span className="text-xs text-red-500 ml-2">非対応ブラウザ</span>;
    }
    if (notificationPermission === 'denied') {
      return <span className="text-xs text-red-500 ml-2">ブロック中（ブラウザ設定で許可してください）</span>;
    }
    if (notificationPermission === 'granted') {
      return <span className="text-xs text-green-600 ml-2">許可済み</span>;
    }
    return <span className="text-xs text-slate-400 ml-2">未設定</span>;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-settings-title"
    >
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* モーダル本体 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 px-6 py-4 bg-[#0193be] text-white">
          <BellIcon className="w-6 h-6 flex-shrink-0" />
          <h2 id="notif-settings-title" className="text-lg font-bold flex-1">
            通知設定
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 transition"
            aria-label="閉じる"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none"
              viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* コンテンツ */}
        <div className="px-6 py-5 space-y-6">

          {/* ブラウザ通知権限の状態 */}
          <div className="flex items-center text-sm text-slate-600">
            <span className="font-medium">ブラウザ通知権限:</span>
            {permissionBadge()}
          </div>

          {/* ── 架電通知セクション ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-slate-800">架電時間通知</p>
                <p className="text-xs text-slate-500 mt-0.5">担当案件の架電予定時間をお知らせします</p>
              </div>
              {/* トグルスイッチ */}
              <button
                type="button"
                onClick={handleCallNotifyToggle}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0193be] focus:ring-offset-2 ${
                  settings.callNotifyEnabled ? 'bg-[#0193be]' : 'bg-slate-200'
                }`}
                role="switch"
                aria-checked={settings.callNotifyEnabled}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.callNotifyEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* タイミング選択（有効時のみ表示） */}
            {settings.callNotifyEnabled && (
              <div className="ml-0 mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-2">通知タイミング（複数選択可）</p>
                <div className="space-y-2">
                  {TIMING_OPTIONS.map(timing => {
                    const checked = settings.callNotifyTimings.includes(timing);
                    return (
                      <label
                        key={timing}
                        className="flex items-center gap-3 cursor-pointer group"
                      >
                        <span
                          onClick={() => toggleTiming(timing)}
                          className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                            checked
                              ? 'bg-[#0193be] border-[#0193be]'
                              : 'border-slate-300 group-hover:border-[#0193be]'
                          }`}
                        >
                          {checked && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24"
                              stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span
                          onClick={() => toggleTiming(timing)}
                          className="text-sm text-slate-700"
                        >
                          {TIMING_LABELS[timing]}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  ※ 複数選択した場合はそれぞれのタイミングで通知されます
                </p>
              </div>
            )}
          </section>

          {/* ── 回線前確即時通知（isLinePrechecker のみ） ── */}
          {isLinePrechecker && (
            <section className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[#118f82]">回線前確 即時通知</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    回線前確案件が新規追加されたとき即座に通知します
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePrecheckToggle}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#118f82] focus:ring-offset-2 ${
                    settings.precheckInstantNotify ? 'bg-[#118f82]' : 'bg-slate-200'
                  }`}
                  role="switch"
                  aria-checked={settings.precheckInstantNotify}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.precheckInstantNotify ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </section>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#0193be] text-white text-sm font-semibold hover:bg-[#017a9a] transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettingsModal;
