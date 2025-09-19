import { SocialVideo } from '../types';

// TikTok Actor
const TIKTOK_ACTOR_URL = 'https://api.apify.com/v2/acts/0FXVyOXXEmdGcV88a/run-sync-get-dataset-items';

// Facebook Actor for Page Videos/Posts
const FACEBOOK_ACTOR_URL = 'https://api.apify.com/v2/acts/bQdAW9j5tP0dkOO8g/run-sync-get-dataset-items';

// --- Platform-Specific Data Mapping ---

/**
 * Maps a raw item from the TikTok Apify actor to the standardized SocialVideo format.
 * This function handles the specific data structure returned by the TikTok scraper.
 * @param item - A single raw data object from the TikTok actor response.
 * @returns A SocialVideo object.
 */
const mapTikTokItemToSocialVideo = (item: any): SocialVideo => {
  return {
    id: item.id ?? item.webVideoUrl ?? `fallback-${Math.random()}`,
    webVideoUrl: item.webVideoUrl ?? '',
    text: item.text ?? '',
    createTime: item.createTime ?? 0,
    createTimeISO: item.createTimeISO ?? new Date(0).toISOString(),
    authorMeta: {
      name: item.authorMeta?.name ?? 'Unknown',
      nickName: item.authorMeta?.nickName ?? item.authorMeta?.name ?? 'Unknown',
      avatar: item.authorMeta?.avatar ?? '',
    },
    diggCount: item.diggCount ?? 0,
    commentCount: item.commentCount ?? 0,
    shareCount: item.shareCount ?? 0,
    playCount: item.playCount ?? 0,
    videoMeta: {
      duration: item.videoMeta?.duration ?? 0,
      height: item.videoMeta?.height ?? 0,
      width: item.videoMeta?.width ?? 0,
    },
    musicMeta: {
      musicName: item.musicMeta?.musicName ?? 'N/A',
      musicAuthor: item.musicMeta?.musicAuthor ?? 'N/A',
      musicOriginal: item.musicMeta?.musicOriginal ?? false,
    },
  };
};

/**
 * Maps a raw item from the Facebook Apify actor to the standardized SocialVideo format.
 * This function handles the specific, flattened data structure returned by the Facebook page scraper.
 * @param item - A single raw data object from the Facebook actor response.
 * @returns A SocialVideo object.
 */
const mapFacebookItemToSocialVideo = (item: any): SocialVideo => {
    const createTime = item.creation_time ? item.creation_time * 1000 : Date.now();
    const postUrl = item.shareable_url || item['playback_video/permalink_url'] || '';
    return {
        id: item.video_id ?? item.post_id ?? postUrl,
        webVideoUrl: postUrl,
        text: item.message ?? '',
        createTime: createTime,
        createTimeISO: new Date(createTime).toISOString(),
        authorMeta: {
            name: item['video_owner/name'] ?? 'Unknown',
            nickName: item['video_owner/name'] ?? 'Unknown',
            avatar: item['video_owner/profile_pic_url'] ?? '',
        },
        // Note: 'diggCount' is TikTok specific, mapping FB 'reactions_count' here for consistency.
        diggCount: item.reactions_count ?? 0,
        commentCount: item.comments_count ?? 0,
        shareCount: item.shares_count ?? 0,
        playCount: item.views_count ?? 0,
        videoMeta: {
            duration: item.playable_duration_in_ms ? item.playable_duration_in_ms / 1000 : 0,
            height: item['playback_video/height'] ?? 0,
            width: item['playback_video/width'] ?? 0,
        },
        musicMeta: {
            musicName: item.track_title ?? 'N/A',
            musicAuthor: item['video_owner/name'] ?? 'N/A',
            musicOriginal: item.is_original_audio_on_facebook ?? false,
        },
    };
};


// --- Data Fetching Services ---

