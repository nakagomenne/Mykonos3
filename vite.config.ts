import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig(({ mode, command }) => {
    const env = loadEnv(mode, '.', '');
    // お知らせの番号。開きっぱなしの画面に「新しいバージョンがあります」と出すのは、
    // release-notice.json の noticeId を上げて本番に出したときだけ(ふつうの本番反映では出さない)
    // (手元の開発サーバーと、本番に出す前の確認用(プレビュー)では 'dev' にして、お知らせを出さない)
    const isPreviewDeploy = process.env.VERCEL_ENV === 'preview';
    const releaseNotice = JSON.parse(readFileSync('./release-notice.json', 'utf-8'));
    const noticeId = command === 'build' && !isPreviewDeploy ? String(releaseNotice.noticeId) : 'dev';
    // この仕組みに変える前のプログラム(ビルドごとの番号で見比べる)を開いたままの画面向け。
    // noticeId が 1 の間は、変える直前の番号のままにして、お知らせを出さない。上げたら、その画面にも出す
    const LEGACY_BUILD_ID = '1795497115357';
    const buildId = String(releaseNotice.noticeId) === '1' ? LEGACY_BUILD_ID : `notice-${releaseNotice.noticeId}`;
    return {
      plugins: [
        {
          // 配信先に version.json を置く(中身は、いま配信しているお知らせの番号)
          name: 'mykonos-version-file',
          apply: 'build',
          generateBundle() {
            this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId, noticeId }) });
          },
        },
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        '__APP_VERSION__': JSON.stringify(pkg.version),
        '__NOTICE_ID__': JSON.stringify(noticeId),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // 重いライブラリを独立したチャンクに分割してキャッシュ効率を高める
        rollupOptions: {
          output: {
            manualChunks: {
              // Supabase クライアント（変更頻度低い→長期キャッシュ可）
              'vendor-supabase': ['@supabase/supabase-js'],
              // Excel ライブラリ（管理画面でのみ使用）
              'vendor-xlsx': ['xlsx'],
              // React コア
              'vendor-react': ['react', 'react-dom'],
            },
          },
        },
        // 警告しきい値を 600KB に調整（分割後のチャンクサイズに合わせる）
        chunkSizeWarningLimit: 600,
      },
    };
});
