import simpleGit, { SimpleGit, DefaultLogFields } from 'simple-git';
import * as path from 'path';
import { 
  GitTimelineCommit, 
  GitBranch, 
  GitTag, 
  GitTimelineData,
  TimelineFilter 
} from './types/git-timeline';

export class GitTimelineService {
  private git: SimpleGit;
  private workspacePath: string;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.git = simpleGit(workspacePath);
  }

  /**
   * Ensure data is serializable for IPC
   */
  private toSerializable(obj: any): any {
    try {
      // Parse and stringify to ensure it's serializable
      return JSON.parse(JSON.stringify(obj));
    } catch (error) {
      console.error('[GitTimelineService] Failed to serialize:', error);
      return null;
    }
  }

  /**
   * Get complete timeline data for visualization
   */
  async getTimelineData(filter?: TimelineFilter): Promise<GitTimelineData> {
    const cacheKey = JSON.stringify(filter || {});
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      console.log('[GitTimelineService] Getting timeline data for:', this.workspacePath);
      
      // Get all data in parallel
      const [commits, branches, tags, status, remotes] = await Promise.all([
        this.getCommits(filter),
        this.getBranches(),
        this.getTags(),
        this.git.status(),
        this.git.getRemotes(true)
      ]);

      const data: GitTimelineData = {
        commits,
        branches,
        tags,
        head: String(status.current || 'HEAD'),
        remotes: remotes.map(r => String(r.name))
      };

      console.log('[GitTimelineService] Timeline data:', {
        commitsCount: commits.length,
        branchesCount: branches.length,
        branches: branches.map(b => ({ name: b.name, current: b.current })),
        head: data.head,
        status: status
      });

      // Ensure data is serializable
      const serializableData = this.toSerializable(data);
      
      // Cache the result
      this.cache.set(cacheKey, { data: serializableData, timestamp: Date.now() });

      return serializableData;
    } catch (error) {
      console.error('[GitTimelineService] Failed to get timeline data:', error);
      throw error;
    }
  }

  /**
   * Get commit history with optional filtering
   */
  private async getCommits(filter?: TimelineFilter): Promise<GitTimelineCommit[]> {
    try {
      const logOptions: any = {
        '--all': true,
        '--topo-order': true,
        '--pretty=format:%H|%h|%s|%b|%an|%ae|%at|%cn|%ce|%ct|%P|%D': null,
        '-n': filter?.limit || 100
      };

      // Add branch filter if specified
      if (filter?.branches && filter.branches.length > 0) {
        delete logOptions['--all'];
        logOptions['--branches'] = filter.branches;
      }

      // Add author filter
      if (filter?.authors && filter.authors.length > 0) {
        logOptions['--author'] = filter.authors.join('|');
      }

      // Add date range filter
      if (filter?.dateRange) {
        logOptions['--since'] = filter.dateRange.start.toISOString();
        logOptions['--until'] = filter.dateRange.end.toISOString();
      }

      // Add search filter
      if (filter?.search) {
        logOptions['--grep'] = filter.search;
      }

      // Build arguments array
      const args = ['log'];
      Object.entries(logOptions).forEach(([key, value]) => {
        if (value !== undefined) {
          if (value === null || value === true) {
            args.push(key);
          } else {
            args.push(key);
            args.push(String(value));
          }
        }
      });
      
      const log = await this.git.raw(args);
      
      return this.parseCommitLog(log);
    } catch (error) {
      console.error('[GitTimelineService] Failed to get commits:', error);
      return [];
    }
  }

  /**
   * Parse git log output into structured commit data
   */
  private parseCommitLog(log: string): GitTimelineCommit[] {
    const commits: GitTimelineCommit[] = [];
    const lines = log.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 11) continue;

      const [
        hash, abbrevHash, subject, body,
        authorName, authorEmail, authorTime,
        committerName, committerEmail, committerTime,
        parents, refs
      ] = parts;

      commits.push({
        hash,
        abbrevHash,
        subject,
        body: body || undefined,
        author: {
          name: authorName,
          email: authorEmail,
          timestamp: parseInt(authorTime) * 1000
        },
        committer: {
          name: committerName,
          email: committerEmail,
          timestamp: parseInt(committerTime) * 1000
        },
        parents: parents ? parents.split(' ').filter(p => p) : [],
        refs: this.parseRefs(refs)
      });
    }

    return commits;
  }

  /**
   * Parse ref string into individual refs
   */
  private parseRefs(refString: string): string[] {
    if (!refString || refString.trim() === '') return [];
    
    // Remove HEAD -> prefix if present
    refString = refString.replace(/HEAD -> /, '');
    
    // Split by comma and clean up
    return refString
      .split(',')
      .map(ref => ref.trim())
      .filter(ref => ref && ref !== 'HEAD');
  }

  /**
   * Get all branches
   */
  private async getBranches(): Promise<GitBranch[]> {
    try {
      const branchSummary = await this.git.branch(['-a', '-v']);
      console.log('[GitTimelineService] Branch summary:', branchSummary);
      const branches: GitBranch[] = [];

      for (const [name, branch] of Object.entries(branchSummary.branches)) {
        // Skip HEAD entries
        if (name.includes('HEAD')) continue;

        const isRemote = name.startsWith('remotes/');
        const cleanName = isRemote ? name.replace(/^remotes\/[^\/]+\//, '') : name;

        branches.push({
          name: cleanName,
          current: !!branch.current,
          commit: String(branch.commit || ''),
          remote: isRemote ? name.split('/')[1] : undefined,
          isLocal: !isRemote,
          isRemote
        });
      }

      return branches;
    } catch (error) {
      console.error('[GitTimelineService] Failed to get branches:', error);
      return [];
    }
  }

  /**
   * Get all tags
   */
  private async getTags(): Promise<GitTag[]> {
    try {
      const tagList = await this.git.tags(['--sort=-version:refname']);
      const tags: GitTag[] = [];

      for (const tagName of tagList.all) {
        try {
          // Get tag details
          const show = await this.git.raw(['show', tagName, '--pretty=format:%H|%s', '-s']);
          const [commit, annotation] = show.trim().split('|');
          
          tags.push({
            name: String(tagName),
            commit: String(commit),
            annotation: annotation ? String(annotation) : undefined
          });
        } catch (error) {
          // Lightweight tag without annotation
          const revParse = await this.git.revparse([tagName]);
          tags.push({
            name: String(tagName),
            commit: String(revParse.trim())
          });
        }
      }

      return tags;
    } catch (error) {
      console.error('[GitTimelineService] Failed to get tags:', error);
      return [];
    }
  }

  /**
   * Get commit details including file changes
   */
  async getCommitDetails(hash: string): Promise<GitTimelineCommit | null> {
    try {
      // Get commit info
      const show = await this.git.show([
        hash,
        '--pretty=format:%H|%h|%s|%b|%an|%ae|%at|%cn|%ce|%ct|%P|%D',
        '--name-status'
      ]);

      const lines = show.split('\n');
      const commitLine = lines[0];
      const commits = this.parseCommitLog(commitLine);
      
      if (commits.length === 0) return null;

      const commit = commits[0];
      
      // Parse file changes
      const files = {
        added: [] as string[],
        modified: [] as string[],
        deleted: [] as string[]
      };

      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const [status, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t');

        switch (status) {
          case 'A':
            files.added.push(path);
            break;
          case 'M':
            files.modified.push(path);
            break;
          case 'D':
            files.deleted.push(path);
            break;
        }
      }

      commit.files = files;
      return commit;
    } catch (error) {
      console.error(`[GitTimelineService] Failed to get commit details for ${hash}:`, error);
      return null;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}