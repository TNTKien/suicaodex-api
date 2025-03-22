"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var hono_1 = require("hono");
var node_server_1 = require("@hono/node-server");
var serve_static_1 = require("@hono/node-server/serve-static");
var axios_1 = require("axios");
var sharp = require("sharp");
// Cấu hình sharp
sharp.concurrency(1);
var app = new hono_1.Hono();
var API_BASE_URL = "https://api.mangadex.org";
var COVER_URL = "https://mangadex.org/covers";
// Cache đơn giản với cơ chế tự động dọn dẹp
var SimpleCache = /** @class */ (function () {
    function SimpleCache() {
        var _this = this;
        this.chapterCache = new Map();
        this.imageCache = new Map();
        this.CHAPTER_TTL = 10 * 60 * 1000; // 10 phút
        this.IMAGE_TTL = 30 * 60 * 1000; // 30 phút
        // Dọn dẹp cache mỗi 10 phút
        setInterval(function () { return _this.cleanup(); }, 10 * 60 * 1000);
    }
    SimpleCache.prototype.setChapter = function (key, value) {
        this.chapterCache.set(key, {
            data: value,
            expiry: Date.now() + this.CHAPTER_TTL,
        });
    };
    SimpleCache.prototype.getChapter = function (key) {
        var item = this.chapterCache.get(key);
        if (!item)
            return null;
        if (item.expiry < Date.now()) {
            this.chapterCache.delete(key);
            return null;
        }
        return item.data;
    };
    SimpleCache.prototype.setImage = function (key, value) {
        this.imageCache.set(key, {
            data: value,
            expiry: Date.now() + this.IMAGE_TTL,
        });
    };
    SimpleCache.prototype.getImage = function (key) {
        var item = this.imageCache.get(key);
        if (!item)
            return null;
        if (item.expiry < Date.now()) {
            this.imageCache.delete(key);
            return null;
        }
        return item.data;
    };
    SimpleCache.prototype.cleanup = function () {
        var _this = this;
        var now = Date.now();
        // Replace Map.entries() iteration with forEach to avoid downlevelIteration issues
        this.chapterCache.forEach(function (item, key) {
            if (item.expiry < now)
                _this.chapterCache.delete(key);
        });
        this.imageCache.forEach(function (item, key) {
            if (item.expiry < now)
                _this.imageCache.delete(key);
        });
    };
    return SimpleCache;
}());
var cache = new SimpleCache();
// Middleware và các route xử lý
app.use("/favicon.ico", (0, serve_static_1.serveStatic)({ path: "./favicon.ico" }));
// Kiểm tra headers
app.use("*", function (c, next) { return __awaiter(void 0, void 0, void 0, function () {
    var viaHeader, userAgent;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                viaHeader = c.req.header("Via");
                if (viaHeader)
                    return [2 /*return*/, c.text('Requests with "Via" header are not allowed.', 403)];
                userAgent = c.req.header("User-Agent");
                if (!userAgent)
                    return [2 /*return*/, c.text("User-Agent header is required.", 400)];
                return [4 /*yield*/, next()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
// CORS middleware
app.use("*", function (c, next) {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return next();
});
// Lấy thông tin chapter
app.get("/ch/:id", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var id, atHomeAPIUrl, links, response, serverData, baseUrl_1, hash_1, fileNames, proxiedLinks, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = c.req.param("id");
                atHomeAPIUrl = "".concat(API_BASE_URL, "/at-home/server/").concat(id);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                links = cache.getChapter(id);
                if (!!links) return [3 /*break*/, 3];
                return [4 /*yield*/, axios_1.default.get(atHomeAPIUrl, {
                        headers: {
                            "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
                        },
                        timeout: 10000,
                    })];
            case 2:
                response = _a.sent();
                serverData = response.data;
                baseUrl_1 = serverData.baseUrl;
                hash_1 = serverData.chapter.hash;
                fileNames = serverData.chapter.data;
                links = fileNames.map(function (fileName) { return "".concat(baseUrl_1, "/data/").concat(hash_1, "/").concat(fileName); });
                cache.setChapter(id, links);
                _a.label = 3;
            case 3:
                proxiedLinks = links.map(function (_, index) { return "images/".concat(id, "/").concat(index); });
                return [2 /*return*/, c.json({
                        chapterID: id,
                        images: proxiedLinks,
                    }, 200)];
            case 4:
                error_1 = _a.sent();
                console.error("Error fetching chapter:", error_1);
                return [2 /*return*/, c.text("Failed to fetch chapter data", 500)];
            case 5: return [2 /*return*/];
        }
    });
}); });
// Lấy và chuyển đổi hình ảnh chapter
app.get("/images/:id/:index", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var id, index, cacheKey, cachedImage, links, imageUrl, response, webpImage, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = c.req.param("id");
                index = parseInt(c.req.param("index"));
                cacheKey = "".concat(id, "-").concat(index);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                cachedImage = cache.getImage(cacheKey);
                if (cachedImage) {
                    c.header("Content-Type", "image/webp");
                    c.header("Cache-Control", "public, max-age=3600");
                    c.header("Content-Disposition", "inline"); // Thêm header này để trình duyệt hiển thị ảnh
                    return [2 /*return*/, new Response(cachedImage, {
                            status: 200,
                            headers: {
                                "Content-Type": "image/webp",
                                "Content-Disposition": "inline",
                                "Cache-Control": "public, max-age=3600"
                            }
                        })];
                }
                links = cache.getChapter(id);
                if (!links)
                    return [2 /*return*/, c.text("Chapter not found", 404)];
                imageUrl = links[index];
                if (!imageUrl)
                    return [2 /*return*/, c.text("Image not found", 404)];
                return [4 /*yield*/, axios_1.default.get(imageUrl, {
                        responseType: "arraybuffer",
                        timeout: 15000,
                        headers: {
                            "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
                        },
                    })];
            case 2:
                response = _a.sent();
                return [4 /*yield*/, sharp(response.data)
                        .webp({ quality: 85 })
                        .toBuffer()];
            case 3:
                webpImage = _a.sent();
                // Lưu vào cache
                cache.setImage(cacheKey, webpImage);
                c.header("Content-Type", "image/webp");
                c.header("Cache-Control", "public, max-age=3600");
                c.header("Content-Disposition", "inline");
                return [2 /*return*/, new Response(webpImage, {
                        status: 200,
                        headers: {
                            "Content-Type": "image/webp",
                            "Content-Disposition": "inline",
                            "Cache-Control": "public, max-age=3600"
                        }
                    })];
            case 4:
                error_2 = _a.sent();
                console.error("Error processing image ".concat(id, "/").concat(index, ":"), error_2);
                return [2 /*return*/, c.text("Error processing image", 500)];
            case 5: return [2 /*return*/];
        }
    });
}); });
// Lấy và chuyển đổi ảnh bìa
app.get("/covers/:manga-id/:cover-filename", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var mangaId, coverFilename, cacheKey, cachedCover, coverUrl, response, webpCover, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mangaId = c.req.param("manga-id");
                coverFilename = c.req.param("cover-filename");
                cacheKey = "cover-".concat(mangaId, "-").concat(coverFilename);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                cachedCover = cache.getImage(cacheKey);
                if (cachedCover) {
                    c.header("Content-Type", "image/webp");
                    c.header("Cache-Control", "public, max-age=86400");
                    c.header("Content-Disposition", "inline");
                    return [2 /*return*/, new Response(cachedCover, {
                            status: 200,
                            headers: {
                                "Content-Type": "image/webp",
                                "Content-Disposition": "inline",
                                "Cache-Control": "public, max-age=86400"
                            }
                        })];
                }
                coverUrl = "".concat(COVER_URL, "/").concat(mangaId, "/").concat(coverFilename);
                return [4 /*yield*/, axios_1.default.get(coverUrl, {
                        responseType: "arraybuffer",
                        timeout: 10000,
                        headers: {
                            "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
                        },
                    })];
            case 2:
                response = _a.sent();
                return [4 /*yield*/, sharp(response.data)
                        .webp({ quality: 90 }) // Chất lượng cao hơn cho ảnh bìa
                        .toBuffer()];
            case 3:
                webpCover = _a.sent();
                // Lưu vào cache
                cache.setImage(cacheKey, webpCover);
                c.header("Content-Type", "image/webp");
                c.header("Cache-Control", "public, max-age=86400");
                c.header("Content-Disposition", "inline");
                return [2 /*return*/, new Response(webpCover, {
                        status: 200,
                        headers: {
                            "Content-Type": "image/webp",
                            "Content-Disposition": "inline",
                            "Cache-Control": "public, max-age=86400"
                        }
                    })];
            case 4:
                error_3 = _a.sent();
                console.error("Error processing cover ".concat(mangaId, "/").concat(coverFilename, ":"), error_3);
                return [2 /*return*/, c.text("Error processing cover image", 500)];
            case 5: return [2 /*return*/];
        }
    });
}); });
// Proxy tất cả các request khác tới MangaDex API
app.all("*", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var url, targetPath, apiUrl, userAgent, controller_1, timeoutId, res, contentType, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                url = new URL(c.req.url);
                targetPath = url.pathname + url.search;
                if (targetPath === "/")
                    return [2 /*return*/, c.text("SuicaoDex API Proxy", 200)];
                apiUrl = API_BASE_URL + targetPath;
                userAgent = c.req.header("User-Agent") || "SuicaoDex/1.0";
                controller_1 = new AbortController();
                timeoutId = setTimeout(function () { return controller_1.abort(); }, 15000);
                return [4 /*yield*/, fetch(apiUrl, {
                        method: c.req.method,
                        headers: {
                            "User-Agent": userAgent,
                        },
                        signal: controller_1.signal,
                    })];
            case 1:
                res = _a.sent();
                clearTimeout(timeoutId);
                contentType = res.headers.get("Content-Type");
                if (contentType)
                    c.header("Content-Type", contentType);
                // CORS headers
                c.header("Access-Control-Allow-Origin", "*");
                c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
                c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
                return [2 /*return*/, new Response(res.body, {
                        status: res.status,
                        headers: {
                            "Content-Type": "application/json",
                        },
                    })];
            case 2:
                error_4 = _a.sent();
                console.error("API proxy error:", error_4);
                if (error_4.name === "AbortError") {
                    return [2 /*return*/, c.text("Request timeout", 504)];
                }
                return [2 /*return*/, c.text("Internal Server Error", 500)];
            case 3: return [2 /*return*/];
        }
    });
}); });
(0, node_server_1.serve)({
    fetch: app.fetch,
    port: 3000
}, function (info) {
    console.log("Server is running on http://localhost:".concat(info.port));
});
