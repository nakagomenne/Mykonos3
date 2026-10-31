import React from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from './icons';
import { withNoteIcons, NoteIcon } from './NoteIcons';

interface NotesHelpModalProps {
  isDarkMode?: boolean;
  onClose: () => void;
}

const ITEMS: { icon: string; title: string; body: string }[] = [
  { icon: '✏️', title: 'ノートを書く', body: '右上の「＋ 新規ノート」で作成します。文字の装飾、箇条書き、チェックリスト、表が使えます。画像はコピーして貼り付けるか、ドラッグするだけで追加できます。新規ノートは「保存」を押すと作成されます。保存済みのノートは、開くと閲覧モードで表示されます。「✏️ 編集」を押すと書き換えられます。変更は自動では保存されないので、終わったら必ず「保存」を押してください。「キャンセル」を押すと、変更を捨てて元に戻せます。' },
  { icon: '📁', title: 'フォルダで整理する', body: '左の「フォルダ」横の「＋」で作成します(サブフォルダは1階層まで)。ノートの上にある「📁 フォルダ」から、入れるフォルダを選べます(「✏️ 編集」を押さなくても変えられて、選ぶとすぐ反映されます)。' },
  { icon: '🔒', title: '公開範囲を決める', body: '「🔒 自分だけ」「🌐 全員」「🛡 管理者のみ」「👥 選んだメンバー」から選びます。「✏️ 編集」を押さなくても変えられて、選ぶとすぐ反映されます。作ったばかりのノートは自分だけです。フォルダの公開範囲を変えると、中のノートもまとめて変わります。' },
  { icon: '📣', title: '周知する(読んだか確認する)', body: '公開範囲が「自分だけ」以外のノートで「📣 周知する」を押すと、見られる人に通知とバッジが出ます。相手が「確認しました」を押すと、誰が確認済みか未確認かを一覧で見られます。受け取った側は「確認しました」を押すと、「自分用にコピーして非表示」「コピーせず非表示」「キャンセル」から選べ、キャンセル以外を選ぶと確認済みになって周知の一覧から消えます。非表示にした周知は、左の「周知(お知らせ)」を開くと、一覧の一番下の「非表示の周知」バーをクリックして開くと、いつでも見られます。内容を直したときは「再周知」で、もう一度確認を依頼できます。' },
  { icon: '🌐', title: '他の人のノートを見る', body: '左の「みんなのノート」に、共有されたノートが並びます。他の人のノートは読み取り専用です。「📄 自分用にコピー」で、自分のノートにして編集できます。' },
  { icon: '📎', title: '案件の備考をノートにする', body: '案件の詳細画面の備考にある「📓 ノートに保存」を押します。保存後に、案件を完了にするか選べます。「完了しない」を選ぶと、備考は案件にそのまま残ります。' },
  { icon: '📋', title: '定型文', body: 'よく使う文章は、ノートの編集中のツールバーにある「📋 定型文」や、案件の備考欄の「📋 定型文」から挿入できます。定型文の追加・編集もそこから行えます。' },
];

const NotesHelpModal: React.FC<NotesHelpModalProps> = ({ isDarkMode = false, onClose }) => {
  const d = isDarkMode;
  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[90]" onClick={onClose}>
      <div
        className={`${d ? 'bg-[#1a2234] text-slate-200' : 'bg-white text-slate-700'} rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`p-4 border-b ${d ? 'border-slate-700' : 'border-slate-200'} flex items-center justify-between`}>
          <h2 className="text-lg font-bold"><NoteIcon name="book-open" /> ノートの使い方</h2>
          <button onClick={onClose} aria-label="閉じる"><XMarkIcon className="w-6 h-6" /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">
          {ITEMS.map(it => (
            <div key={it.title} className="flex gap-3">
              <div className="text-2xl leading-none pt-0.5 w-8 text-center flex-shrink-0">{withNoteIcons(it.icon)}</div>
              <div>
                <div className="font-bold text-sm">{it.title}</div>
                <p className={`text-sm mt-0.5 leading-relaxed ${d ? 'text-slate-300' : 'text-slate-600'}`}>{withNoteIcons(it.body)}</p>
              </div>
            </div>
          ))}
          <p className={`text-xs ${d ? 'text-slate-400' : 'text-slate-500'} border-t pt-3 ${d ? 'border-slate-700' : 'border-slate-200'}`}>
            ※ 「自分だけ」のノートは画面上で他の人に表示されないだけで、データベースの仕組み上は完全な秘匿ではありません。機密性の高い内容は書かないでください。
          </p>
        </div>
        <div className={`p-3 border-t ${d ? 'border-slate-700' : 'border-slate-200'} flex justify-end`}>
          <button onClick={onClose} className="px-5 py-2 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c]">閉じる</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NotesHelpModal;
