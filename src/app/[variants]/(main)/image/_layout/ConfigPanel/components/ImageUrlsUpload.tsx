import { memo } from 'react';

import { useAutoDimensions } from '@/app/[variants]/(main)/image/_layout/ConfigPanel/hooks/useAutoDimensions';
import { useGenerationConfigParam } from '@/store/image/slices/generationConfig/hooks';

import MultiImagesUpload from './MultiImagesUpload';

const ImageUrlsUpload = memo(() => {
  const { value, setValue } = useGenerationConfigParam('imageUrls');
  const { autoSetDimensions } = useAutoDimensions();

  const handleChange = (
    data:
      | string[] // Old API: just URLs
      | { dimensions?: { height: number; width: number }; urls: string[] }, // New API: URLs with first image dimensions
  ) => {
    const urls = Array.isArray(data) ? data : data.urls;
    const dimensions = Array.isArray(data) ? undefined : data.dimensions;

    // Directly set the URLs to the store
    // The store will handle URL to path conversion when needed
    setValue(urls);

    // Only auto-set dimensions if no existing images and only uploading one image
    if (!value?.length && urls.length === 1 && dimensions) {
      autoSetDimensions(dimensions);
    }
  };

  return (
    <MultiImagesUpload
      value={value}
      onChange={handleChange}
    />
  );
});

export default ImageUrlsUpload;
