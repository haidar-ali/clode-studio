/**
 * Rate Limiter - Token bucket implementation for TPM/RPM limits
 */

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private capacity: number,
    private refillRate: number, // tokens per interval
    private interval: number = 1000 // milliseconds
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  tryAcquire(amount: number = 1, dryRun: boolean = false): boolean {
    this.refill();
    
    if (this.tokens >= amount) {
      if (!dryRun) {
        this.tokens -= amount;
      }
      return true;
    }
    
    return false;
  }
  
  getAvailable(): number {
    this.refill();
    return this.tokens;
  }
  
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refillAmount = (elapsed / this.interval) * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + refillAmount);
    this.lastRefill = now;
  }
}

/**
 * Dual Rate Limiter - Enforces both TPM and RPM limits
 */
export class DualRateLimiter {
  private tpmLimiter: TokenBucket;
  private rpmLimiter: TokenBucket;
  
  constructor(
    tpm: number, // Tokens per minute
    rpm: number  // Requests per minute
  ) {
    // Refill per second for smoother rate limiting
    this.tpmLimiter = new TokenBucket(tpm, tpm / 60, 1000);
    this.rpmLimiter = new TokenBucket(rpm, rpm / 60, 1000);
  }
  
  tryAcquire(tokens: number, dryRun: boolean = false): boolean {
    // Check both limits
    const tpmOk = this.tpmLimiter.tryAcquire(tokens, true);
    const rpmOk = this.rpmLimiter.tryAcquire(1, true);
    
    if (tpmOk && rpmOk) {
      if (!dryRun) {
        this.tpmLimiter.tryAcquire(tokens);
        this.rpmLimiter.tryAcquire(1);
      }
      return true;
    }
    
    return false;
  }
  
  getAvailableTokens(): number {
    return Math.min(
      this.tpmLimiter.getAvailable(),
      this.rpmLimiter.getAvailable() * 1000 // Rough estimate
    );
  }
  
  getAvailableRequests(): number {
    return this.rpmLimiter.getAvailable();
  }
}