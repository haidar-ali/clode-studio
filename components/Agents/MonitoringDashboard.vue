<template>
  <div class="monitoring-dashboard">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-left">
        <h3>Agent Monitoring</h3>
        <span class="badge" :class="getBadgeClass()">{{ getStatusText() }}</span>
      </div>
      <div class="header-right">
        <button @click="refreshData" class="btn-icon" :disabled="isRefreshing">
          <Icon name="mdi:refresh" :class="{ spinning: isRefreshing }" />
        </button>
        <button @click="showBudgetConfig = true" class="btn-secondary">
          <Icon name="mdi:cog" /> Budget Settings
        </button>
        <button @click="clearAlerts" class="btn-secondary">
          <Icon name="mdi:bell-off" /> Clear Alerts
        </button>
      </div>
    </div>

    <!-- Alerts Section -->
    <div v-if="alerts.length > 0" class="alerts-section">
      <div class="section-title">
        <Icon name="mdi:alert-circle" />
        Active Alerts ({{ alerts.length }})
      </div>
      <div class="alert-list">
        <div 
          v-for="alert in alerts" 
          :key="alert.timestamp"
          class="alert-item"
          :class="`alert-${alert.severity}`"
        >
          <Icon :name="getAlertIcon(alert.severity)" />
          <div class="alert-content">
            <div class="alert-message">{{ alert.message }}</div>
            <div class="alert-meta">
              {{ alert.type }} • {{ formatTime(alert.timestamp) }}
            </div>
          </div>
          <div class="alert-percentage">
            {{ alert.percentage.toFixed(1) }}%
          </div>
        </div>
      </div>
    </div>

    <!-- Budget Overview -->
    <div class="budget-section">
      <div class="section-title">
        <Icon name="mdi:cash" />
        Budget Overview
      </div>
      
      <div class="budget-cards">
        <div class="budget-card">
          <div class="budget-header">
            <span class="budget-label">Daily</span>
            <span class="budget-amount">${{ costSummary.dailySpent.toFixed(2) }} / ${{ budgetConfig.dailyLimit }}</span>
          </div>
          <div class="budget-bar">
            <div 
              class="budget-fill"
              :class="getBudgetBarClass(costSummary.dailySpent, budgetConfig.dailyLimit)"
              :style="{ width: `${Math.min(100, (costSummary.dailySpent / budgetConfig.dailyLimit) * 100)}%` }"
            ></div>
          </div>
          <div class="budget-remaining">
            ${{ costSummary.dailyRemaining.toFixed(2) }} remaining
          </div>
        </div>

        <div class="budget-card">
          <div class="budget-header">
            <span class="budget-label">Monthly</span>
            <span class="budget-amount">${{ costSummary.monthlySpent.toFixed(2) }} / ${{ budgetConfig.monthlyLimit }}</span>
          </div>
          <div class="budget-bar">
            <div 
              class="budget-fill"
              :class="getBudgetBarClass(costSummary.monthlySpent, budgetConfig.monthlyLimit)"
              :style="{ width: `${Math.min(100, (costSummary.monthlySpent / budgetConfig.monthlyLimit) * 100)}%` }"
            ></div>
          </div>
          <div class="budget-remaining">
            ${{ costSummary.monthlyRemaining.toFixed(2) }} remaining
          </div>
        </div>
      </div>
    </div>

    <!-- Cost Breakdown -->
    <div class="breakdown-section">
      <div class="section-title">
        <Icon name="mdi:chart-pie" />
        Cost Breakdown (Today)
      </div>
      
      <div class="breakdown-grid">
        <!-- By Provider -->
        <div class="breakdown-card">
          <h4>By Provider</h4>
          <div class="breakdown-list">
            <div 
              v-for="(cost, provider) in costSummary.byProvider" 
              :key="provider"
              class="breakdown-item"
            >
              <span class="breakdown-label">{{ provider }}</span>
              <span class="breakdown-value">${{ cost.toFixed(3) }}</span>
            </div>
            <div v-if="Object.keys(costSummary.byProvider).length === 0" class="no-data">
              No usage today
            </div>
          </div>
        </div>

        <!-- By Agent -->
        <div class="breakdown-card">
          <h4>By Agent</h4>
          <div class="breakdown-list">
            <div 
              v-for="(cost, agent) in costSummary.byAgent" 
              :key="agent"
              class="breakdown-item"
            >
              <span class="breakdown-label">{{ getAgentDisplayName(agent) }}</span>
              <span class="breakdown-value">${{ cost.toFixed(3) }}</span>
            </div>
            <div v-if="Object.keys(costSummary.byAgent).length === 0" class="no-data">
              No usage today
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Executions -->
    <div class="executions-section">
      <div class="section-title">
        <Icon name="mdi:history" />
        Recent Executions
      </div>
      
      <div class="executions-table">
        <div class="table-header">
          <span>Time</span>
          <span>Agent</span>
          <span>Provider</span>
          <span>Tokens</span>
          <span>Cost</span>
        </div>
        <div class="table-body">
          <div 
            v-for="entry in recentExecutions" 
            :key="entry.id"
            class="table-row"
          >
            <span class="execution-time">{{ formatTime(entry.timestamp) }}</span>
            <span class="execution-agent">{{ getAgentDisplayName(entry.agentId) }}</span>
            <span class="execution-provider">{{ entry.provider }}:{{ entry.model }}</span>
            <span class="execution-tokens">{{ entry.tokensUsed.toLocaleString() }}</span>
            <span class="execution-cost">${{ entry.cost.toFixed(4) }}</span>
          </div>
          <div v-if="recentExecutions.length === 0" class="no-data">
            No recent executions
          </div>
        </div>
      </div>
    </div>

    <!-- Budget Configuration Modal -->
    <Teleport to="body">
      <div v-if="showBudgetConfig" class="modal-overlay" @click="showBudgetConfig = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Budget Configuration</h3>
            <button @click="showBudgetConfig = false" class="btn-icon">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="form-group">
              <label>Daily Limit ($)</label>
              <input 
                v-model.number="budgetForm.dailyLimit" 
                type="number" 
                step="0.1"
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label>Monthly Limit ($)</label>
              <input 
                v-model.number="budgetForm.monthlyLimit" 
                type="number" 
                step="1"
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label>Per Execution Limit ($)</label>
              <input 
                v-model.number="budgetForm.perExecutionLimit" 
                type="number" 
                step="0.1"
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label>Per Agent Daily Limit ($)</label>
              <input 
                v-model.number="budgetForm.perAgentDailyLimit" 
                type="number" 
                step="0.1"
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label>Alert Thresholds</label>
              <div class="threshold-inputs">
                <div class="threshold-item">
                  <label>Daily (%)</label>
                  <input 
                    v-model.number="budgetForm.alertThresholds.daily" 
                    type="number" 
                    min="0" 
                    max="100"
                    class="form-input"
                  />
                </div>
                <div class="threshold-item">
                  <label>Monthly (%)</label>
                  <input 
                    v-model.number="budgetForm.alertThresholds.monthly" 
                    type="number" 
                    min="0" 
                    max="100"
                    class="form-input"
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div class="modal-footer">
            <button @click="showBudgetConfig = false" class="btn-secondary">
              Cancel
            </button>
            <button @click="saveBudgetConfig" class="btn-primary">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { BudgetAlert, CostSummary, BudgetConfig, CostEntry } from '~/agents/monitoring/cost-tracker';

