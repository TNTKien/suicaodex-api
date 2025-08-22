import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import axios from "axios";
import sharp = require("sharp");

// Cấu hình sharp
sharp.concurrency(1);

const app = new Hono();

const API_BASE_URL = "https://api.mangadex.org";
const COVER_URL = "https://mangadex.org/covers";

app.use("/favicon.ico", serveStatic({ path: "./favicon.ico" }));

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

app.get("/ch/:id", async (c) => {
  const id = c.req.param("id");

  const useDataSaver = c.req.query("dataSaver") === "true";
  const atHomeAPIUrl = `${API_BASE_URL}/at-home/server/${id}`;

  try {
    const { data: serverData } = await axios.get(atHomeAPIUrl, {
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });

    // const hash = serverData.chapter.hash;

    const fileNames = useDataSaver
      ? Object.values(serverData.chapter.dataSaver)
      : Object.values(serverData.chapter.data);

    // Tạo URL proxy cho client
    const proxiedLinks = fileNames.map(
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

  try {
    const atHomeAPIUrl = `${API_BASE_URL}/at-home/server/${id}`;
    const { data: serverData } = await axios.get(atHomeAPIUrl, {
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });

    const baseUrl = serverData.baseUrl;
    const hash = serverData.chapter.hash;

    const fileNames = useDataSaver
      ? Object.values(serverData.chapter.dataSaver)
      : Object.values(serverData.chapter.data);

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

    const transformStream = sharp().webp({ quality: 85 });

    c.header("Content-Type", "image/webp");
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

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

    const transformStream = sharp().webp({ quality: 85 });

    c.header("Content-Type", "image/webp");
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

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

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
