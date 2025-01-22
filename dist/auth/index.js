"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAuthUser = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const SocketManager_1 = require("../SocketManager");
const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";
const extractAuthUser = (token, ws) => {
    const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
    return new SocketManager_1.User(ws, decoded);
};
exports.extractAuthUser = extractAuthUser;
