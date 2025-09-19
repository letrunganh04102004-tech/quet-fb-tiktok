export interface SocialVideo {
  id: string;
  webVideoUrl: string;
  text: string; // Changed from 'desc' to 'text' to match API response
  createTime: number;
  createTimeISO: string;
  authorMeta: {
    name: string;
    nickName: string;
    avatar: string; // Added avatar field
  };
  diggCount: number;
  commentCount: number;
  shareCount: number;
  playCount: number;
  videoMeta: {
    duration: number;
    height: number;
    width: number;
  };
  musicMeta: {
    musicName: string;
    musicAuthor: string;
    musicOriginal: boolean;
  };
}

export type TranscriptState = {
  [videoUrl: string]: {
    status: 'idle' | 'matched' | 'loading' | 'success' | 'error';
    text: string;
  };
};

export type TranscriptCache = {
  [videoUrl: string]: string;
};

// New type to manage the multi-step UI flow
export type AppStep = 'scan' | 'match' | 'results';