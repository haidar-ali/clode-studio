/**
 * Clode Studio Service Layer
 * Main entry point for all service abstractions
 */

// Export all interfaces
export * from './interfaces';

// Export service factory
export * from './ServiceFactory';

// Export providers (for advanced usage)
export * from './providers';

// Convenience function to get services
import { ServiceFactory } from './ServiceFactory';
import type { IServiceProvider } from './interfaces';

/**
 * Get the current service provider
 * This is the main function apps should use
 */
export async function getServices(): Promise<IServiceProvider> {
  return ServiceFactory.getInstance();
}