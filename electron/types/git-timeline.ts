// Git Timeline Type Definitions

export interface GitTimelineCommit {
  hash: string;
  abbrevHash: string;
  subject: string;
  body?: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
  };
  committer?: {
    name: string;
    email: string;
    timestamp: number;
  };
  parents: string[];
  refs: string[]; // branch names, tags
  files?: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
}

export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
  remote?: string;
  upstream?: string;
  isLocal: boolean;
  isRemote: boolean;
}

export interface GitTag {
  name: string;
  commit: string;
  annotation?: string;
}

export interface GitTimelineData {
  commits: GitTimelineCommit[];
  branches: GitBranch[];
  tags: GitTag[];
  head: string;
  remotes: string[];
}

export interface GitGraphOptions {
  orientation?: 'vertical' | 'horizontal';
  template?: 'metro' | 'blackarrow' | 'default';
  mode?: 'compact' | 'extended';
  commitSpacing?: number;
  branchSpacing?: number;
  showCommitHash?: boolean;
  showCommitAuthor?: boolean;
  showCommitDate?: boolean;
}

export interface TimelineFilter {
  branches?: string[];
  authors?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  search?: string;
  limit?: number;
}

export interface TimelineInteraction {
  type: 'commit-click' | 'branch-click' | 'tag-click';
  data: GitTimelineCommit | GitBranch | GitTag;
  event?: any; // MouseEvent is browser-specific, not available in Node
}