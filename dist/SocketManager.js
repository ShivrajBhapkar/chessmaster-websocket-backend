"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketManager = exports.User = void 0;
const crypto_1 = require("crypto");
class User {
    constructor(socket, userJwtClaims) {
        this.socket = socket;
        this.userId = userJwtClaims.userId;
        this.id = (0, crypto_1.randomUUID)();
        this.name = userJwtClaims.name;
        this.isGuest = userJwtClaims.isGuest;
    }
}
exports.User = User;
class SocketManager {
    constructor() {
        this.interestedSockets = new Map();
        this.userRoomMappping = new Map();
    }
    static getInstance() {
        if (SocketManager.instance) {
            return SocketManager.instance;
        }
        SocketManager.instance = new SocketManager();
        return SocketManager.instance;
    }
    addUser(user, roomId) {
        this.interestedSockets.set(roomId, [
            ...(this.interestedSockets.get(roomId) || []),
            user,
        ]);
        this.userRoomMappping.set(user.userId, roomId);
    }
    broadcast(roomId, message) {
        const users = this.interestedSockets.get(roomId);
        if (!users) {
            console.error("No users in room?");
            return;
        }
        users.forEach((user) => {
            user.socket.send(message);
        });
    }
    removeUser(user) {
        var _a;
        const roomId = this.userRoomMappping.get(user.userId);
        if (!roomId) {
            console.error("User was not interested in any room?");
            return;
        }
        const room = this.interestedSockets.get(roomId) || [];
        const remainingUsers = room.filter((u) => u.userId !== user.userId);
        this.interestedSockets.set(roomId, remainingUsers);
        if (((_a = this.interestedSockets.get(roomId)) === null || _a === void 0 ? void 0 : _a.length) === 0) {
            this.interestedSockets.delete(roomId);
        }
        this.userRoomMappping.delete(user.userId);
    }
}
exports.socketManager = SocketManager.getInstance();
