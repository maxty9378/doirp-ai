export function getLiveKitURL(projectUrl: string, region: string | null): string {
  const url = new URL(projectUrl);

  if (region && url.hostname.includes('livekit.cloud')) {
    const [projectId, ...initialHostParts] = url.hostname.split('.');
    let hostParts = initialHostParts;

    if (hostParts[0] !== 'staging') {
      hostParts = ['production', ...hostParts];
    }

    url.hostname = [projectId, region, ...hostParts].join('.');
  }

  return url.toString();
}
