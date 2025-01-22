"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const GameManager_1 = require("./GameManager");
const url_1 = __importDefault(require("url"));
const auth_1 = require("./auth");
const wss = new ws_1.WebSocketServer({ port: 8080 });
const gameManager = new GameManager_1.GameManager();
wss.on("connection", function connection(ws, req) {
    console.log("Connection happen! ! ! !");
    //@ts-ignore
    const token = url_1.default.parse(req.url, true).query.token;
    const user = (0, auth_1.extractAuthUser)(token, ws);
    gameManager.addUser(user);
    ws.on("close", () => {
        gameManager.removeUser(ws);
    });
});
console.log("done");
