// =====================
// TYPES
// =====================

interface YouTubeVideo {
    videoId: string;
    title: string;
    thumbnail: string;
    publishedAt: string;
    durationInSeconds: number;
  }
  
  interface ProcessedVideos {
    heroVideo: YouTubeVideo | null;
    longVideos: YouTubeVideo[];
    shorts: YouTubeVideo[];
  }
  
  // =====================
  // AUTO UPDATE CACHE (ADDED)
  // =====================
  
  let cachedVideos: ProcessedVideos | null = null;
  let lastFetchTime = 0;
  
  // 5 minutes cache TTL
  const CACHE_TTL = 5 * 60 * 1000;
  
  // =====================
  // HELPERS
  // =====================
  
  function getCachedVideos(): ProcessedVideos | null {
    if (!cachedVideos) return null;
  
    if (Date.now() - lastFetchTime > CACHE_TTL) {
      console.log("[YouTube API] Cache expired");
      return null;
    }
  
    console.log("[YouTube API] Serving from cache");
    return cachedVideos;
  }
  
  function setCachedVideos(videos: ProcessedVideos) {
    cachedVideos = videos;
    lastFetchTime = Date.now();
    console.log("[YouTube API] Cache updated");
  }
  
  /**
   * Converts ISO 8601 duration (PT4M13S) to seconds
   */
  function parseDuration(duration: string): number {
    try {
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 0;
  
      const hours = parseInt(match[1] || "0", 10);
      const minutes = parseInt(match[2] || "0", 10);
      const seconds = parseInt(match[3] || "0", 10);
  
      return hours * 3600 + minutes * 60 + seconds;
    } catch {
      return 0;
    }
  }
  
  // =====================
  // CHANNEL ID CACHE
  // =====================
  
  const channelIdCache = new Map<string, string>();
  
  // =====================
  // RESOLVE HANDLE → CHANNEL ID
  // =====================
  
  export async function resolveChannelHandleToId(
    apiKey: string,
    channelHandle: string
  ): Promise<string> {
    const normalized = channelHandle.replace("@", "").toUpperCase();
  
    if (channelIdCache.has(normalized)) {
      return channelIdCache.get(normalized)!;
    }
  
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=@${encodeURIComponent(
      normalized
    )}&maxResults=5&key=${apiKey}`;
  
    const res = await fetch(searchUrl);
    const data = await res.json();
  
    if (!data.items || data.items.length === 0) {
      throw new Error("Channel handle not found");
    }
  
    const channelId = data.items[0].id.channelId;
    channelIdCache.set(normalized, channelId);
    return channelId;
  }
  
  // =====================
  // MAIN FETCH FUNCTION (UNCHANGED LOGIC)
  // =====================
  
  export async function fetchYouTubeVideos(
    apiKey: string,
    channelIdOrHandle: string
  ): Promise<ProcessedVideos> {
    let channelId: string;
  
    if (channelIdOrHandle.startsWith("UC")) {
      channelId = channelIdOrHandle;
    } else {
      channelId = await resolveChannelHandleToId(apiKey, channelIdOrHandle);
    }
  
    // Get uploads playlist
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
    const channelRes = await fetch(channelUrl);
    const channelData = await channelRes.json();
  
    const uploadsPlaylist =
      channelData.items[0].contentDetails.relatedPlaylists.uploads;
  
    // Get playlist items
    const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylist}&maxResults=50&key=${apiKey}`;
    const playlistRes = await fetch(playlistUrl);
    const playlistData = await playlistRes.json();
  
    const videoIds = playlistData.items
      .map((i: any) => i.snippet.resourceId.videoId)
      .join(",");
  
    const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${apiKey}`;
    const videosRes = await fetch(videosUrl);
    const videosData = await videosRes.json();
  
    const videos: YouTubeVideo[] = videosData.items.map((item: any) => ({
      videoId: item.id,
      title: item.snippet.title,
      thumbnail:
        item.snippet.thumbnails.high?.url ||
        item.snippet.thumbnails.medium?.url,
      publishedAt: item.snippet.publishedAt,
      durationInSeconds: parseDuration(item.contentDetails.duration),
    }));
  
    // 🔥 SORT BY LATEST
    videos.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() -
        new Date(a.publishedAt).getTime()
    );
  
    const longVideos = videos.filter((v) => v.durationInSeconds > 60);
    const shorts = videos.filter((v) => v.durationInSeconds <= 60);
  
    const heroVideo = longVideos.length > 0 ? longVideos[0] : null;
    const latestLongVideos = longVideos.slice(0, 3);
    const latestShorts = shorts.slice(0, 3);
  
    return {
      heroVideo,
      longVideos: latestLongVideos,
      shorts: latestShorts,
    };
  }
  
  // =====================
  // AUTO-CACHED WRAPPER (ADDED)
  // =====================
  
  export async function fetchYouTubeVideosAuto(
    apiKey: string,
    channelIdOrHandle: string
  ): Promise<ProcessedVideos> {
    const cached = getCachedVideos();
    if (cached) return cached;
  
    const fresh = await fetchYouTubeVideos(apiKey, channelIdOrHandle);
    setCachedVideos(fresh);
    return fresh;
  }
  
  // =====================
  // BACKGROUND AUTO REFRESH (ADDED)
  // =====================
  
  export function startYouTubeAutoRefresh(
    apiKey: string,
    channelIdOrHandle: string
  ) {
    console.log("[YouTube API] Auto-refresh started (5 min)");
  
    // Warm up
    fetchYouTubeVideosAuto(apiKey, channelIdOrHandle).catch(console.error);
  
    setInterval(async () => {
      try {
        const fresh = await fetchYouTubeVideos(apiKey, channelIdOrHandle);
        setCachedVideos(fresh);
      } catch (err) {
        console.error("[YouTube API] Auto-refresh failed", err);
      }
    }, CACHE_TTL);
  }
  