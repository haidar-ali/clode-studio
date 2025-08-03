/**
 * Device authentication service for secure remote connections
 */

export interface DeviceAuth {
  deviceId: string;
  token: string;
  name: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface DeviceConnectionInfo {
  url: string;
  deviceAuth: DeviceAuth;
  pairingCode: string;
}

export class DeviceAuthService {
  private static readonly TOKEN_LENGTH = 32;
  private static readonly PAIRING_CODE_LENGTH = 6;
  
  /**
   * Generate a new device token for authentication
   */
  static async generateDeviceToken(deviceName?: string): Promise<DeviceAuth> {
    const deviceId = await this.getDeviceId();
    const token = this.generateRandomHex(this.TOKEN_LENGTH);
    
    return {
      deviceId,
      token,
      name: deviceName || this.getDefaultDeviceName(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };
  }
  
  /**
   * Generate connection info including QR code data
   */
  static async generateConnectionInfo(
    serverUrl: string,
    deviceAuth: DeviceAuth
  ): Promise<DeviceConnectionInfo> {
    // Create a short pairing code for manual entry
    const pairingCode = this.generatePairingCode();
    
    // Build connection URL with auth info
    const url = new URL(serverUrl);
    url.searchParams.set('deviceId', deviceAuth.deviceId);
    url.searchParams.set('token', deviceAuth.token);
    url.searchParams.set('pairing', pairingCode);
    
    return {
      url: url.toString(),
      deviceAuth,
      pairingCode
    };
  }
  
  /**
   * Get a unique device identifier
   */
  private static async getDeviceId(): Promise<string> {
    // In Electron, we could use hardware ID
    // For now, generate a random ID and store it
    if (typeof window !== 'undefined' && window.localStorage) {
      let deviceId = localStorage.getItem('clode-device-id');
      if (!deviceId) {
        deviceId = this.generateRandomHex(16);
        localStorage.setItem('clode-device-id', deviceId);
      }
      return deviceId;
    }
    
    // Fallback for non-browser environments
    return this.generateRandomHex(16);
  }
  
  /**
   * Generate random hex string (browser-compatible)
   */
  private static generateRandomHex(byteLength: number): string {
    const array = new Uint8Array(byteLength);
    
    // Use crypto API if available (modern browsers and Node.js)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback to Math.random (less secure but works everywhere)
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    
    // Convert to hex string
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  /**
   * Get default device name based on platform
   */
  private static getDefaultDeviceName(): string {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const platform = window.electronAPI.app.getPlatform();
      return `${platform} Device`;
    }
    return 'Remote Device';
  }
  
  /**
   * Generate a short pairing code for manual entry
   */
  private static generatePairingCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing characters
    let code = '';
    for (let i = 0; i < this.PAIRING_CODE_LENGTH; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
  
  /**
   * Validate a device token
   */
  static validateToken(deviceAuth: DeviceAuth): boolean {
    // Check if token exists and hasn't expired
    if (!deviceAuth.token || !deviceAuth.deviceId) {
      return false;
    }
    
    if (deviceAuth.expiresAt && new Date() > deviceAuth.expiresAt) {
      return false;
    }
    
    return true;
  }
}