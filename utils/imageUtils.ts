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
