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
app.use("/favicon.ico", (0, serve_static_1.serveStatic)({ path: "./favicon.ico" }));
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
app.get("/ch/:id", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var id, useDataSaver, atHomeAPIUrl, serverData, fileNames, proxiedLinks, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = c.req.param("id");
                useDataSaver = c.req.query("dataSaver") === "true";
                atHomeAPIUrl = "".concat(API_BASE_URL, "/at-home/server/").concat(id);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, axios_1.default.get(atHomeAPIUrl, {
                        headers: {
                            "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
                        },
                    })];
            case 2:
                serverData = (_a.sent()).data;
                fileNames = useDataSaver
                    ? Object.values(serverData.chapter.dataSaver)
                    : Object.values(serverData.chapter.data);
                proxiedLinks = fileNames.map(function (_, index) {
                    return "images/".concat(id, "/").concat(index).concat(useDataSaver ? "?dataSaver=true" : "");
                });
                return [2 /*return*/, c.json({
                        chapterID: id,
                        images: proxiedLinks,
                        usingDataSaver: useDataSaver,
                    }, 200)];
            case 3:
                error_1 = _a.sent();
                console.error(error_1);
                return [2 /*return*/, c.text("Internal Server Error", 500)];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.get("/images/:id/:index", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var id, index, useDataSaver, atHomeAPIUrl, serverData, baseUrl, hash, fileNames, currentFileName, imagePath, imageUrl, response, transformStream, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = c.req.param("id");
                index = parseInt(c.req.param("index"));
                useDataSaver = c.req.query("dataSaver") === "true";
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                atHomeAPIUrl = "".concat(API_BASE_URL, "/at-home/server/").concat(id);
                return [4 /*yield*/, axios_1.default.get(atHomeAPIUrl, {
                        headers: {
                            "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
                        },
                    })];
            case 2:
                serverData = (_a.sent()).data;
                baseUrl = serverData.baseUrl;
                hash = serverData.chapter.hash;
                fileNames = useDataSaver
                    ? Object.values(serverData.chapter.dataSaver)
                    : Object.values(serverData.chapter.data);
                if (index < 0 || index >= fileNames.length) {
                    return [2 /*return*/, c.text("Image index out of range", 404)];
                }
                currentFileName = fileNames[index];
                imagePath = useDataSaver ? "data-saver" : "data";
                imageUrl = "".concat(baseUrl, "/").concat(imagePath, "/").concat(hash, "/").concat(currentFileName);
                return [4 /*yield*/, axios_1.default.get(imageUrl, {
                        method: "GET",
                        responseType: "stream",
                    })];
            case 3:
                response = _a.sent();
                transformStream = sharp().webp({ quality: 85 });
                c.header("Content-Type", "image/webp");
                c.header("Access-Control-Allow-Origin", "*");
                c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
                c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
                return [2 /*return*/, new Response(response.data.pipe(transformStream), { status: 200 })];
            case 4:
                error_2 = _a.sent();
                console.error(error_2);
                return [2 /*return*/, c.text("Internal Server Error", 500)];
            case 5: return [2 /*return*/];
        }
    });
}); });
app.get("/covers/:manga-id/:cover-filename", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var mangaId, coverFilename, coverUrl, response, transformStream, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mangaId = c.req.param("manga-id");
                coverFilename = c.req.param("cover-filename");
                coverUrl = "".concat(COVER_URL, "/").concat(mangaId, "/").concat(coverFilename);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, axios_1.default.get(coverUrl, {
                        method: "GET",
                        responseType: "stream",
                    })];
            case 2:
                response = _a.sent();
                transformStream = sharp().webp({ quality: 85 });
                c.header("Content-Type", "image/webp");
                c.header("Access-Control-Allow-Origin", "*");
                c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
                c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
                return [2 /*return*/, new Response(response.data.pipe(transformStream), { status: 200 })];
            case 3:
                error_3 = _a.sent();
                console.error(error_3);
                return [2 /*return*/, c.text("Internal Server Error", 500)];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.all("*", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var url, targetPath, apiUrl, res, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                url = new URL(c.req.url);
                targetPath = url.pathname + url.search;
                if (targetPath === "/")
                    return [2 /*return*/, c.text("nothing here", 200)];
                apiUrl = API_BASE_URL + targetPath;
                return [4 /*yield*/, fetch(apiUrl, {
                        method: c.req.method,
                        headers: {
                            "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
                        },
                    })];
            case 1:
                res = _a.sent();
                return [2 /*return*/, new Response(res.body, {
                        status: res.status,
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                            "Access-Control-Allow-Headers": "Content-Type, Authorization",
                        },
                    })];
            case 2:
                error_4 = _a.sent();
                console.error(error_4);
                return [2 /*return*/, c.text("Internal Server Error", 500)];
            case 3: return [2 /*return*/];
        }
    });
}); });
(0, node_server_1.serve)({
    fetch: app.fetch,
    port: 3000,
}, function (info) {
    console.log("Server is running on http://localhost:".concat(info.port));
});
