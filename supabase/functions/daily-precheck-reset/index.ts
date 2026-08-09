// supabase/functions/daily-precheck-reset/index.ts
// 毎日9時（JST）に、回線前確・電気契確の「昨日以前+待機中」案件を
// 「当日+待機中」に自動更新する Edge Function
//
// クライアント側（App.tsx の setTimeout）にも同等の処理があるが、
// ブラウザを誰も開いていない時間帯には発火しないため、
// サーバー側の pg_cron からも同じ処理を確実に実行できるようにする。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PRECHECKER_ASSIGNEE_NAME = '回線前確';
const ELEC_ASSIGNEE_NAME = '電気契確';

Deno.serve(async (req) => {
  // cronジョブからのPOSTリクエスト以外は拒否
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 今日の日付を JST（UTC+9）で取得
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    const todayStr = jstNow.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // 対象: 回線前確 or 電気契確、追客中、時刻が待機中の案件を取得
    const { data: calls, error: fetchError } = await supabase
      .from('call_requests')
      .select('id, assignee, date_time, status')
      .in('assignee', [PRECHECKER_ASSIGNEE_NAME, ELEC_ASSIGNEE_NAME])
      .eq('status', '追客中')
      .is('deleted_at', null);

    if (fetchError) throw fetchError;

    const targets = (calls ?? []).filter((call: any) => {
      const [datePart, timePart] = String(call.date_time ?? '').split('T');
      if (timePart !== '待機中') return false;
      if (!datePart || datePart >= todayStr) return false; // 当日・未来はスキップ
      return true;
    });

    const results: { id: string; oldDateTime: string; newDateTime: string; error?: string }[] = [];

    for (const call of targets) {
      const newDateTime = `${todayStr}T待機中`;
      const { error: updateError } = await supabase
        .from('call_requests')
        .update({ date_time: newDateTime })
        .eq('id', call.id);

      if (updateError) {
        results.push({ id: call.id, oldDateTime: call.date_time, newDateTime, error: updateError.message });
      } else {
        results.push({ id: call.id, oldDateTime: call.date_time, newDateTime });
      }
    }

    console.log(`[daily-precheck-reset] ${todayStr} 完了: ${results.length}件更新`);

    return new Response(
      JSON.stringify({ date: todayStr, updated: results.length, details: results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[daily-precheck-reset] エラー:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
