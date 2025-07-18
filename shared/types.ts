export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'done' | 'pending' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  createdAt: Date;
  updatedAt: Date;
}

export interface EnhancedTask extends Task {
  // Metadata
  type: 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'research';
  assignee: 'claude' | 'user' | 'both';
  branch?: string;
  
  // Breakdown
  phases: TaskPhase[];
  
  // Context
  keyDecisions: string[];
  implementationNotes: string[];
  knownIssues: string[];
  
  // Progress tracking
  progressLog: ProgressEntry[];
  filesModified: string[];
  
  // State
  completedAt?: Date;
  startedAt?: Date;
  estimatedHours?: number;
  actualHours?: number;
  
  // Claudedocs integration
  claudedocsPath?: string;
}

export interface TaskPhase {
  name: string;
  items: TaskItem[];
}

export interface TaskItem {
  text: string;
  completed: boolean;
  completedAt?: Date;
}

export interface ProgressEntry {
  date: Date;
  session: number;
  notes: string[];
  filesModified: string[];
  nextSteps: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  error?: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  expanded?: boolean;
}

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  content: string;
  language?: string;
  isDirty: boolean;
}

export interface MCPConnection {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  tools?: string[];
  error?: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContextInfo {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  files: string[];
}