/**
 * Knowledge base service interface
 * Abstracts knowledge entry management and search
 */
export interface IKnowledgeService {
  // Entry management
  createEntry(entry: KnowledgeEntryInput): Promise<KnowledgeEntry>;
  updateEntry(id: string, updates: Partial<KnowledgeEntryInput>): Promise<KnowledgeEntry>;
  deleteEntry(id: string): Promise<void>;
  getEntry(id: string): Promise<KnowledgeEntry | null>;
  
  // Query operations
  listEntries(options?: ListOptions): Promise<KnowledgeEntry[]>;
  searchEntries(query: string, options?: SearchOptions): Promise<KnowledgeEntry[]>;
  getEntriesByTag(tag: string): Promise<KnowledgeEntry[]>;
  getRelatedEntries(id: string): Promise<KnowledgeEntry[]>;
  
  // Tag management
  getAllTags(): Promise<string[]>;
  renameTag(oldTag: string, newTag: string): Promise<void>;
  
  // Import/Export
  exportEntries(ids?: string[]): Promise<string>;
  importEntries(data: string): Promise<number>;
  
  // Statistics
  getStats(): Promise<KnowledgeStats>;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category?: string;
  created: Date;
  updated: Date;
  metadata?: Record<string, any>;
  userId?: string;
}

export interface KnowledgeEntryInput {
  title: string;
  content: string;
  tags?: string[];
  category?: string;
  metadata?: Record<string, any>;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'created' | 'updated' | 'title';
  sortOrder?: 'asc' | 'desc';
  category?: string;
  userId?: string;
}

export interface SearchOptions {
  limit?: number;
  fuzzy?: boolean;
  tags?: string[];
  category?: string;
}

export interface KnowledgeStats {
  totalEntries: number;
  totalTags: number;
  categories: Record<string, number>;
  recentEntries: number;
}