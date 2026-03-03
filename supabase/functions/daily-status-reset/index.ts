// supabase/functions/daily-status-reset/index.ts
// 毎日0時（JST）に全ユーザーの稼働ステータスを
// 非稼働日 → '非稼働' / 稼働日 → '受付可' に自動リセットする Edge Function

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    // 全ユーザーを取得
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('name, availability_status, non_working_days');

    if (fetchError) throw fetchError;
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ message: 'ユーザーが存在しません' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results: { name: string; newStatus: string; reason: string }[] = [];

    for (const user of users) {
      const nonWorkingDays: string[] = user.non_working_days ?? [];
      const isNonWorkingDay = nonWorkingDays.includes(todayStr);
      const currentStatus = user.availability_status;

      let newStatus: string | null = null;

      if (isNonWorkingDay && currentStatus !== '非稼働') {
        // 非稼働日なのに非稼働以外 → 非稼働にする
        newStatus = '非稼働';
      } else if (!isNonWorkingDay && currentStatus === '非稼働') {
        // 稼働日なのに非稼働 → 受付可にする
        newStatus = '受付可';
      } else if (!isNonWorkingDay && currentStatus === '一時受付不可') {
        // 稼働日に一時受付不可が残っていたら受付可にリセット
        newStatus = '受付可';
      } else if (!isNonWorkingDay && currentStatus === '当日受付不可') {
        // 稼働日に当日受付不可が残っていたら受付可にリセット
        newStatus = '受付可';
      }

      if (newStatus !== null) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            availability_status: newStatus,
            status_revert_at: null, // 復帰タイマーもリセット
          })
          .eq('name', user.name);

        if (updateError) {
          results.push({ name: user.name, newStatus, reason: `エラー: ${updateError.message}` });
        } else {
          results.push({ name: user.name, newStatus, reason: isNonWorkingDay ? '非稼働日' : '稼働日リセット' });
        }
      }
    }

    console.log(`[daily-status-reset] ${todayStr} 完了: ${results.length}件更新`);

    return new Response(
      JSON.stringify({ date: todayStr, updated: results.length, details: results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[daily-status-reset] エラー:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