export const fetchTikTokData = async (apifyToken: string, tiktokUrl: string, limit: number): Promise<SocialVideo[]> => {
  if (!apifyToken) {
    throw new Error('Apify API Token is required.');
  }
  if (!tiktokUrl) {
    throw new Error("TikTok Channel URL is required.");
  }

  let profileName = tiktokUrl.trim();
  try {
      const urlObject = new URL(tiktokUrl);
      const pathParts = urlObject.pathname.split('/').filter(part => part && part.startsWith('@'));
      if (pathParts.length > 0) {
          profileName = pathParts[0].substring(1);
      }
  } catch (e) {
      if (profileName.startsWith('@')) {
        profileName = profileName.substring(1);
      }
  }

  const url = `${TIKTOK_ACTOR_URL}?token=${apifyToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      "profiles": [profileName],
      "resultsPerPage": limit,
      "profileScrapeSections": ["videos"],
      "profileSorting": "latest",
      "excludePinnedPosts": false,
      "shouldDownloadVideos": false,
      "shouldDownloadCovers": false,
      "shouldDownloadSubtitles": false,
      "shouldDownloadSlideshowImages": false,
      "shouldDownloadAvatars": false,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Apify API Error: ${errorData.error?.message || response.statusText}`);
  }

  const rawData = await response.json();
  
  if (!Array.isArray(rawData) || rawData.length === 0) {
    throw new Error("Apify không tìm thấy video nào hoặc trả về định dạng dữ liệu không mong muốn.");
  }

  // Use the dedicated mapping function for TikTok data
  const mappedData: SocialVideo[] = rawData.map(mapTikTokItemToSocialVideo);

  return mappedData;
};

// New helper function to convert Facebook UID to a username-based URL
const convertFacebookUidToUrl = async (url: string): Promise<string> => {
    try {
        const urlObject = new URL(url);
        // Check for profile.php URLs with an 'id' parameter
        if (urlObject.pathname.includes('profile.php') && urlObject.searchParams.has('id')) {
            const uid = urlObject.searchParams.get('id');
            if (!uid) return url; // No ID found, return original URL

            // Call the external API to convert UID to username
            const response = await fetch('https://finduid.net/api/convert-uid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `uid=${uid}`
            });

            if (!response.ok) {
                console.warn(`Could not convert UID to username via finduid.net. Status: ${response.status}. Proceeding with original URL.`);
                return url; // Fail gracefully
            }

            const data = await response.json();
            if (data && typeof data.username === 'string' && data.username.trim() !== '') {
                // Successfully converted, return the new profile URL
                return `https://www.facebook.com/${data.username.trim()}`;
            }
        }
    } catch (error) {
        // Log error and fallback to the original URL
        console.error("Error during Facebook UID conversion or URL parsing, using original URL:", error);
    }
    // Fallback to the original URL for any other case or error
    return url;
};

export const fetchFacebookData = async (apifyToken: string, facebookUrl: string, limit: number): Promise<SocialVideo[]> => {
    if (!apifyToken) {
        throw new Error('Apify API Token is required.');
    }
    if (!facebookUrl) {
        throw new Error("Facebook Page/Profile URL is required.");
    }

    // Convert potential UID-based URL to a standard username URL before sending to Apify
    const finalFacebookUrl = await convertFacebookUidToUrl(facebookUrl);

    const url = `${FACEBOOK_ACTOR_URL}?token=${apifyToken}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            "profileUrls": [finalFacebookUrl.trim()],
            "maxResults": limit,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Apify API Error: ${errorData.error?.message || response.statusText}`);
    }

    const rawData = await response.json();
    if (!Array.isArray(rawData) || rawData.length === 0) {
        throw new Error("Apify không tìm thấy video nào hoặc trả về định dạng dữ liệu không mong muốn.");
    }
    
    // Define a filter specific to Facebook video/reel posts to ensure we only process valid items
    const isFacebookVideoPost = (item: any) => 
        item && (item.video_id || item.post_id) && (item.shareable_url || item['playback_video/permalink_url']);

    // Use the dedicated filter and mapping function for Facebook data
    const mappedData: SocialVideo[] = rawData
      .filter(isFacebookVideoPost)
      .map(mapFacebookItemToSocialVideo);

    if (mappedData.length === 0) {
      throw new Error("Apify scraper ran successfully, but no video posts were found in the results. The URL might not contain recent videos or they may not be publicly accessible.");
    }

    return mappedData;
};
