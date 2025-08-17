/**
 * Cost Tracking and Budget Management
 * Monitors spending across all providers and enforces budget limits
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export interface CostEntry {
  id: string;
  timestamp: string;
  agentId: string;
  taskId?: string;
  epicId?: string;
  storyId?: string;
  pipelineId?: string;
  provider: string;
  model: string;
  tokensUsed: number;
  cost: number;
  phase: string;
  traceId?: string;
}

export interface BudgetConfig {
  dailyLimit: number;
  monthlyLimit: number;
  perExecutionLimit: number;
  perAgentDailyLimit: number;
  alertThresholds: {
    daily: number; // percentage (e.g., 80 for 80%)
    monthly: number;
    perExecution: number;
  };
}

export interface CostSummary {
  dailySpent: number;
  monthlySpent: number;
  totalSpent: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  byProvider: Record<string, number>;
  byAgent: Record<string, number>;
  byDate: Record<string, number>;
}

export interface BudgetAlert {
  type: 'daily' | 'monthly' | 'execution' | 'agent';
  severity: 'warning' | 'critical' | 'blocked';
  message: string;
  currentSpent: number;
  limit: number;
  percentage: number;
  timestamp: string;
}

export class CostTracker {
  private workspacePath: string;
  private costLogPath: string;
  private budgetConfigPath: string;
  private costEntries: CostEntry[] = [];
  private budgetConfig: BudgetConfig;
  private alerts: BudgetAlert[] = [];

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.costLogPath = path.join(workspacePath, '.claude', 'monitoring', 'cost-log.json');
    this.budgetConfigPath = path.join(workspacePath, '.claude', 'monitoring', 'budget-config.json');
    
    // Default budget configuration
    this.budgetConfig = {
      dailyLimit: 50.0,
      monthlyLimit: 1500.0,
      perExecutionLimit: 5.0,
      perAgentDailyLimit: 20.0,
      alertThresholds: {
        daily: 80,
        monthly: 85,
        perExecution: 90
      }
    };
  }

  async initialize(): Promise<void> {
    try {
      // Ensure monitoring directory exists
      const monitoringDir = path.dirname(this.costLogPath);
      await fs.ensureDir(monitoringDir);

      // Load existing cost entries
      await this.loadCostEntries();
      
      // Load budget configuration
      await this.loadBudgetConfig();

      console.log('[CostTracker] Initialized successfully');
    } catch (error) {
      console.error('[CostTracker] Initialization failed:', error);
      throw error;
    }
  }

  private async loadCostEntries(): Promise<void> {
    try {
      if (await fs.pathExists(this.costLogPath)) {
        const data = await fs.readJson(this.costLogPath);
        this.costEntries = Array.isArray(data.entries) ? data.entries : [];
        console.log(`[CostTracker] Loaded ${this.costEntries.length} cost entries`);
      }
    } catch (error) {
      console.error('[CostTracker] Failed to load cost entries:', error);
      this.costEntries = [];
    }
  }

  private async loadBudgetConfig(): Promise<void> {
    try {
      if (await fs.pathExists(this.budgetConfigPath)) {
        const config = await fs.readJson(this.budgetConfigPath);
        this.budgetConfig = { ...this.budgetConfig, ...config };
      } else {
        // Save default config
        await this.saveBudgetConfig();
      }
      console.log('[CostTracker] Budget config loaded:', this.budgetConfig);
    } catch (error) {
      console.error('[CostTracker] Failed to load budget config:', error);
    }
  }

  async saveBudgetConfig(): Promise<void> {
    try {
      await fs.writeJson(this.budgetConfigPath, this.budgetConfig, { spaces: 2 });
    } catch (error) {
      console.error('[CostTracker] Failed to save budget config:', error);
    }
  }

  async recordCost(entry: Omit<CostEntry, 'id' | 'timestamp'>): Promise<void> {
    const costEntry: CostEntry = {
      ...entry,
      id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    this.costEntries.push(costEntry);

    // Check budget limits and generate alerts
    await this.checkBudgetLimits(costEntry);

    // Save to disk
    await this.saveCostEntries();

    console.log(`[CostTracker] Recorded cost: $${entry.cost.toFixed(4)} for ${entry.agentId}`);
  }

  private async saveCostEntries(): Promise<void> {
    try {
      const data = {
        entries: this.costEntries,
        lastUpdated: new Date().toISOString()
      };
      await fs.writeJson(this.costLogPath, data, { spaces: 2 });
    } catch (error) {
      console.error('[CostTracker] Failed to save cost entries:', error);
    }
  }

  private async checkBudgetLimits(entry: CostEntry): Promise<void> {
    const summary = this.getSummary();
    const now = new Date().toISOString();

    // Check daily limit
    const dailyPercentage = (summary.dailySpent / this.budgetConfig.dailyLimit) * 100;
    if (dailyPercentage >= this.budgetConfig.alertThresholds.daily) {
      this.alerts.push({
        type: 'daily',
        severity: dailyPercentage >= 100 ? 'blocked' : dailyPercentage >= 95 ? 'critical' : 'warning',
        message: `Daily budget at ${dailyPercentage.toFixed(1)}% ($${summary.dailySpent.toFixed(2)}/$${this.budgetConfig.dailyLimit})`,
        currentSpent: summary.dailySpent,
        limit: this.budgetConfig.dailyLimit,
        percentage: dailyPercentage,
        timestamp: now
      });
    }

    // Check monthly limit
    const monthlyPercentage = (summary.monthlySpent / this.budgetConfig.monthlyLimit) * 100;
    if (monthlyPercentage >= this.budgetConfig.alertThresholds.monthly) {
      this.alerts.push({
        type: 'monthly',
        severity: monthlyPercentage >= 100 ? 'blocked' : monthlyPercentage >= 95 ? 'critical' : 'warning',
        message: `Monthly budget at ${monthlyPercentage.toFixed(1)}% ($${summary.monthlySpent.toFixed(2)}/$${this.budgetConfig.monthlyLimit})`,
        currentSpent: summary.monthlySpent,
        limit: this.budgetConfig.monthlyLimit,
        percentage: monthlyPercentage,
        timestamp: now
      });
    }

    // Check per-execution limit
    if (entry.cost >= this.budgetConfig.perExecutionLimit * (this.budgetConfig.alertThresholds.perExecution / 100)) {
      this.alerts.push({
        type: 'execution',
        severity: entry.cost >= this.budgetConfig.perExecutionLimit ? 'blocked' : 'warning',
        message: `High execution cost: $${entry.cost.toFixed(4)} (limit: $${this.budgetConfig.perExecutionLimit})`,
        currentSpent: entry.cost,
        limit: this.budgetConfig.perExecutionLimit,
        percentage: (entry.cost / this.budgetConfig.perExecutionLimit) * 100,
        timestamp: now
      });
    }

    // Check per-agent daily limit
    const agentDailyCost = summary.byAgent[entry.agentId] || 0;
    const agentPercentage = (agentDailyCost / this.budgetConfig.perAgentDailyLimit) * 100;
    if (agentPercentage >= this.budgetConfig.alertThresholds.daily) {
      this.alerts.push({
        type: 'agent',
        severity: agentPercentage >= 100 ? 'blocked' : agentPercentage >= 95 ? 'critical' : 'warning',
        message: `Agent ${entry.agentId} daily budget at ${agentPercentage.toFixed(1)}% ($${agentDailyCost.toFixed(2)}/$${this.budgetConfig.perAgentDailyLimit})`,
        currentSpent: agentDailyCost,
        limit: this.budgetConfig.perAgentDailyLimit,
        percentage: agentPercentage,
        timestamp: now
      });
    }

    // Keep only recent alerts (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    this.alerts = this.alerts.filter(alert => alert.timestamp > oneDayAgo);
  }

  getSummary(): CostSummary {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const dailyEntries = this.costEntries.filter(entry => entry.timestamp >= todayStart);
    const monthlyEntries = this.costEntries.filter(entry => entry.timestamp >= monthStart);

    const dailySpent = dailyEntries.reduce((sum, entry) => sum + entry.cost, 0);
    const monthlySpent = monthlyEntries.reduce((sum, entry) => sum + entry.cost, 0);
    const totalSpent = this.costEntries.reduce((sum, entry) => sum + entry.cost, 0);

    // Group by provider
    const byProvider: Record<string, number> = {};
    dailyEntries.forEach(entry => {
      byProvider[entry.provider] = (byProvider[entry.provider] || 0) + entry.cost;
    });

    // Group by agent
    const byAgent: Record<string, number> = {};
    dailyEntries.forEach(entry => {
      byAgent[entry.agentId] = (byAgent[entry.agentId] || 0) + entry.cost;
    });

    // Group by date (last 7 days)
    const byDate: Record<string, number> = {};
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    this.costEntries
      .filter(entry => new Date(entry.timestamp) >= sevenDaysAgo)
      .forEach(entry => {
        const date = entry.timestamp.split('T')[0];
        byDate[date] = (byDate[date] || 0) + entry.cost;
      });

    return {
      dailySpent,
      monthlySpent,
      totalSpent,
      dailyRemaining: Math.max(0, this.budgetConfig.dailyLimit - dailySpent),
      monthlyRemaining: Math.max(0, this.budgetConfig.monthlyLimit - monthlySpent),
      byProvider,
      byAgent,
      byDate
    };
  }

  getRecentAlerts(hours: number = 24): BudgetAlert[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    return this.alerts.filter(alert => alert.timestamp > cutoff);
  }

  canExecute(agentId: string, estimatedCost: number): { allowed: boolean; reason?: string } {
    const summary = this.getSummary();

    // Check daily budget
    if (summary.dailySpent + estimatedCost > this.budgetConfig.dailyLimit) {
      return {
        allowed: false,
        reason: `Would exceed daily budget: $${(summary.dailySpent + estimatedCost).toFixed(2)} > $${this.budgetConfig.dailyLimit}`
      };
    }

    // Check monthly budget
    if (summary.monthlySpent + estimatedCost > this.budgetConfig.monthlyLimit) {
      return {
        allowed: false,
        reason: `Would exceed monthly budget: $${(summary.monthlySpent + estimatedCost).toFixed(2)} > $${this.budgetConfig.monthlyLimit}`
      };
    }

    // Check per-execution limit
    if (estimatedCost > this.budgetConfig.perExecutionLimit) {
      return {
        allowed: false,
        reason: `Execution cost too high: $${estimatedCost.toFixed(4)} > $${this.budgetConfig.perExecutionLimit}`
      };
    }

    // Check agent daily limit
    const agentDailyCost = summary.byAgent[agentId] || 0;
    if (agentDailyCost + estimatedCost > this.budgetConfig.perAgentDailyLimit) {
      return {
        allowed: false,
        reason: `Would exceed agent daily budget: $${(agentDailyCost + estimatedCost).toFixed(2)} > $${this.budgetConfig.perAgentDailyLimit}`
      };
    }

    return { allowed: true };
  }

  updateBudgetConfig(updates: Partial<BudgetConfig>): void {
    this.budgetConfig = { ...this.budgetConfig, ...updates };
    this.saveBudgetConfig();
  }

  getBudgetConfig(): BudgetConfig {
    return { ...this.budgetConfig };
  }

  getCostEntries(limit?: number): CostEntry[] {
    const entries = [...this.costEntries].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return limit ? entries.slice(0, limit) : entries;
  }

  clearAlerts(): void {
    this.alerts = [];
  }
}