// State
const isRefreshing = ref(false);
const showBudgetConfig = ref(false);
const alerts = ref<BudgetAlert[]>([]);
const costSummary = ref<CostSummary>({
  dailySpent: 0,
  monthlySpent: 0,
  totalSpent: 0,
  dailyRemaining: 0,
  monthlyRemaining: 0,
  byProvider: {},
  byAgent: {},
  byDate: {}
});
const budgetConfig = ref<BudgetConfig>({
  dailyLimit: 50,
  monthlyLimit: 1500,
  perExecutionLimit: 5,
  perAgentDailyLimit: 20,
  alertThresholds: {
    daily: 80,
    monthly: 85,
    perExecution: 90
  }
});
const budgetForm = ref<BudgetConfig>({ ...budgetConfig.value });
const recentExecutions = ref<CostEntry[]>([]);

// Auto-refresh interval
let refreshInterval: number | null = null;

// Methods
async function refreshData() {
  if (isRefreshing.value) return;
  
  isRefreshing.value = true;
  try {
    // Use electron API to get monitoring data
    if (window.electronAPI?.monitoring) {
      const [alertsResult, summaryResult, configResult, executionsResult] = await Promise.all([
        window.electronAPI.monitoring.executeTask('getRecentAlerts', {}),
        window.electronAPI.monitoring.executeTask('getCostSummary', {}),
        window.electronAPI.monitoring.executeTask('getBudgetConfig', {}),
        window.electronAPI.monitoring.executeTask('getRecentExecutions', { limit: 20 })
      ]);
      
      if (alertsResult.success) alerts.value = alertsResult.alerts || [];
      if (summaryResult.success) costSummary.value = summaryResult.summary || costSummary.value;
      if (configResult.success) budgetConfig.value = configResult.config || budgetConfig.value;
      if (executionsResult.success) recentExecutions.value = executionsResult.executions || [];
    }
  } catch (error) {
    console.error('Failed to refresh monitoring data:', error);
  } finally {
    isRefreshing.value = false;
  }
}

