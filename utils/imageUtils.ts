/**
 * ファイルが GIF かどうかを判定する。
 * MIMEタイプ・拡張子・マジックバイト（GIF89a / GIF87a）の3段階で検出する。
 */
async function isGif(file: File): Promise<boolean> {
  // 1. MIMEタイプで判定（最も信頼性が高い）
  if (file.type === 'image/gif') return true;

  // 2. ファイル名の拡張子で判定（MIMEタイプが空や不正な場合の補完）
  if (file.name.toLowerCase().endsWith('.gif')) return true;

  // 3. マジックバイトで判定（拡張子もMIMEも信頼できない場合の最終手段）
  //    GIF ヘッダーは必ず "GIF87a" (0x47 49 46 38 37 61) か
  //                       "GIF89a" (0x47 49 46 38 39 61) で始まる
  try {
    const slice = file.slice(0, 6);
    const buf = await slice.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (
      bytes[0] === 0x47 && // G
      bytes[1] === 0x49 && // I
      bytes[2] === 0x46 && // F
      bytes[3] === 0x38 && // 8
      (bytes[4] === 0x37 || bytes[4] === 0x39) && // 7 or 9
      bytes[5] === 0x61   // a
    ) {
      return true;
    }
  } catch {
    // arrayBuffer() が使えない環境では無視
  }

  return false;
}

/** GIF の最大ファイルサイズ（0.5 MB） */
const GIF_MAX_BYTES = 0.5 * 1024 * 1024;

/**
 * GIF はアニメーションを維持するためそのまま base64 化、
 * それ以外はリサイズ・JPEG圧縮する共通ヘルパー
 */
export async function processProfileImage(file: File): Promise<string> {
  if (await isGif(file)) {
    if (file.size > GIF_MAX_BYTES) {
      throw new Error(
        `GIFファイルのサイズが上限を超えています。\n` +
        `アップロード可能なサイズ：0.5 MB 以内\n` +
        `選択したファイル：${(file.size / 1024 / 1024).toFixed(2)} MB`
      );
    }
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
      reader.readAsDataURL(file);
    });
  }
  return resizeImageToBase64(file);
}

/**
 * プロフィール画像をリサイズ・圧縮してbase64文字列に変換する
 * @param file         入力画像ファイル
 * @param maxSize      最大幅/高さ（px）。デフォルト 256
 * @param quality      JPEG圧縮品質 (0〜1)。デフォルト 0.8
 * @returns            圧縮後の base64 data URL（image/jpeg）
 */
export function resizeImageToBase64(
  file: File,
  maxSize = 256,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        // リサイズ比率を計算
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context が取得できませんでした'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };

      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
}
