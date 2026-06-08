const axios = require('axios');
const cheerio = require('cheerio');

// Regex to extract URLs from text
const urlRegex = /(https?:\/\/[^\s]+)/g;

async function scrapeLinksFromText(text) {
  if (!text) return text;
  
  const urls = text.match(urlRegex);
  if (!urls || urls.length === 0) return text;

  // Limit to maximum 3 links to avoid long hangs
  const urlsToProcess = urls.slice(0, 3);
  let enhancedText = text;

  const scrapePromises = urlsToProcess.map(async (url) => {
    try {
      // Use a timeout and a generic user-agent to avoid hangs and blocks
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1'
        }
      });
      
      const html = response.data;
      const $ = cheerio.load(html);
      
      // Try to get og:title, twitter:title, or <title>
      let title = $('meta[property="og:title"]').attr('content') || 
                  $('meta[name="twitter:title"]').attr('content') || 
                  $('title').text();
                  
      if (title) {
        // Clean up the title (e.g. remove extra whitespace or generic words)
        title = title.replace(/\s+/g, ' ').trim();
        return `\n[معلومات من الرابط (${url}): ${title}]`;
      }
    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error.message);
      // Fallback: extract product name from the URL path slug
      try {
        const parsedUrl = new URL(url);
        let pathname = parsedUrl.pathname.replace(/\/$/, '');
        const parts = pathname.split('/');
        let slug = parts.pop();
        if (slug && slug.length > 2) {
          slug = decodeURIComponent(slug).replace(/[-_]/g, ' ');
          return `\n[استنتاج من مسار الرابط (${url}): ${slug}]`;
        }
      } catch (e) {
        console.error('URL parsing fallback failed:', e.message);
      }
    }
    return ''; // empty string if failed completely
  });

  const results = await Promise.allSettled(scrapePromises);
  
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      enhancedText += result.value;
    }
  }

  return enhancedText;
}

module.exports = { scrapeLinksFromText };
