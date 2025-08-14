/**
 * Token generation utilities for headless mode connections
 */
import { randomBytes } from 'crypto';
/**
 * Generate a secure random token
 */
export function generateToken() {
    return randomBytes(32).toString('hex');
}
/**
 * Generate a device ID
 */
export function generateDeviceId() {
    return randomBytes(16).toString('hex');
}
/**
 * Generate a pairing code (6 uppercase alphanumeric characters)
 */
export function generatePairingCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Remove confusing chars
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