async function clearAlerts() {
  try {
    if (window.electronAPI?.monitoring) {
      await window.electronAPI.monitoring.executeTask('clearAlerts', {});
      alerts.value = [];
    }
  } catch (error) {
    console.error('Failed to clear alerts:', error);
  }
}

async function saveBudgetConfig() {
  try {
    if (window.electronAPI?.monitoring) {
      const result = await window.electronAPI.monitoring.executeTask('updateBudgetConfig', {
        config: budgetForm.value
      });
      
      if (result.success) {
        budgetConfig.value = { ...budgetForm.value };
        showBudgetConfig.value = false;
        await refreshData(); // Refresh to show updated data
      }
    }
  } catch (error) {
    console.error('Failed to save budget config:', error);
  }
}

// Helper functions
function getBadgeClass() {
  const criticalAlerts = alerts.value.filter(a => a.severity === 'critical' || a.severity === 'blocked');
  const warningAlerts = alerts.value.filter(a => a.severity === 'warning');
  
  if (criticalAlerts.length > 0) return 'badge-error';
  if (warningAlerts.length > 0) return 'badge-warning';
  return 'badge-success';
}

function getStatusText() {
  const criticalAlerts = alerts.value.filter(a => a.severity === 'critical' || a.severity === 'blocked');
  const warningAlerts = alerts.value.filter(a => a.severity === 'warning');
  
  if (criticalAlerts.length > 0) return 'Critical';
  if (warningAlerts.length > 0) return 'Warning';
  return 'Healthy';
}

function getAlertIcon(severity: string) {
  switch (severity) {
    case 'blocked': return 'mdi:stop-circle';
    case 'critical': return 'mdi:alert-circle';
    case 'warning': return 'mdi:alert';
    default: return 'mdi:information';
  }
}

function getBudgetBarClass(spent: number, limit: number) {
  const percentage = (spent / limit) * 100;
  if (percentage >= 100) return 'budget-blocked';
  if (percentage >= 90) return 'budget-critical';
  if (percentage >= 80) return 'budget-warning';
  return 'budget-ok';
}

