import { Hono } from "hono";
import axios from "axios";

function detectImageType(buffer: ArrayBuffer): string {
  const arr = new Uint8Array(buffer);

  // Check for JPEG: starts with 0xFF 0xD8 0xFF
  if (arr[0] === 0xff && arr[1] === 0xd8 && arr[2] === 0xff) {
    return "image/jpeg";
  }

  // Check for PNG: starts with 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    arr[0] === 0x89 &&
    arr[1] === 0x50 &&
    arr[2] === 0x4e &&
    arr[3] === 0x47
  ) {
    return "image/png";
  }

  // Check for GIF: starts with "GIF"
  if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46) {
    return "image/gif";
  }

  // Check for WebP: starts with "RIFF" and contains "WEBP"
  if (
    arr[0] === 0x52 &&
    arr[1] === 0x49 &&
    arr[2] === 0x46 &&
    arr[3] === 0x46 &&
    arr[8] === 0x57 &&
    arr[9] === 0x45 &&
    arr[10] === 0x42 &&
    arr[11] === 0x50
  ) {
    return "image/webp";
  }

  return "application/octet-stream";
}

const app = new Hono();

const API_BASE_URL = "https://api.mangadex.org";
const COVER_URL = "https://mangadex.org/covers";
const MIMI_BASE_URL = "https://mimihentai.com/api/v1";

const chapterCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

function setCacheWithTTL(key: any, value: any) {
  const expiration = Date.now() + CACHE_TTL;
  chapterCache.set(key, { value, expiration });
}

function getCache(key: any) {
  const cached = chapterCache.get(key);
  if (cached && cached.expiration > Date.now()) {
    return cached.value;
  }

  chapterCache.delete(key);
  return null;
}

let requestCounter = 0;
const CLEANUP_INTERVAL = 100; 

function cleanupCache() {
  requestCounter++;
  if (requestCounter % CLEANUP_INTERVAL !== 0) {
    return;
  }
  
  const now = Date.now();
  for (const [key, value] of chapterCache.entries()) {
    if (value.expiration <= now) {
      chapterCache.delete(key);
    }
  }
}

// headers
app.use("*", async (c, next) => {
  const viaHeader = c.req.header("Via");
  if (viaHeader)
    return c.text('Requests with "Via" header are not allowed.', 403);

  const userAgent = c.req.header("User-Agent");
  if (!userAgent) return c.text("User-Agent header is required.", 400);

  await next();
});

// app.options("*", (c) => {
//   c.header("Access-Control-Allow-Origin", "*");
//   c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
//   c.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
//   return c.text("", 204); // Trả về 204 No Content
// });

// CORS
app.use("*", (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  return next();
});

app.get("/ch/:id", async (c) => {
  cleanupCache();
  
  const id = c.req.param("id");
  const useDataSaver = c.req.query("dataSaver") === "true";
  
  const cacheKey = `${id}:${useDataSaver ? "saver" : "full"}`;
  
  try {
    let chapterInfo = getCache(cacheKey);
    
    if (!chapterInfo) {
      const atHomeAPIUrl = `${API_BASE_URL}/at-home/server/${id}`;
      const { data: serverData } = await axios.get(atHomeAPIUrl, {
        headers: {
          "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
        },
      });
      
      chapterInfo = {
        baseUrl: serverData.baseUrl,
        hash: serverData.chapter.hash,
        fileNames: useDataSaver 
          ? Object.values(serverData.chapter.dataSaver)
          : Object.values(serverData.chapter.data)
      };
      
      setCacheWithTTL(cacheKey, chapterInfo);
    }
    
    const proxiedLinks = chapterInfo.fileNames.map(
      (_: any, index: any) =>
        `images/${id}/${index}${useDataSaver ? "?dataSaver=true" : ""}`
    );

    return c.json(
      {
        chapterID: id,
        images: proxiedLinks,
        usingDataSaver: useDataSaver,
      },
      200
    );

    // return new Response(JSON.stringify(data), {
    //   status,
    //   headers: {
    //     "Content-Type": "application/json",
    //     "Access-Control-Allow-Origin": "*",
    //     "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    //     "Access-Control-Allow-Headers": "Content-Type, Authorization",
    //   },
    // });
  } catch (error) {
    console.error(error);
    return c.text("Internal Server Error", 500);
  }
});

