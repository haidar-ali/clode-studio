/**
 * Hybrid Cache for Remote Mode
 * Extends RemoteMemoryCache to also check server for desktop features
 */
import { RemoteMemoryCache } from './RemoteMemoryCache.js';
import { RemoteDesktopFeaturesService } from './RemoteDesktopFeaturesService.js';

export class RemoteHybridCache extends RemoteMemoryCache {
  constructor(private desktopFeaturesService: RemoteDesktopFeaturesService) {
    super();
  }
  
  async get<T = any>(key: string): Promise<T | null> {
    // Check memory cache first
    const memoryResult = await super.get<T>(key);
    if (memoryResult !== null) {
      return memoryResult;
    }
    
    // For desktop feature keys, check the server
    if (key.startsWith('desktop:')) {
      
      
      try {
        const features = await this.desktopFeaturesService.getFeatures();
        if (!features) return null;
        
        // Map the key to the correct feature data
        switch (key) {
          case 'desktop:hooks:items':
            return { items: features.hooks || [], lastSync: features.lastSync } as T;
          case 'desktop:commands:all':
            return features.commands as T;
          case 'desktop:mcp:servers':
            return { servers: features.mcp?.servers || [], lastSync: features.lastSync } as T;
          default:
            return null;
        }
      } catch (error) {
        console.error(`[RemoteHybridCache] Failed to get ${key} from server:`, error);
        return null;
      }
    }
    
    return null;
  }
}