/**
 * Сжимает изображение для баннера тренажёра перед загрузкой (быстрее грузится).
 * Ограничивает размер по ширине и снижает качество JPEG/WebP.
 */
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 680;
const JPEG_QUALITY = 0.82;

export async function compressImageForBanner(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width <= MAX_WIDTH && height <= MAX_HEIGHT) {
        resolve(file);
        return;
      }

      const scale = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height, 1);
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          const name = file.name.replace(/\.[^.]+$/i, '') + '-banner.' + (ext === 'png' ? 'jpg' : ext);
          const mime = ext === 'png' ? 'image/jpeg' : file.type;
          resolve(new File([blob], name, { type: mime }));
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}