app.get("/images", async (c) => {
  try {
    // Lấy URL từ query parameter
    const imageUrl = c.req.query("url");
    
    if (!imageUrl) {
      return c.text('Missing URL parameter. Please provide a valid "url" query parameter.', 400);
    }

    // Decode URL và xử lý an toàn
    let decodedUrl;
    try {
      decodedUrl = decodeURIComponent(imageUrl);
      new URL(decodedUrl); // Kiểm tra URL có hợp lệ không
    } catch (error) {
      console.error('Invalid URL format:', imageUrl);
      return c.text('Invalid URL format', 400);
    }

    // Đảm bảo URL bắt đầu với http hoặc https
    if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
      return c.text('URL must start with http:// or https://', 400);
    }

    // Tạo ETag đơn giản từ URL
    const cacheKey = `"${btoa(decodedUrl).slice(0, 20)}"`;
    const etagHeader = c.req.header('if-none-match');
    
    // Trả về 304 Not Modified nếu ETag khớp
    if (etagHeader && etagHeader === cacheKey) {
      c.header('Cache-Control', 'public, max-age=86400');
      c.header('ETag', cacheKey);
      return c.body(null, 304);
    }
    
    // Fetch ảnh từ URL gốc
    const imageResponse = await axios.get(decodedUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': c.req.header('user-agent') || 'Mozilla/5.0',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': new URL(decodedUrl).origin,
        'Origin': new URL(decodedUrl).origin,
        'If-None-Match': etagHeader || '',
        'If-Modified-Since': c.req.header('if-modified-since') || '',
      },
      maxRedirects: 5,
      timeout: 10000,
    });

    // Lấy content-type từ response headers
    const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
    
    // Kiểm tra xem đây có phải là ảnh không
    if (!contentType.startsWith('image/')) {
      return c.text('URL does not point to an image', 400);
    }

    // Trả về ảnh với headers phù hợp
    c.header('Content-Type', contentType);
    c.header('Cache-Control', 'public, max-age=86400');
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    c.header('X-Proxy-Origin', new URL(decodedUrl).hostname);
    c.header('ETag', cacheKey);
    
    return new Response(imageResponse.data, { status: 200 });
  } catch (error) {
    console.error('Error in image proxy:', error);
    return c.text(`Internal Server Error`, 500);
  }
});

app.get("/images/:id/:index", async (c) => {
  cleanupCache();
  
  const id = c.req.param("id");
  const index = parseInt(c.req.param("index"));
  const useDataSaver = c.req.query("dataSaver") === "true";
  
  const cacheKey = `${id}:${useDataSaver ? "saver" : "full"}`;

  try {
    let chapterInfo = getCache(cacheKey);
    
    if (!chapterInfo) {
      const atHomeAPIUrl = `${API_BASE_URL}/at-home/server/${id}`;
      const { data: serverData } = await axios.get(atHomeAPIUrl, {
        headers: {
          "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
        },
      });
      
      chapterInfo = {
        baseUrl: serverData.baseUrl,
        hash: serverData.chapter.hash,
        fileNames: useDataSaver 
          ? Object.values(serverData.chapter.dataSaver)
          : Object.values(serverData.chapter.data)
      };
      
      setCacheWithTTL(cacheKey, chapterInfo);
    }
    
    const { baseUrl, hash, fileNames } = chapterInfo;
    
    if (index < 0 || index >= fileNames.length) {
      return c.text("Image index out of range", 404);
    }
    
    // Tạo URL ảnh
    const currentFileName = fileNames[index] as string;
    const imagePath = useDataSaver ? "data-saver" : "data";
    const imageUrl = `${baseUrl}/${imagePath}/${hash}/${currentFileName}`;

    const response = await axios.get(imageUrl, {
      method: "GET",
      responseType: "arraybuffer",
    });

    // Xác định Content-Type dựa trên dữ liệu ảnh
    const contentType = detectImageType(response.data);

    c.header("Content-Type", contentType);
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Trả về ảnh gốc không chuyển đổi
    return new Response(response.data, { status: 200 });
  } catch (error) {
    console.error(error);
    return c.text("Internal Server Error", 500);
  }
});

app.get("/covers/:manga-id/:cover-filename", async (c) => {
  const mangaId = c.req.param("manga-id");
  const coverFilename = c.req.param("cover-filename");
  let coverUrl = `${COVER_URL}/${mangaId}/${coverFilename}`;

  try {
    const response = await axios.get(coverUrl, {
      method: "GET",
      responseType: "arraybuffer",
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
        // Referer: "https://mangadex.org/",
      },
    });

    // Xác định Content-Type dựa trên dữ liệu ảnh
    const contentType = detectImageType(response.data);

    c.header("Content-Type", contentType);
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Trả về ảnh gốc không chuyển đổi
    return new Response(response.data, { status: 200 });
  } catch (error) {
    console.error(error);
    return c.text("Internal Server Error", 500);
  }
});

app.all("/mimi/*", async (c) => {
  try {
    const url = new URL(c.req.url);
    const targetPath = url.pathname.replace(/^\/mimi/, "") + url.search;

    const apiUrl = MIMI_BASE_URL + targetPath;
    // console.log(apiUrl);
    const res = await fetch(apiUrl, {
      method: c.req.method,
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error(error);
    return c.text("Internal Server Error", 500);
  }
});

app.all("*", async (c) => {
  try {
    const url = new URL(c.req.url);
    const targetPath = url.pathname + url.search;
    if (targetPath === "/") return c.text("nothing here", 200);

    const apiUrl = API_BASE_URL + targetPath;
    const res = await fetch(apiUrl, {
      method: c.req.method,
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error(error);
    return c.text("Internal Server Error", 500);
  }
});

export default app;
