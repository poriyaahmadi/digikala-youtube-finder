const YOUTUBE_API_KEY = 'AIzaSyBi2u1KA7av4v6zC_E7bE4FQB1aP6eyq-c';

const PERSIAN_REGEX = /[\u0600-\u06FF\u0750-\u077F]/;

function isPersian(text) {
  return PERSIAN_REGEX.test(text || '');
}

async function getProductInfo(dkpCode) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const url = `https://api.digikala.com/v1/product/${dkpCode}/`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
      }
    });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      const product = data?.data?.product;
      if (!product) return null;

      const titleEn = product.title_en || '';
      const titleFa = product.title || '';
      const brand = product.brand?.title_en || product.brand?.title || '';

      let model = '';
      for (const group of (product.specifications || [])) {
        for (const attr of (group.attributes || [])) {
          const key = (attr.title || '').toLowerCase();
          if (key.includes('model') || key.includes('مدل')) {
            model = (attr.values || [])[0] || '';
            if (model) break;
          }
        }
        if (model) break;
      }

      return { titleEn, titleFa, brand, model, id: dkpCode };
    }
  } catch (e) {}
  return null;
}

function buildQueries(info) {
  const queries = [];
  if (!info) return queries;

  const { model, brand, titleEn } = info;

  if (model) {
    queries.push(`${model} review`);
    queries.push(`${model} unboxing`);
  }
  if (brand && model) {
    queries.push(`${brand} ${model} review`);
    queries.push(`${brand} ${model} unboxing`);
  }
  if (titleEn) {
    queries.push(`${titleEn} review`);
    queries.push(`${titleEn} unboxing`);
  }

  return queries;
}

async function searchYouTube(queries) {
  const videos = [];
  const seen = new Set();

  for (const query of queries) {
    if (videos.length >= 2) break;

    try {
      const params = new URLSearchParams({
        part: 'snippet',
        maxResults: '20',
        q: query,
        type: 'video',
        videoDuration: 'medium',
        key: YOUTUBE_API_KEY
      });

      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
      if (!res.ok) continue;

      const data = await res.json();

      for (const item of (data.items || [])) {
        if (videos.length >= 2) break;

        const videoId = item.id?.videoId;
        if (!videoId || seen.has(videoId)) continue;

        const title = item.snippet?.title || '';
        const channel = item.snippet?.channelTitle || '';
        const description = item.snippet?.description || '';

        if (isPersian(title) || isPersian(channel) || isPersian(description)) continue;
        if (title.toLowerCase().includes('#shorts')) continue;
        if (title.toLowerCase().includes('slideshow')) continue;
        if (title.toLowerCase().includes('compilation')) continue;

        seen.add(videoId);
        videos.push(`https://www.youtube.com/watch?v=${videoId}`);
      }
    } catch (e) {}
  }

  return videos;
}

const HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>یوتیوب فایندر دیجیکالا</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; min-height: 100vh; padding: 30px 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { text-align: center; color: #1a1a2e; font-size: 28px; margin-bottom: 8px; }
    .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 30px; }
    .card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 2px 20px rgba(0,0,0,0.08); margin-bottom: 20px; }
    label { display: block; font-weight: 600; color: #333; margin-bottom: 10px; font-size: 15px; }
    textarea { width: 100%; height: 150px; border: 2px solid #e0e0e0; border-radius: 10px; padding: 12px; font-size: 15px; resize: vertical; font-family: monospace; direction: ltr; text-align: left; transition: border-color 0.2s; }
    textarea:focus { outline: none; border-color: #e31837; }
    .hint { font-size: 12px; color: #999; margin-top: 6px; }
    button { width: 100%; padding: 14px; background: #e31837; color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 16px; transition: background 0.2s; }
    button:hover { background: #c0142d; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .loading { text-align: center; padding: 30px; color: #666; display: none; }
    .spinner { width: 40px; height: 40px; border: 4px solid #f0f0f0; border-top-color: #e31837; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .results { display: none; }
    .summary { background: #f8f8f8; border-radius: 10px; padding: 16px; margin-bottom: 20px; display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
    .summary-item { text-align: center; }
    .summary-num { font-size: 28px; font-weight: 700; color: #e31837; }
    .summary-label { font-size: 12px; color: #666; }
    .result-item { background: white; border-radius: 12px; padding: 20px; margin-bottom: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); border-right: 4px solid #e31837; }
    .result-item.no-content { border-right-color: #ccc; }
    .result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .code-badge { background: #e31837; color: white; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; font-family: monospace; }
    .product-name { color: #666; font-size: 13px; flex: 1; margin-right: 12px; text-align: right; }
    .video-link { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #f8f8f8; border-radius: 8px; margin-bottom: 8px; text-decoration: none; color: #1a73e8; font-size: 14px; direction: ltr; transition: background 0.2s; }
    .video-link:hover { background: #e8f0fe; }
    .video-num { background: #e31837; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .no-content-text { color: #999; font-size: 14px; text-align: center; padding: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 یوتیوب فایندر دیجیکالا</h1>
    <p class="subtitle">کدهای DKP رو وارد کن، لینک‌های یوتیوب رو بگیر</p>
    <div class="card">
      <label>کدهای DKP (هر کد در یک خط)</label>
      <textarea id="codesInput" placeholder="17803871&#10;DKP-12345678&#10;98765432"></textarea>
      <p class="hint">می‌تونی با یا بدون پیشوند DKP- وارد کنی</p>
      <button id="searchBtn" onclick="startSearch()">🔍 جستجو در یوتیوب</button>
    </div>
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p id="loadingText">در حال جستجو...</p>
    </div>
    <div class="results" id="results">
      <div class="summary" id="summary"></div>
      <div id="resultsList"></div>
    </div>
  </div>
  <script>
    async function startSearch() {
      const codes = document.getElementById('codesInput').value.trim();
      if (!codes) { alert('لطفاً حداقل یک کد DKP وارد کن'); return; }
      const btn = document.getElementById('searchBtn');
      const loading = document.getElementById('loading');
      const results = document.getElementById('results');
      btn.disabled = true;
      loading.style.display = 'block';
      results.style.display = 'none';
      try {
        const response = await fetch('/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes })
        });
        const data = await response.json();
        displayResults(data.results);
      } catch (e) {
        alert('خطا در اتصال به سرور');
      } finally {
        btn.disabled = false;
        loading.style.display = 'none';
      }
    }
    function displayResults(results) {
      const container = document.getElementById('resultsList');
      const summary = document.getElementById('summary');
      const resultsDiv = document.getElementById('results');
      container.innerHTML = '';
      let found = 0, notFound = 0, totalVideos = 0;
      results.forEach(result => {
        if (result.videos.length > 0) { found++; totalVideos += result.videos.length; } else { notFound++; }
        const div = document.createElement('div');
        div.className = 'result-item' + (result.videos.length === 0 ? ' no-content' : '');
        let videosHtml = '';
        if (result.videos.length > 0) {
          result.videos.forEach((url, i) => {
            videosHtml += '<a href="' + url + '" target="_blank" class="video-link"><span class="video-num">' + (i+1) + '</span>' + url + '</a>';
          });
        } else {
          videosHtml = '<p class="no-content-text">❌ no content</p>';
        }
        div.innerHTML = '<div class="result-header"><span class="code-badge">' + result.code + '</span><span class="product-name">' + result.product + '</span></div>' + videosHtml;
        container.appendChild(div);
      });
      summary.innerHTML = '<div class="summary-item"><div class="summary-num">' + results.length + '</div><div class="summary-label">کل کدها</div></div><div class="summary-item"><div class="summary-num">' + found + '</div><div class="summary-label">پیدا شد</div></div><div class="summary-item"><div class="summary-num">' + totalVideos + '</div><div class="summary-label">ویدیو</div></div><div class="summary-item"><div class="summary-num">' + notFound + '</div><div class="summary-label">no content</div></div>';
      resultsDiv.style.display = 'block';
    }
  </script>
</body>
</html>`;

async function handleSearch(request) {
  const body = await request.json();
  const codesRaw = body.codes || '';

  const codes = codesRaw.split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => { const m = l.match(/\d+/); return m ? m[0] : null; })
    .filter(Boolean);

  const results = [];

  for (const code of codes) {
    const productInfo = await getProductInfo(code);
    const queries = buildQueries(productInfo);
    const videos = queries.length > 0 ? await searchYouTube(queries) : [];
    const productName = productInfo?.titleEn || productInfo?.titleFa || `DKP-${code}`;

    results.push({ code: `DKP-${code}`, videos, product: productName });
  }

  return new Response(JSON.stringify({ results }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/search') {
      return handleSearch(request);
    }

    return new Response(HTML, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }
};
