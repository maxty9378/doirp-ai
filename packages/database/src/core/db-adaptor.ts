import type { LobeChatDatabase } from '../type';
import { getDBInstance } from './web-server';

/**
 * Lazy-load database instance
 * Avoid initializing the database every time the module is imported
 */
let cachedDB: LobeChatDatabase | null = null;

function getCachedOrNewDB(): LobeChatDatabase {
  if (cachedDB) return cachedDB;
  try {
    cachedDB = getDBInstance();
    return cachedDB;
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
}

export const getServerDB = async (): Promise<LobeChatDatabase> => {
  return getCachedOrNewDB();
};

/**
 * Synchronous DB access for code that cannot await (e.g. Better Auth adapter).
 * Lazy: first use initializes the connection (after env is loaded).
 */
export const serverDB = new Proxy({} as LobeChatDatabase, {
  get(_, prop) {
    return (getCachedOrNewDB() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