function getAgentDisplayName(agentId: string): string {
  const nameMap: Record<string, string> = {
    architect: 'Architect',
    developer: 'Developer',
    qa: 'QA Engineer',
    'kb-builder': 'KB Builder',
    taskmaster: 'Task Master'
  };
  return nameMap[agentId] || agentId;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

// Lifecycle
onMounted(async () => {
  budgetForm.value = { ...budgetConfig.value };
  await refreshData();
  
  // Set up auto-refresh every 30 seconds
  refreshInterval = window.setInterval(refreshData, 30000);
});

onUnmounted(() => {
  if (refreshInterval) {
    window.clearInterval(refreshInterval);
  }
});
</script>

<style scoped>
.monitoring-dashboard {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #cccccc;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #252526;
  border-bottom: 1px solid #181818;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-success { background: rgba(78, 201, 176, 0.2); color: #4ec9b0; }
.badge-warning { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
.badge-error { background: rgba(205, 49, 49, 0.2); color: #cd3131; }

.header-right {
  display: flex;
  gap: 8px;
}

.alerts-section,
.budget-section,
.breakdown-section,
.executions-section {
  padding: 16px;
  border-bottom: 1px solid #181818;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #ffffff;
  font-size: 13px;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
  border-left: 4px solid;
}

.alert-warning { background: rgba(255, 193, 7, 0.1); border-left-color: #ffc107; }
.alert-critical { background: rgba(205, 49, 49, 0.1); border-left-color: #cd3131; }
.alert-blocked { background: rgba(139, 69, 19, 0.1); border-left-color: #8b4513; }

.alert-content {
  flex: 1;
}

.alert-message {
  font-weight: 500;
  font-size: 13px;
}

.alert-meta {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.alert-percentage {
  font-weight: 600;
  font-size: 13px;
}

.budget-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.budget-card {
  padding: 12px;
  background: #252526;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
}

.budget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.budget-label {
  font-weight: 600;
  font-size: 12px;
  color: #ffffff;
}

.budget-amount {
  font-size: 11px;
  color: #999;
}

.budget-bar {
  height: 6px;
  background: #3c3c3c;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}

.budget-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.budget-ok { background: #4ec9b0; }
.budget-warning { background: #ffc107; }
.budget-critical { background: #ff6b6b; }
.budget-blocked { background: #cd3131; }

.budget-remaining {
  font-size: 11px;
  color: #007acc;
  font-weight: 500;
}

.breakdown-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.breakdown-card {
  padding: 12px;
  background: #252526;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
}

.breakdown-card h4 {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #ffffff;
}

.breakdown-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}

.breakdown-label {
  color: #cccccc;
}

.breakdown-value {
  color: #007acc;
  font-weight: 600;
}

.executions-table {
  background: #252526;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
  overflow: hidden;
}

.table-header {
  display: grid;
  grid-template-columns: 80px 100px 120px 80px 80px;
  gap: 12px;
  padding: 8px 12px;
  background: #2d2d30;
  font-weight: 600;
  font-size: 11px;
  color: #ffffff;
  border-bottom: 1px solid #3c3c3c;
}

.table-body {
  max-height: 200px;
  overflow-y: auto;
}

.table-row {
  display: grid;
  grid-template-columns: 80px 100px 120px 80px 80px;
  gap: 12px;
  padding: 8px 12px;
  font-size: 11px;
  border-bottom: 1px solid #3c3c3c;
}

.table-row:last-child {
  border-bottom: none;
}

.execution-time { color: #999; }
.execution-agent { color: #cccccc; }
.execution-provider { color: #999; }
.execution-tokens { color: #007acc; text-align: right; }
.execution-cost { color: #4ec9b0; font-weight: 600; text-align: right; }

.no-data {
  color: #999;
  font-style: italic;
  text-align: center;
  padding: 12px;
  font-size: 12px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Button styles */
.btn-primary,
.btn-secondary,
.btn-icon {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.btn-primary {
  background: #007acc;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #005a9e;
}

.btn-secondary {
  background: #3c3c3c;
  color: #cccccc;
}

.btn-secondary:hover:not(:disabled) {
  background: #4c4c4c;
}

.btn-icon {
  padding: 6px;
  background: transparent;
  color: #cccccc;
}

.btn-icon:hover:not(:disabled) {
  background: #3c3c3c;
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #1e1e1e;
  border-radius: 6px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid #333;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #181818;
  background: #252526;
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 12px;
  color: #cccccc;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
}

.form-input:focus {
  outline: none;
  border-color: #007acc;
}

.threshold-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.threshold-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.threshold-item label {
  font-size: 11px;
  margin-bottom: 2px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #181818;
  background: #252526;
}
</style>