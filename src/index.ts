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
  // Mặc định không sử dụng dataSaver trừ khi có tham số dataSaver=true
  const useDataSaver = c.req.query("dataSaver") === "true";
  const atHomeAPIUrl = `${API_BASE_URL}/at-home/server/${id}`;
  
  try {
    // Luôn lấy dữ liệu mới từ MangaDex API
    const { data: serverData } = await axios.get(atHomeAPIUrl, {
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });
    
    // Lấy thông tin cần thiết
    const hash = serverData.chapter.hash;
    
    // Lựa chọn giữa data gốc hoặc dataSaver (phiên bản đã nén của MangaDex)
    const fileNames = useDataSaver 
      ? Object.values(serverData.chapter.dataSaver)
      : Object.values(serverData.chapter.data);
    
    // Tạo URL proxy cho client
    const proxiedLinks = fileNames.map(
      (_: any, index: any) => `images/${id}/${index}${useDataSaver ? "?dataSaver=true" : ""}`
    );

    return c.json(
      {
        chapterID: id,
        images: proxiedLinks,
        // Trả về thông tin về phiên bản đang sử dụng
        usingDataSaver: useDataSaver
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
  // Mặc định không sử dụng dataSaver trừ khi có tham số dataSaver=true
  const useDataSaver = c.req.query("dataSaver") === "true";

  try {
    // Lấy dữ liệu trực tiếp từ MangaDex API
    const atHomeAPIUrl = `${API_BASE_URL}/at-home/server/${id}`;
    const { data: serverData } = await axios.get(atHomeAPIUrl, {
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });
    
    // Lấy thông tin cần thiết
    // Sử dụng baseUrl từ response của MangaDex thay vì API_BASE_URL
    const baseUrl = serverData.baseUrl;
    const hash = serverData.chapter.hash;
    
    // Lựa chọn giữa data gốc hoặc dataSaver
    const fileNames = useDataSaver 
      ? Object.values(serverData.chapter.dataSaver)
      : Object.values(serverData.chapter.data);
    
    // Kiểm tra index hợp lệ
    if (index < 0 || index >= fileNames.length) {
      return c.text("Image index out of range", 404);
    }
    
    // Tạo URL ảnh
    const currentFileName = fileNames[index] as string;
    // Sử dụng đường dẫn khác nhau cho data gốc và dataSaver
    const imagePath = useDataSaver ? "data-saver" : "data";
    const imageUrl = `${baseUrl}/${imagePath}/${hash}/${currentFileName}`;
    
    // Lấy ảnh từ MangaDex
    const response = await axios.get(imageUrl, {
      method: "GET",
      responseType: "stream",
    });

    // Chuyển đổi ảnh sang WebP qua stream
    const transformStream = sharp().webp({ quality: 85 });
    
    // Thiết lập header
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
