import { Hono } from "hono";
import { serveStatic } from "hono/bun";

import axios from "axios";

const app = new Hono();

const MGD_BASE_URL = "https://api.mangadex.org";
const COVER_URL = "https://mangadex.org/covers";

const MIMI_BASE_URL = "https://mimihentai.com/api/v1";

const chapterCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

function setCacheWithTTL(key: any, value: any) {
  const expiration = Date.now() + CACHE_TTL;
  chapterCache.set(key, { value, expiration });

  setTimeout(() => {
    if (chapterCache.get(key)?.expiration <= Date.now()) {
      chapterCache.delete(key);
    }
  }, CACHE_TTL);
}

function getCache(key: any) {
  const cached = chapterCache.get(key);
  if (cached && cached.expiration > Date.now()) {
    return cached.value;
  }

  chapterCache.delete(key);
  return null;
}

app.use("/favicon.ico", serveStatic({ path: "./favicon.ico" }));

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
  const id = c.req.param("id");
  const useDataSaver = c.req.query("dataSaver") === "true";

  const cacheKey = `${id}:${useDataSaver ? "saver" : "full"}`;

  try {
    let chapterInfo = getCache(cacheKey);

    if (!chapterInfo) {
      const atHomeAPIUrl = `${MGD_BASE_URL}/at-home/server/${id}`;
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
          : Object.values(serverData.chapter.data),
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
  // Kiểm tra xem có query parameter 'url' không
  const imageUrl = c.req.query("url");

  if (imageUrl) {
    // Xử lý như route proxy-image cũ
    try {
      // Decode URL và xử lý an toàn
      let decodedUrl;
      try {
        decodedUrl = decodeURIComponent(imageUrl);
        new URL(decodedUrl); // Kiểm tra URL có hợp lệ không
      } catch (error) {
        console.error("Invalid URL format:", imageUrl);
        return c.text("Invalid URL format", 400);
      }

      // Đảm bảo URL bắt đầu với http hoặc https
      if (
        !decodedUrl.startsWith("http://") &&
        !decodedUrl.startsWith("https://")
      ) {
        return c.text("URL must start with http:// or https://", 400);
      }

      // Tạo ETag đơn giản từ URL
      const cacheKey = `"${btoa(decodedUrl).slice(0, 20)}"`;
      const etagHeader = c.req.header("if-none-match");

      // Trả về 304 Not Modified nếu ETag khớp
      if (etagHeader && etagHeader === cacheKey) {
        c.header("Cache-Control", "public, max-age=86400");
        c.header("ETag", cacheKey);
        return c.body(null, 304);
      }

      // Fetch ảnh từ URL gốc với responseType là arraybuffer
      const imageResponse = await axios.get(decodedUrl, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": c.req.header("user-agent") || "Mozilla/5.0",
          Accept: "image/*,*/*;q=0.8",
          Referer: new URL(decodedUrl).origin,
          Origin: new URL(decodedUrl).origin,
          "If-None-Match": etagHeader || "",
          "If-Modified-Since": c.req.header("if-modified-since") || "",
        },
        maxRedirects: 5,
        timeout: 10000,
      });

      // Lấy content-type từ response headers
      const contentType = imageResponse.headers["content-type"] || "image/jpeg";

      // Kiểm tra xem đây có phải là ảnh không
      if (!contentType.startsWith("image/")) {
        return c.text("URL does not point to an image", 400);
      }

      // Tạo một Uint8Array từ dữ liệu nhận được
      const buffer = Buffer.from(imageResponse.data);

      // Thiết lập các header cần thiết
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Accept",
          "X-Proxy-Origin": new URL(decodedUrl).hostname,
          ETag: cacheKey,
        },
      });
    } catch (error) {
      console.error("Error in image proxy:", error);
      return c.text(`Internal Server Error`, 500);
    }
  } else {
    // Nếu không có query parameter 'url', trả về thông báo lỗi
    return c.text(
      'Missing URL parameter. Please provide a valid "url" query parameter.',
      400
    );
  }
});

app.get("/images/:id/:index", async (c) => {
  const id = c.req.param("id");
  const index = parseInt(c.req.param("index"));

  const useDataSaver = c.req.query("dataSaver") === "true";

  const cacheKey = `${id}:${useDataSaver ? "saver" : "full"}`;

  try {
    let chapterInfo = getCache(cacheKey);

    if (!chapterInfo) {
      const atHomeAPIUrl = `${MGD_BASE_URL}/at-home/server/${id}`;
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
          : Object.values(serverData.chapter.data),
      };

      setCacheWithTTL(cacheKey, chapterInfo);
    }

    const { baseUrl, hash, fileNames } = chapterInfo;

    if (index < 0 || index >= fileNames.length) {
      return c.text("Image index out of range", 404);
    }

    const currentFileName = fileNames[index] as string;
    const imagePath = useDataSaver ? "data-saver" : "data";
    const imageUrl = `${baseUrl}/${imagePath}/${hash}/${currentFileName}`;

    const response = await axios.get(imageUrl, {
      method: "GET",
      responseType: "stream",
    });

    // Xác định Content-Type dựa trên phần mở rộng của file
    const fileExt = currentFileName.split(".").pop()?.toLowerCase() || "jpg";
    let contentType = "image/jpeg";

    if (fileExt === "png") contentType = "image/png";
    else if (fileExt === "webp") contentType = "image/webp";
    else if (fileExt === "gif") contentType = "image/gif";

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

  const coverUrl = `${COVER_URL}/${mangaId}/${coverFilename}`;

  try {
    const response = await axios.get(coverUrl, {
      method: "GET",
      responseType: "stream",
    });

    // Xác định Content-Type dựa trên phần mở rộng của file
    const fileExt = coverFilename.split(".").pop()?.toLowerCase() || "jpg";
    let contentType = "image/jpeg";

    if (fileExt === "png") contentType = "image/png";
    else if (fileExt === "webp") contentType = "image/webp";
    else if (fileExt === "gif") contentType = "image/gif";

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

// Handle mimihentai.com API requests
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

// Handle mangadex.org API requests
app.all("*", async (c) => {
  try {
    const url = new URL(c.req.url);
    const targetPath = url.pathname + url.search;
    if (targetPath === "/") return c.text("nothing here", 200);

    const apiUrl = MGD_BASE_URL + targetPath;
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

export default {
  port: 3001,
  fetch: app.fetch,
};
