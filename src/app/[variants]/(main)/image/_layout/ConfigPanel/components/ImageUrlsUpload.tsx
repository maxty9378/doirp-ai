import { Button } from '@lobehub/ui';
import { ImageIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAutoDimensions } from '@/app/[variants]/(main)/image/_layout/ConfigPanel/hooks/useAutoDimensions';
import { useGenerationConfigParam } from '@/store/image/slices/generationConfig/hooks';

import { PickFromGalleryModal } from './PickFromGalleryModal';
import MultiImagesUpload from './MultiImagesUpload';

const REFERENCE_IMAGES_MAX_COUNT = 4;

const ImageUrlsUpload = memo(() => {
  const { t } = useTranslation('image');
  const { value, setValue } = useGenerationConfigParam('imageUrls');
  const { autoSetDimensions } = useAutoDimensions();
  const [galleryOpen, setGalleryOpen] = useState(false);

  const handleChange = (
    data:
      | string[] // Old API: just URLs
      | { dimensions?: { height: number; width: number }; urls: string[] }, // New API: URLs with first image dimensions
  ) => {
    const urls = Array.isArray(data) ? data : data.urls;
    const dimensions = Array.isArray(data) ? undefined : data.dimensions;

    setValue(urls);

    if (!value?.length && urls.length === 1 && dimensions) {
      autoSetDimensions(dimensions);
    }
  };

  const handlePickFromGallery = (urls: string[]) => {
    setValue(urls);
  };

  const canAddFromGallery = (value?.length ?? 0) < REFERENCE_IMAGES_MAX_COUNT;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <MultiImagesUpload
        maxCount={REFERENCE_IMAGES_MAX_COUNT}
        value={value}
        onChange={handleChange}
      />
      {canAddFromGallery && (
        <Button
          block
          icon={ImageIcon}
          onClick={() => setGalleryOpen(true)}
          size="small"
          type="default"
          variant="outlined"
        >
          {t('config.pickFromGallery.button')}
        </Button>
      )}
      <PickFromGalleryModal
        currentUrls={value ?? []}
        maxCount={REFERENCE_IMAGES_MAX_COUNT}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSelect={handlePickFromGallery}
      />
    </div>
  );
});

export default ImageUrlsUpload;
