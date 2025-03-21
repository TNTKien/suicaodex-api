import { Hono } from "hono";
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static'
import axios from "axios";
import sharp = require("sharp");

// Cấu hình sharp
sharp.concurrency(1);

const app = new Hono();

const API_BASE_URL = "https://api.mangadex.org";
const COVER_URL = "https://mangadex.org/covers";

// Cache đơn giản với cơ chế tự động dọn dẹp
class SimpleCache {
  private chapterCache = new Map();
  private imageCache = new Map();
  private readonly CHAPTER_TTL = 10 * 60 * 1000; // 10 phút
  private readonly IMAGE_TTL = 30 * 60 * 1000; // 30 phút

  constructor() {
    // Dọn dẹp cache mỗi 10 phút
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  setChapter(key: any, value: any) {
    this.chapterCache.set(key, {
      data: value,
      expiry: Date.now() + this.CHAPTER_TTL,
    });
  }

  getChapter(key: any) {
    const item = this.chapterCache.get(key);
    if (!item) return null;
    if (item.expiry < Date.now()) {
      this.chapterCache.delete(key);
      return null;
    }
    return item.data;
  }

  setImage(key: any, value: any) {
    this.imageCache.set(key, {
      data: value,
      expiry: Date.now() + this.IMAGE_TTL,
    });
  }

  getImage(key: any) {
    const item = this.imageCache.get(key);
    if (!item) return null;
    if (item.expiry < Date.now()) {
      this.imageCache.delete(key);
      return null;
    }
    return item.data;
  }

  cleanup() {
    const now = Date.now();
    // Replace Map.entries() iteration with forEach to avoid downlevelIteration issues
    this.chapterCache.forEach((item, key) => {
      if (item.expiry < now) this.chapterCache.delete(key);
    });

    this.imageCache.forEach((item, key) => {
      if (item.expiry < now) this.imageCache.delete(key);
    });
  }
}

const cache = new SimpleCache();

// Middleware và các route xử lý
app.use("/favicon.ico", serveStatic({ path: "./favicon.ico" }));

// Kiểm tra headers
app.use("*", async (c, next) => {
  const viaHeader = c.req.header("Via");
  if (viaHeader)
    return c.text('Requests with "Via" header are not allowed.', 403);

  const userAgent = c.req.header("User-Agent");
  if (!userAgent) return c.text("User-Agent header is required.", 400);

  await next();
});

// CORS middleware
app.use("*", (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  return next();
});

// Lấy thông tin chapter
app.get("/ch/:id", async (c) => {
  const id = c.req.param("id");
  const atHomeAPIUrl = `${API_BASE_URL}/at-home/server/${id}`;
  try {
    let links = cache.getChapter(id);

    if (!links) {
      const response = await axios.get(atHomeAPIUrl, {
        headers: {
          "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
        },
        timeout: 10000,
      });

      const serverData = response.data;
      const baseUrl = serverData.baseUrl;
      const hash = serverData.chapter.hash;
      const fileNames = serverData.chapter.data;

      links = fileNames.map(
        (fileName: any) => `${baseUrl}/data/${hash}/${fileName}`
      );
      cache.setChapter(id, links);
    }

    const proxiedLinks = links.map(
      (_: any, index: any) => `images/${id}/${index}`
    );

    return c.json(
      {
        chapterID: id,
        images: proxiedLinks,
      },
      200
    );
  } catch (error) {
    console.error("Error fetching chapter:", error);
    return c.text("Failed to fetch chapter data", 500);
  }
});

// Lấy và chuyển đổi hình ảnh chapter
app.get("/images/:id/:index", async (c) => {
  const id = c.req.param("id");
  const index = parseInt(c.req.param("index"));
  const cacheKey = `${id}-${index}`;

  try {
    // Kiểm tra cache
    const cachedImage = cache.getImage(cacheKey);
    if (cachedImage) {
      c.header("Content-Type", "image/webp");
      c.header("Cache-Control", "public, max-age=3600");
      c.header("Content-Disposition", "inline"); // Thêm header này để trình duyệt hiển thị ảnh
      return new Response(cachedImage, { 
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "Content-Disposition": "inline",
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    const links = cache.getChapter(id);
    if (!links) return c.text("Chapter not found", 404);

    const imageUrl = links[index];
    if (!imageUrl) return c.text("Image not found", 404);

    // Fetch ảnh gốc
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });

    // Chuyển đổi sang WebP với cấu hình đơn giản
    const webpImage = await sharp(response.data)
      .webp({ quality: 85 })
      .toBuffer();

    // Lưu vào cache
    cache.setImage(cacheKey, webpImage);

    c.header("Content-Type", "image/webp");
    c.header("Cache-Control", "public, max-age=3600");
    c.header("Content-Disposition", "inline");
    
    return new Response(webpImage, { 
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (error) {
    console.error(`Error processing image ${id}/${index}:`, error);
    return c.text("Error processing image", 500);
  }
});

// Lấy và chuyển đổi ảnh bìa
app.get("/covers/:manga-id/:cover-filename", async (c) => {
  const mangaId = c.req.param("manga-id");
  const coverFilename = c.req.param("cover-filename");
  const cacheKey = `cover-${mangaId}-${coverFilename}`;

  try {
    // Kiểm tra cache
    const cachedCover = cache.getImage(cacheKey);
    if (cachedCover) {
      c.header("Content-Type", "image/webp");
      c.header("Cache-Control", "public, max-age=86400");
      c.header("Content-Disposition", "inline");
      return new Response(cachedCover, { 
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "Content-Disposition": "inline",
          "Cache-Control": "public, max-age=86400"
        }
      });
    }

    const coverUrl = `${COVER_URL}/${mangaId}/${coverFilename}`;

    // Fetch ảnh gốc
    const response = await axios.get(coverUrl, {
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });

    // Chuyển đổi sang WebP
    const webpCover = await sharp(response.data)
      .webp({ quality: 90 }) // Chất lượng cao hơn cho ảnh bìa
      .toBuffer();

    // Lưu vào cache
    cache.setImage(cacheKey, webpCover);

    c.header("Content-Type", "image/webp");
    c.header("Cache-Control", "public, max-age=86400");
    c.header("Content-Disposition", "inline");
    
    return new Response(webpCover, { 
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch (error) {
    console.error(`Error processing cover ${mangaId}/${coverFilename}:`, error);
    return c.text("Error processing cover image", 500);
  }
});

// Proxy tất cả các request khác tới MangaDex API
app.all("*", async (c) => {
  try {
    const url = new URL(c.req.url);
    const targetPath = url.pathname + url.search;
    if (targetPath === "/") return c.text("SuicaoDex API Proxy", 200);

    const apiUrl = API_BASE_URL + targetPath;
    const userAgent = c.req.header("User-Agent") || "SuicaoDex/1.0";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(apiUrl, {
      method: c.req.method,
      headers: {
        "User-Agent": userAgent,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Copy các headers quan trọng
    const contentType = res.headers.get("Content-Type");
    if (contentType) c.header("Content-Type", contentType);

    // CORS headers
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("API proxy error:", error);
    if (error.name === "AbortError") {
      return c.text("Request timeout", 504);
    }
    return c.text("Internal Server Error", 500);
  }
});

serve({
  fetch: app.fetch,
  port: 3000,
});
