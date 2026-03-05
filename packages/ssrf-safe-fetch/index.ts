import fetch from 'node-fetch';
import type { RequestFilteringAgentOptions } from 'request-filtering-agent';
import { RequestFilteringHttpAgent, RequestFilteringHttpsAgent } from 'request-filtering-agent';

/**
 * Options for per-call SSRF configuration overrides
 */
export interface SSRFOptions {
  /** List of IP addresses to allow */
  allowIPAddressList?: string[];
  /** Whether to allow private/local IP addresses */
  allowPrivateIPAddress?: boolean;
}

// Cache agents to improve performance and reduce connection handshakes
// This helps prevent ECONNRESET issues due to connection exhaustion
const agentCache = new Map<string, { http: RequestFilteringHttpAgent; https: RequestFilteringHttpsAgent }>();

const getAgents = (options: RequestFilteringAgentOptions) => {
  const cacheKey = JSON.stringify(options);
  if (agentCache.has(cacheKey)) {
    return agentCache.get(cacheKey)!;
  }

  const agents = {
    http: new RequestFilteringHttpAgent(options),
    https: new RequestFilteringHttpsAgent(options),
  };
  agentCache.set(cacheKey, agents);
  return agents;
};

/**
 * SSRF-safe fetch implementation for server-side use
 * Uses request-filtering-agent to prevent requests to private IP addresses
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param ssrfOptions - Optional per-call SSRF configuration overrides
 * @see https://lobehub.com/docs/self-hosting/environment-variables/basic#ssrf-allow-private-ip-address
 */
export const ssrfSafeFetch = async (
  url: string,
  options?: RequestInit,
  ssrfOptions?: SSRFOptions,
): Promise<Response> => {
  try {
    // Configure SSRF protection options with proper precedence using nullish coalescing
    const envAllowPrivate = process.env.SSRF_ALLOW_PRIVATE_IP_ADDRESS === '1';
    const allowPrivate = ssrfOptions?.allowPrivateIPAddress ?? envAllowPrivate;

    const agentOptions: RequestFilteringAgentOptions = {
      allowIPAddressList:
        ssrfOptions?.allowIPAddressList ??
        process.env.SSRF_ALLOW_IP_ADDRESS_LIST?.split(',').filter(Boolean) ??
        [],
      allowMetaIPAddress: allowPrivate,
      allowPrivateIPAddress: allowPrivate,
      denyIPAddressList: [],
    };

    const { http: httpAgent, https: httpsAgent } = getAgents(agentOptions);

    const mergedHeaders = {
      'User-Agent': 'LobeChat/1.0',
      'Accept': '*/*',
    };

    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          (mergedHeaders as any)[key] = value;
        });
      } else {
        Object.assign(mergedHeaders, options.headers);
      }
    }

    // Use node-fetch with SSRF protection agent
    // Pass a function to dynamically select agent based on URL protocol
    // This handles redirects from HTTP to HTTPS correctly
    const response = await fetch(url, {
      ...options,
      agent: (parsedURL: URL) => (parsedURL.protocol === 'https:' ? httpsAgent : httpAgent),
      // Add a default timeout of 30 seconds to prevent hanging requests
      timeout: 30_000,
      headers: mergedHeaders,
    } as any);

    // Convert node-fetch Response to standard Response
    // We read the body into an arrayBuffer to return a standard Response
    const buffer = await response.arrayBuffer();

    return new Response(buffer, {
      headers: response.headers as any,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    if ((error as any)?.code === 'ECONNRESET') {
      console.error('SSRF-safe fetch ECONNRESET error:', error);
    } else {
      console.error('SSRF-safe fetch error:', error);
    }
    throw new Error(
      `SSRF-safe fetch failed: ${error instanceof Error ? error.message : String(error)}. ` +
        'See: https://lobehub.com/docs/self-hosting/environment-variables/basic#ssrf-allow-private-ip-address',
    );
  }
};
