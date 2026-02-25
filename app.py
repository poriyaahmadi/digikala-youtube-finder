from flask import Flask, render_template, request, jsonify
import requests
import re

app = Flask(__name__)

YOUTUBE_API_KEY = 'AIzaSyBi2u1KA7av4v6zC_E7bE4FQB1aP6eyq-c'

PERSIAN_REGEX = re.compile(r'[\u0600-\u06FF\u0750-\u077F]')

def get_product_info(dkp_code):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        url = f'https://api.digikala.com/v1/product/{dkp_code}/'
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            product = data.get('data', {}).get('product', {})
            
            title_en = product.get('title_en', '')
            title_fa = product.get('title', '')
            brand = ''
            
            if product.get('brand'):
                brand = product['brand'].get('title_en', '') or product['brand'].get('title', '')
            
            # استخراج مدل از مشخصات فنی
            model = ''
            for spec_group in product.get('specifications', []):
                for attr in spec_group.get('attributes', []):
                    key = attr.get('title', '').lower()
                    if 'model' in key or 'مدل' in key:
                        values = attr.get('values', [])
                        if values:
                            model = values[0]
                            break
            
            return {
                'title_en': title_en,
                'title_fa': title_fa,
                'brand': brand,
                'model': model,
                'id': dkp_code
            }
    except Exception as e:
        print(f'Digikala API error: {e}')
    return None

def build_search_queries(product_info):
    queries = []
    
    if not product_info:
        return queries
    
    model = product_info.get('model', '')
    brand = product_info.get('brand', '')
    title_en = product_info.get('title_en', '')
    
    if model:
        queries.append(f'{model} review')
        queries.append(f'{model} unboxing')
    
    if brand and model:
        queries.append(f'{brand} {model} review')
        queries.append(f'{brand} {model} unboxing')
    
    if title_en:
        queries.append(f'{title_en} review')
        queries.append(f'{title_en} unboxing')
    
    if brand and title_en:
        queries.append(f'{brand} {title_en} review')
    
    return queries

def is_persian(text):
    return bool(PERSIAN_REGEX.search(text))

def search_youtube(queries):
    videos = []
    seen_ids = set()
    
    for query in queries:
        if len(videos) >= 2:
            break
        
        try:
            url = 'https://www.googleapis.com/youtube/v3/search'
            params = {
                'part': 'snippet',
                'maxResults': 20,
                'q': query,
                'type': 'video',
                'videoDuration': 'medium',
                'key': YOUTUBE_API_KEY
            }
            
            response = requests.get(url, params=params, timeout=10)
            if response.status_code != 200:
                continue
            
            data = response.json()
            items = data.get('items', [])
            
            for item in items:
                if len(videos) >= 2:
                    break
                
                video_id = item['id']['videoId']
                if video_id in seen_ids:
                    continue
                
                snippet = item['snippet']
                title = snippet.get('title', '')
                channel = snippet.get('channelTitle', '')
                description = snippet.get('description', '')
                
                # فیلتر فارسی
                if is_persian(title) or is_persian(channel) or is_persian(description):
                    continue
                
                # فیلتر Shorts
                if '#shorts' in title.lower() or 'shorts' in title.lower():
                    continue
                
                # فیلتر slideshow و compilation
                if 'slideshow' in title.lower() or 'compilation' in title.lower():
                    continue
                
                seen_ids.add(video_id)
                videos.append(f'https://www.youtube.com/watch?v={video_id}')
        
        except Exception as e:
            print(f'YouTube search error: {e}')
            continue
    
    return videos

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search', methods=['POST'])
def search():
    data = request.get_json()
    codes_raw = data.get('codes', '')
    
    # استخراج کدها
    codes = []
    for line in codes_raw.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        match = re.search(r'\d+', line)
        if match:
            codes.append(match.group())
    
    results = []
    
    for code in codes:
        product_info = get_product_info(code)
        queries = build_search_queries(product_info)
        
        if not queries:
            results.append({
                'code': f'DKP-{code}',
                'videos': [],
                'product': 'اطلاعات محصول پیدا نشد'
            })
            continue
        
        videos = search_youtube(queries)
        product_name = product_info.get('title_en') or product_info.get('title_fa') or f'DKP-{code}'
        
        results.append({
            'code': f'DKP-{code}',
            'videos': videos,
            'product': product_name
        })
    
    return jsonify({'results': results})

if __name__ == '__main__':
    app.run(debug=True)
