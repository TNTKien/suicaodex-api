import { Hono } from "hono";
import axios from "axios";
import { PhotonImage } from "@cf-wasm/photon";

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

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of chapterCache.entries()) {
    if (value.expiration <= now) {
      chapterCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

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

app.get("/images/:id/:index", async (c) => {
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

    if (response.data.byteLength > 10 * 1024 * 1024) {
      const contentType = detectImageType(response.data);

      c.header("Content-Type", contentType);
      c.header("Access-Control-Allow-Origin", "*");
      c.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

      return new Response(response.data, { status: 200 });
    }

    c.header("Content-Type", "image/webp");
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    const imageBytes = new Uint8Array(response.data);
    const image = PhotonImage.new_from_byteslice(imageBytes);

    const webpData = image.get_bytes_webp();

    image.free();

    return new Response(webpData, { status: 200 });
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

    // Check image size to prevent memory issues
    if (response.data.byteLength > 5 * 1024 * 1024) {
      const contentType = detectImageType(response.data);

      c.header("Content-Type", contentType);
      c.header("Access-Control-Allow-Origin", "*");
      c.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

      return new Response(response.data, { status: 200 });
    }

    c.header("Content-Type", "image/webp");
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    const imageBytes = new Uint8Array(response.data);
    const image = PhotonImage.new_from_byteslice(imageBytes);

    const webpData = image.get_bytes_webp();

    image.free();

    return new Response(webpData, { status: 200 });
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
