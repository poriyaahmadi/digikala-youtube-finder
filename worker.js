export default {
  async fetch(request) {
    // برای درخواست‌های CORS (مرورگر)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    // فقط POST قبول کن
    if (request.method !== "POST") {
      return new Response("Send POST request with codes", { 
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    // کلیدهای API
    const YOUTUBE_API_KEY = "AIzaSyBi2u1KA7av4v6zC_E7bE4FQB1aP6eyq-c";
    const GROK_API_KEY = "xai-qZB4ogwAcs4kyCRvLZO3d5MUe8WlLPnj3RQIVmjJfiOV2N8nm8H6t6KuHNpRREqvPRXxv5luLPfWdE7q";
    
    // چندتا کلید یوتیوب برای مواقع ضرورت (اگه داری اضافه کن)
    const YOUTUBE_API_KEYS = [
      YOUTUBE_API_KEY,
      // "AIzaSyB...",  // کلید دوم اگه داری
      // "AIzaSyC..."   // کلید سوم اگه داری
    ];

    try {
      const body = await request.json();
      const codesRaw = body.codes || "";
      
      // استخراج کدهای عددی
      const codes = codesRaw.split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => {
          const match = l.match(/\d+/);
          return match ? match[0] : null;
        })
        .filter(Boolean);

      const results = [];

      // پردازش هر کد
      for (const code of codes) {
        console.log(`Processing code: ${code}`);
        
        // ۱. جستجو با API یوتیوب
        let ytVideos = await searchYouTube(code, YOUTUBE_API_KEYS);
        
        // ۲. جستجو با Grok
        let grokVideos = await searchGrok(code, GROK_API_KEY);
        
        // ۳. اعتبارسنجی ویدیوها
        const validYtVideos = await validateVideos(ytVideos);
        const validGrokVideos = await validateVideos(grokVideos);
        
        // ۴. ترکیب هوشمند نتایج
        const finalVideos = mergeVideos(validYtVideos, validGrokVideos);
        
        results.push({
          code: `DKP-${code}`,
          videos: finalVideos.slice(0, 5), // حداکثر ۵ ویدیو
          stats: {
            youtube: validYtVideos.length,
            grok: validGrokVideos.length,
            total: finalVideos.length
          }
        });
      }

      // برگردوندن نتایج
      return new Response(JSON.stringify({ 
        success: true, 
        results: results 
      }), {
        headers: { 
          "Content-Type": "application/json", 
          "Access-Control-Allow-Origin": "*" 
        }
      });

    } catch (error) {
      // خطا
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json", 
          "Access-Control-Allow-Origin": "*" 
        }
      });
    }
  }
};

// ==================== توابع جستجو ====================

// جستجو با API یوتیوب
async function searchYouTube(code, apiKeys) {
  const queries = [
    `digikala dkp-${code} review`,
    `dkp ${code} review`,
    `dkp-${code} unboxing`,
    `digikala product ${code} review`
  ];
  
  const allVideos = [];
  const seenIds = new Set();
  
  for (const key of apiKeys) {
    if (!key) continue;
    
    for (const query of queries) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=3&q=${encodeURIComponent(query)}&type=video&key=${key}`;
        
        const response = await fetch(url);
        if (!response.ok) continue;
        
        const data = await response.json();
        
        for (const item of data.items || []) {
          if (!seenIds.has(item.id.videoId)) {
            seenIds.add(item.id.videoId);
            allVideos.push({
              id: item.id.videoId,
              title: item.snippet.title,
              channel: item.snippet.channelTitle,
              url: `https://youtube.com/watch?v=${item.id.videoId}`,
              source: 'youtube',
              confidence: 0.8
            });
          }
        }
      } catch (e) {
        console.error('YouTube error:', e);
      }
    }
  }
  
  return allVideos;
}

// جستجو با Grok
async function searchGrok(code, apiKey) {
  if (!apiKey) return [];
  
  const prompt = `Find 3 YouTube review videos for Digikala product code DKP-${code}. 
Return ONLY a JSON array with this exact format:
[
  {
    "id": "videoId",
    "title": "video title",
    "channel": "channel name",
    "url": "https://youtube.com/watch?v=videoId"
  }
]
Only return valid JSON, no other text.`;

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-1',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that returns only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      console.error('Grok API error:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    // استخراج JSON
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    
    const videos = JSON.parse(jsonMatch[0]);
    
    // اضافه کردن منبع
    return videos.map(v => ({
      ...v,
      source: 'grok',
      confidence: 0.6
    }));
    
  } catch (e) {
    console.error('Grok error:', e);
    return [];
  }
}

// اعتبارسنجی ویدیوها
async function validateVideos(videos) {
  const validVideos = [];
  
  for (const video of videos) {
    try {
      // بررسی فرمت آیدی
      if (!video.id || !video.id.match(/^[A-Za-z0-9_-]{11}$/)) {
        continue;
      }
      
      // بررسی تامبنیل (سریعترین راه)
      const thumbnailUrl = `https://img.youtube.com/vi/${video.id}/0.jpg`;
      const thumbnailCheck = await fetch(thumbnailUrl, { method: 'HEAD' });
      
      if (thumbnailCheck.ok) {
        // آپدیت اعتبار
        video.confidence = Math.min(video.confidence + 0.2, 1.0);
        validVideos.push(video);
      }
    } catch (e) {
      console.error('Validation error:', e);
    }
  }
  
  return validVideos;
}

// ترکیب ویدیوها
function mergeVideos(ytVideos, grokVideos) {
  const merged = [];
  const seenIds = new Set();
  
  // اول ویدیوهای مشترک (بالاترین کیفیت)
  for (const yt of ytVideos) {
    const grokMatch = grokVideos.find(g => g.id === yt.id);
    if (grokMatch) {
      merged.push({
        ...yt,
        confidence: 1.0,
        source: 'both'
      });
      seenIds.add(yt.id);
    }
  }
  
  // بعد ویدیوهای یوتیوب
  for (const yt of ytVideos) {
    if (!seenIds.has(yt.id)) {
      merged.push(yt);
      seenIds.add(yt.id);
    }
  }
  
  // آخر ویدیوهای Grok
  for (const grok of grokVideos) {
    if (!seenIds.has(grok.id)) {
      merged.push(grok);
      seenIds.add(grok.id);
    }
  }
  
  // مرتب‌سازی بر اساس اعتبار
  return merged.sort((a, b) => b.confidence - a.confidence);
}
