import { Hono } from "hono";
import { serveStatic } from "hono/bun";

import axios from "axios";
import sharp = require("sharp");

sharp.concurrency(1);

// sharp.cache(false);

const app = new Hono();

const API_BASE_URL = "https://api.mangadex.org";
const COVER_URL = "https://mangadex.org/covers";

// Đã loại bỏ cache URL ảnh

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
  const atHomeAPIUrl = `${API_BASE_URL}/at-home/server/${id}`;
  try {
    // Luôn lấy dữ liệu mới từ MangaDex API
    const { data: serverData } = await axios.get(atHomeAPIUrl, {
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });
    
    // Lấy thông tin cần thiết
    const baseUrl = serverData.baseUrl;
    const hash = serverData.chapter.hash;
    const fileNames = Object.values(serverData.chapter.data);
    
    // Tạo URL proxy cho client
    const proxiedLinks = fileNames.map(
      (_: any, index: any) => `images/${id}/${index}`
    );

    // Không cần lưu thông tin vào context nữa vì chúng ta sẽ luôn truy vấn trực tiếp

    return c.json(
      {
        chapterID: id,
        images: proxiedLinks,
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

  try {
    // Lấy dữ liệu trực tiếp từ MangaDex API
    const atHomeAPIUrl = `${API_BASE_URL}/at-home/server/${id}`;
    const { data: serverData } = await axios.get(atHomeAPIUrl, {
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });
    
    // Lấy thông tin cần thiết
    const baseUrl = serverData.baseUrl;
    const hash = serverData.chapter.hash;
    const fileNames = Object.values(serverData.chapter.data);
    
    // Kiểm tra index hợp lệ
    if (index < 0 || index >= fileNames.length) {
      return c.text("Image index out of range", 404);
    }
    
    // Tạo URL ảnh
    const currentFileName = fileNames[index] as string;
    const imageUrl = `${baseUrl}/data/${hash}/${currentFileName}`;
    
    // Lấy ảnh từ MangaDex
    const response = await axios.get(imageUrl, {
      method: "GET",
      responseType: "stream",
    });

    // Xác định Content-Type dựa trên phần mở rộng của file
    const fileExt = currentFileName.split('.').pop()?.toLowerCase() || 'jpg';
    let contentType = "image/jpeg";
    
    if (fileExt === "png") contentType = "image/png";
    else if (fileExt === "webp") contentType = "image/webp";
    else if (fileExt === "gif") contentType = "image/gif";
    
    // Thiết lập header
    c.header("Content-Type", contentType);
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

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
      responseType: "stream",
    });

    // Chuyển đổi ảnh sang WebP qua stream
    const transformStream = sharp().webp({ quality: 85 });

    c.header("Content-Type", "image/webp");
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Pipe dữ liệu ảnh qua `sharp` và gửi trực tiếp response
    return new Response(response.data.pipe(transformStream), { status: 200 });
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

export default {
  port: 3001,
  fetch: app.fetch,
};
