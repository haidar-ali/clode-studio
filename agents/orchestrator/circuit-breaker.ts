/**
 * Circuit Breaker - Prevents cascade failures by temporarily blocking requests
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  threshold?: number;        // Number of failures to trip
  timeout?: number;          // Time to wait before trying again (ms)
  successThreshold?: number; // Successes needed to close from half-open
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private nextAttemptTime?: number;
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private successThreshold: number = 2
  ) {}
  
  allowRequest(): boolean {
    if (this.state === 'closed') {
      return true;
    }
    
    if (this.state === 'open') {
      if (Date.now() >= (this.nextAttemptTime || 0)) {
        // Move to half-open to test if service recovered
        this.state = 'half-open';
        console.log('[CircuitBreaker] Moving to half-open state');
        return true;
      }
      return false;
    }
    
    // half-open - allow limited requests to test recovery
    return true;
  }
  
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        console.log('[CircuitBreaker] Circuit closed after recovery');
        this.reset();
      }
    } else {
      this.failures = 0;
    }
  }
  
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'half-open') {
      // Immediately trip again if failure in half-open
      console.log('[CircuitBreaker] Circuit re-opened from half-open');
      this.trip();
    } else if (this.failures >= this.threshold) {
      console.log(`[CircuitBreaker] Circuit opened after ${this.failures} failures`);
      this.trip();
    }
  }
  
  getStatus(): {
    state: CircuitState;
    failures: number;
    nextAttemptTime?: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      nextAttemptTime: this.nextAttemptTime
    };
  }
  
  private trip(): void {
    this.state = 'open';
    this.nextAttemptTime = Date.now() + this.timeout;
  }
  
  private reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
  }
}