import React from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from './icons';
import { withNoteIcons, NoteIcon } from './NoteIcons';

interface NotesHelpModalProps {
  isDarkMode?: boolean;
  onClose: () => void;
}

const ITEMS: { icon: string; title: string; body: string }[] = [
  { icon: '✏️', title: 'ノートを書く', body: '右上の「＋ 新規ノート」で作成します。文字の装飾、箇条書き、チェックリスト、表が使えます。画像はコピーして貼り付けるか、ドラッグするだけで追加できます。新規ノートは「保存」を押すと作成されます。保存済みのノートは、開くと閲覧モードで表示されます。画面の上にある「✏️ 編集」を押すと書き換えられます(「編集」「履歴」「保存」は、本文が長くてもいつも画面の上にあります)。変更は自動では保存されないので、終わったら必ず「保存」を押してください。「キャンセル」を押すと、変更を捨てて元に戻せます。保存する前に画面を閉じてしまっても、次にノートを開いたときに「書きかけが残っています」と出て、「復元する」で続きから書けます(同じパソコン・同じブラウザのときだけ)。' },
  { icon: '🛠', title: '文字の大きさ・色を変える', body: '編集中、変えたい文字をなぞって選んでから、上のバーで「大きさ(小・標準・大・特大)」「B(太字)」「色」「マーカー」を選びます。もっと細かく決めたいときは「もっと(書式・添付)」を開くと、大きさを数字で指定したり、色を自由に選んだり、中央・右にそろえたりできます。「装飾をすべて外す」で元に戻せます。' },
  { icon: '📎', title: 'ファイルを添付する', body: '編集中の「もっと(書式・添付)」にある「ファイルを添付」から、PDF や Excel などを添付できます(1つ20MBまで。本文にドラッグしても追加できます)。添付したファイルは、本文の中の枠つきの名前を押すとダウンロードできます。' },
  { icon: '📎', title: '音声・動画を入れる', body: '音声(録音など)は、編集中の「もっと(書式・添付)」にある「♪ 音声を添付」から入れると、ノートの中でそのまま再生できます(1つ50MBまで。本文にドラッグしても入ります)。動画は Mykonos には保存せず、YouTube・Google ドライブ・Vimeo に置いた動画のリンクを「▶ 動画リンク」に貼ると、ノートの中で再生できます(YouTube のリンクは本文に貼るだけでも入ります)。ドライブの動画は、見せたい人に共有しておいてください。編集中は動画を押すと選択になり、Delete キーで消せます。再生は保存したあとの画面でできます。' },
  { icon: '📂', title: '絞り込む・並び替える', body: 'ノート一覧の上で、「作った人」「タグ」で絞り込めます。並び順は「更新が新しい順」「作成が新しい順」「タイトル順」から選べます(ピン留めしたノートは常に上に出ます)。' },
  { icon: '📁', title: 'フォルダで整理する', body: '左の「フォルダ」横の「＋」で作成します(サブフォルダは1階層まで)。ノートのタイトルの下にあるフォルダの欄から、入れるフォルダを選べます(「✏️ 編集」を押さなくても変えられて、選ぶとすぐ反映されます)。' },
  { icon: '🔒', title: '公開範囲を決める', body: 'ノートのタイトルの下にある公開範囲の札を押して、「🔒 自分だけ」「🌐 全員」「🛡 管理者のみ」「👥 選んだメンバー」から選びます。「✏️ 編集」を押さなくても変えられて、選ぶとすぐ反映されます。作ったばかりのノートは自分だけです。フォルダの公開範囲を変えると、中のノートもまとめて変わります。' },
  { icon: '📣', title: '周知する(読んだか確認する)', body: '公開範囲が「自分だけ」以外のノートで、タイトルの下の「📣 周知」の札を開いて「周知する」を押すと、見られる人に通知とバッジが出ます。相手が「確認しました」を押すと、札に「周知中 1/2人」のように人数が出て、札を開くと誰が確認済みか未確認かを一覧で見られます。受け取った側は「確認しました」を押すと、「自分用にコピーして非表示」「コピーせず非表示」「キャンセル」から選べ、キャンセル以外を選ぶと確認済みになって周知の一覧から消えます。非表示にした周知は、左の「周知(お知らせ)」を開くと、一覧の一番下の「非表示の周知」バーをクリックして開くと、いつでも見られます。内容を直したときは「再周知」で、もう一度確認を依頼できます。' },
  { icon: '🌐', title: '他の人のノートを見る', body: '左の「みんなのノート」に、共有されたノートが並びます。他の人のノートは読み取り専用です。「📄 自分用にコピー」で、自分のノートにして編集できます。' },
  { icon: '👥', title: '一緒に編集する(共同編集)', body: '公開範囲が「自分だけ」以外のノートで、タイトルの下の「📣 周知・共同編集」の札を開いて「共同編集」にチェックを入れると、そのノートを見られる人もタイトルと本文を編集できます。公開範囲の変更・削除・周知ができるのは、作った人だけです。同じノートを同時に編集した場合は、あとから保存する人に「上書きしますか」と確認が出ます。' },
  { icon: '⏳', title: '前の内容に戻す(履歴)', body: 'ノートの上にある「履歴」を押すと、これまでに保存した内容を新しい順に見られます(30件まで)。戻したい版を選んで「この版に戻す」を押すと、その内容に書き換わります。戻す前の内容も履歴に残るので、やり直せます。' },
  { icon: '🛠', title: 'ノートを削除する', body: 'ノートの上の右端にある「⋯」を押すと、「このノートを削除」が出ます(作った人だけ)。' },
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
