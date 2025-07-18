import { defineStore } from 'pinia';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import lunr from 'lunr';

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  markdown: string; // Full markdown with frontmatter
  metadata: {
    tags: string[];
    category: string;
    created: Date;
    updated: Date;
    priority?: 'high' | 'medium' | 'low';
    relatedFiles?: string[];
    aliases?: string[];
  };
  frontmatter: Record<string, any>;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  count: number;
}

export const useKnowledgeStore = defineStore('knowledge', {
  state: () => ({
    entries: [] as KnowledgeEntry[],
    categories: [
      { id: 'architecture', name: 'Architecture', icon: 'mdi:sitemap', color: '#007acc', count: 0 },
      { id: 'api', name: 'API Reference', icon: 'mdi:api', color: '#4ec9b0', count: 0 },
      { id: 'patterns', name: 'Design Patterns', icon: 'mdi:shape', color: '#dcdcaa', count: 0 },
      { id: 'troubleshooting', name: 'Troubleshooting', icon: 'mdi:bug', color: '#f48771', count: 0 },
      { id: 'notes', name: 'Notes', icon: 'mdi:note-text', color: '#c586c0', count: 0 },
      { id: 'other', name: 'Other', icon: 'mdi:file-document', color: '#858585', count: 0 }
    ] as KnowledgeCategory[],
    searchIndex: null as any, // Lunr search index
    isLoading: false,
    error: null as string | null,
    selectedEntryId: null as string | null,
    workspacePath: '' as string
  }),

  getters: {
    selectedEntry: (state) => {
      return state.entries.find(e => e.id === state.selectedEntryId);
    },

    entriesByCategory: (state) => {
      const grouped: Record<string, KnowledgeEntry[]> = {};
      state.entries.forEach(entry => {
        const category = entry.metadata.category || 'other';
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(entry);
      });
      return grouped;
    },

    allTags: (state) => {
      const tags = new Set<string>();
      state.entries.forEach(entry => {
        entry.metadata.tags.forEach(tag => tags.add(tag));
      });
      return Array.from(tags).sort();
    },

    getEntriesByTag: (state) => (tag: string) => {
      return state.entries.filter(entry => 
        entry.metadata.tags.includes(tag)
      );
    },

    getRelatedEntries: (state) => (entryId: string) => {
      const entry = state.entries.find(e => e.id === entryId);
      if (!entry) return [];

      // Find entries with similar tags or in same category
      return state.entries.filter(e => {
        if (e.id === entryId) return false;
        
        // Check for shared tags
        const sharedTags = e.metadata.tags.some(tag => 
          entry.metadata.tags.includes(tag)
        );
        
        // Check for same category
        const sameCategory = e.metadata.category === entry.metadata.category;
        
        return sharedTags || sameCategory;
      }).slice(0, 5); // Limit to 5 related entries
    }
  },

  actions: {
    async initialize(workspacePath: string) {
      this.workspacePath = workspacePath;
      await this.loadEntries();
    },
    
    async refreshEntries() {
      // Reload entries from disk
      await this.loadEntries();
    },

    async loadEntries() {
      try {
        this.isLoading = true;
        this.error = null;

        const knowledgePath = `${this.workspacePath}/.claude/knowledge`;
        
        // Check if knowledge directory exists
        const exists = await window.electronAPI.fs.exists(knowledgePath);
        if (!exists) {
          // Create the directory
          const ensureDirResult = await window.electronAPI.fs.ensureDir(knowledgePath);
          if (!ensureDirResult.success) {
            throw new Error(ensureDirResult.error || 'Failed to create knowledge directory');
          }
          // Create a sample entry
          await this.createSampleEntry();
        }

        // Read all markdown files in the knowledge directory
        const result = await window.electronAPI.fs.readDir(knowledgePath);
        if (!result.success || !result.files) {
          console.error('Failed to read knowledge directory:', result.error);
          return;
        }
        const mdFiles = result.files.filter((f: any) => f.name.endsWith('.md'));

        this.entries = [];
        
        for (const file of mdFiles) {
          const filePath = `${knowledgePath}/${file.name}`;
          const fileResult = await window.electronAPI.fs.readFile(filePath);
          
          if (!fileResult.success) {
            console.error(`Failed to read file ${filePath}:`, fileResult.error);
            continue;
          }
          
          const content = fileResult.content;
          
          // Parse markdown with frontmatter
          const { data, content: markdownContent } = matter(content);
          
          const entry: KnowledgeEntry = {
            id: data.id || file.name.replace('.md', ''),
            title: data.title || file.name.replace('.md', ''),
            content: markdownContent,
            markdown: content,
            metadata: {
              tags: data.tags || [],
              category: data.category || 'other',
              created: new Date(data.created || file.stats?.birthtime || Date.now()),
              updated: new Date(data.updated || file.stats?.mtime || Date.now()),
              priority: data.priority,
              relatedFiles: data.relatedFiles || [],
              aliases: data.aliases || []
            },
            frontmatter: data
          };
          
          this.entries.push(entry);
        }

        // Update category counts
        this.updateCategoryCounts();
        
        // Build search index
        await this.buildSearchIndex();
        
      } catch (error) {
        console.error('Failed to load knowledge entries:', error);
        this.error = error instanceof Error ? error.message : 'Failed to load entries';
      } finally {
        this.isLoading = false;
      }
    },

    async createEntry(data: {
      title: string;
      content: string;
      tags: string[];
      category: string;
      priority?: 'high' | 'medium' | 'low';
    }) {
      try {
        const id = uuidv4();
        const now = new Date().toISOString();
        
        const frontmatter: any = {
          id,
          title: data.title,
          tags: data.tags,
          category: data.category,
          created: now,
          updated: now
        };
        
        // Only add priority if it's defined
        if (data.priority) {
          frontmatter.priority = data.priority;
        }
        
        // Create markdown with frontmatter
        const markdown = matter.stringify(data.content, frontmatter);
        
        // Save to file
        const filePath = `${this.workspacePath}/.claude/knowledge/${id}.md`;
        const writeResult = await window.electronAPI.fs.writeFile(filePath, markdown);
        if (!writeResult.success) {
          throw new Error(writeResult.error || 'Failed to write file');
        }
        
        // Add to store
        const entry: KnowledgeEntry = {
          id,
          title: data.title,
          content: data.content,
          markdown,
          metadata: {
            tags: data.tags,
            category: data.category,
            created: new Date(now),
            updated: new Date(now),
            priority: data.priority
          },
          frontmatter
        };
        
        this.entries.push(entry);
        this.updateCategoryCounts();
        await this.buildSearchIndex();
        
        return entry;
      } catch (error) {
        console.error('Failed to create knowledge entry:', error);
        throw error;
      }
    },

    async updateEntry(id: string, updates: Partial<{
      title: string;
      content: string;
      tags: string[];
      category: string;
      priority?: 'high' | 'medium' | 'low';
    }>) {
      try {
        const entryIndex = this.entries.findIndex(e => e.id === id);
        if (entryIndex === -1) throw new Error('Entry not found');
        
        const entry = this.entries[entryIndex];
        const now = new Date().toISOString();
        
        // Update frontmatter
        const updatedFrontmatter: any = {
          ...entry.frontmatter,
          title: updates.title !== undefined ? updates.title : entry.frontmatter.title,
          tags: updates.tags !== undefined ? updates.tags : entry.frontmatter.tags,
          category: updates.category !== undefined ? updates.category : entry.frontmatter.category,
          updated: now
        };
        
        // Handle priority separately to avoid undefined
        if (updates.priority !== undefined) {
          updatedFrontmatter.priority = updates.priority;
        } else if (entry.frontmatter.priority) {
          updatedFrontmatter.priority = entry.frontmatter.priority;
        }
        
        // Update content if provided
        const content = updates.content !== undefined ? updates.content : entry.content;
        
        // Create new markdown
        const markdown = matter.stringify(content, updatedFrontmatter);
        
        // Save to file
        const filePath = `${this.workspacePath}/.claude/knowledge/${id}.md`;
        const writeResult = await window.electronAPI.fs.writeFile(filePath, markdown);
        if (!writeResult.success) {
          throw new Error(writeResult.error || 'Failed to write file');
        }
        
        // Update store
        const updatedEntry: KnowledgeEntry = {
          ...entry,
          title: updates.title || entry.title,
          content,
          markdown,
          metadata: {
            ...entry.metadata,
            tags: updates.tags || entry.metadata.tags,
            category: updates.category || entry.metadata.category,
            priority: updates.priority !== undefined ? updates.priority : entry.metadata.priority,
            updated: new Date(now)
          },
          frontmatter: updatedFrontmatter
        };
        
        this.entries[entryIndex] = updatedEntry;
        this.updateCategoryCounts();
        await this.buildSearchIndex();
        
        return updatedEntry;
      } catch (error) {
        console.error('Failed to update knowledge entry:', error);
        throw error;
      }
    },

    async deleteEntry(id: string) {
      try {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) throw new Error('Entry not found');
        
        // Delete file
        const filePath = `${this.workspacePath}/.claude/knowledge/${id}.md`;
        const deleteResult = await window.electronAPI.fs.delete(filePath);
        if (!deleteResult.success) {
          throw new Error(deleteResult.error || 'Failed to delete file');
        }
        
        // Remove from store
        this.entries.splice(index, 1);
        
        if (this.selectedEntryId === id) {
          this.selectedEntryId = null;
        }
        
        this.updateCategoryCounts();
        await this.buildSearchIndex();
      } catch (error) {
        console.error('Failed to delete knowledge entry:', error);
        throw error;
      }
    },

    selectEntry(id: string | null) {
      this.selectedEntryId = id;
    },

    async search(query: string) {
      if (!this.searchIndex || !query) return this.entries;
      
      try {
        const results = this.searchIndex.search(query);
        return results.map(result => 
          this.entries.find(e => e.id === result.ref)
        ).filter(Boolean);
      } catch (error) {
        console.error('Search failed:', error);
        return [];
      }
    },

    updateCategoryCounts() {
      // Reset counts
      this.categories.forEach(cat => cat.count = 0);
      
      // Count entries per category
      this.entries.forEach(entry => {
        const category = this.categories.find(c => c.id === entry.metadata.category);
        if (category) {
          category.count++;
        }
      });
    },

    async buildSearchIndex() {
      try {
        this.searchIndex = lunr(function() {
          this.ref('id');
          this.field('title', { boost: 10 });
          this.field('content', { boost: 5 });
          this.field('tags', { boost: 8 });
          this.field('category', { boost: 3 });
          this.field('aliases', { boost: 7 });

          // Add documents to index
          useKnowledgeStore().entries.forEach(entry => {
            this.add({
              id: entry.id,
              title: entry.title,
              content: entry.content,
              tags: entry.metadata.tags.join(' '),
              category: entry.metadata.category,
              aliases: (entry.metadata.aliases || []).join(' ')
            });
          });
        });
      } catch (error) {
        console.error('Failed to build search index:', error);
      }
    },

    async createSampleEntry() {
      const sampleContent = `# Welcome to Claude Code IDE Knowledge Base

This is your personal knowledge base where you can store project-specific information, documentation, and notes that Claude can reference.

## How to Use

1. **Create entries** - Add new knowledge entries for different aspects of your project
2. **Tag entries** - Use tags to organize and categorize your knowledge
3. **Reference in chat** - Claude can access this knowledge to provide better assistance
4. **Search** - Quickly find information using the search feature

## Example Use Cases

- API documentation and endpoints
- Architecture decisions and patterns
- Common troubleshooting solutions
- Project-specific conventions
- Team knowledge and processes`;

      await this.createEntry({
        title: 'Getting Started',
        content: sampleContent,
        tags: ['documentation', 'guide'],
        category: 'notes',
        priority: 'high'
      });
    }
  }
});