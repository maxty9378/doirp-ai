export const downloadFile = async (
  url: string,
  fileName: string,
  fallbackToOpen: boolean = true,
) => {
  const isCrossOriginUrl = () => {
    try {
      return new URL(url, window.location.href).origin !== window.location.origin;
    } catch {
      return false;
    }
  };

  const createDownloadLink = (blob: Blob) => {
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = 'none';

    document.body.append(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(blobUrl);
  };

  try {
    const response = isCrossOriginUrl()
      ? await fetch('/webapi/proxy', { body: url, method: 'POST' })
      : await fetch(url, {
          // Avoid image disk cache which can cause incorrect CORS headers
          cache: 'no-store',
          credentials: 'omit',
          mode: 'cors',
        });

    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    createDownloadLink(blob);
  } catch (error) {
    console.log('Download failed:', error);

    // Fallback: open in new tab if enabled
    if (fallbackToOpen) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      // Re-throw the error if fallback is disabled
      throw error;
    }
  }
};
