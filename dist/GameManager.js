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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameManager = void 0;
const messages_1 = require("./messages");
const Game_1 = require("./Game");
const SocketManager_1 = require("./SocketManager");
const client_1 = require("@prisma/client");
const db_1 = require("./db");
// User, Game
class GameManager {
    constructor() {
        this.games = [];
        this.pendingGameId = null;
        this.users = [];
    }
    addUser(user) {
        this.users.push(user);
        this.addHandler(user);
    }
    removeUser(socket) {
        const user = this.users.find((user) => user.socket === socket);
        if (!user) {
            console.error("User not found?");
            return;
        }
        this.users = this.users.filter((user) => user.socket !== socket);
        SocketManager_1.socketManager.removeUser(user);
    }
    removeGame(gameId) {
        this.games = this.games.filter((g) => g.gameId !== gameId);
    }
    addHandler(user) {
        user.socket.on("message", (data) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const message = JSON.parse(data.toString());
            if (message.type === messages_1.INIT_GAME) {
                if (this.pendingGameId) {
                    const game = this.games.find((x) => x.gameId === this.pendingGameId);
                    if (!game) {
                        console.error("Pending game not found?");
                        return;
                    }
                    if (user.userId === game.player1UserId) {
                        SocketManager_1.socketManager.broadcast(game.gameId, JSON.stringify({
                            type: messages_1.GAME_ALERT,
                            payload: {
                                message: "Trying to Connect with yourself?",
                            },
                        }));
                        return;
                    }
                    SocketManager_1.socketManager.addUser(user, game.gameId);
                    yield (game === null || game === void 0 ? void 0 : game.updateSecondPlayer(user.userId));
                    this.pendingGameId = null;
                }
                else {
                    const game = new Game_1.Game(user.userId, null);
                    this.games.push(game);
                    this.pendingGameId = game.gameId;
                    SocketManager_1.socketManager.addUser(user, game.gameId);
                    SocketManager_1.socketManager.broadcast(game.gameId, JSON.stringify({
                        type: messages_1.GAME_ADDED,
                        gameId: game.gameId,
                    }));
                }
            }
            if (message.type === messages_1.MOVE) {
                const gameId = message.payload.gameId;
                const game = this.games.find((game) => game.gameId === gameId);
                if (game) {
                    game.makeMove(user, message.payload.move);
                    if (game.result) {
                        this.removeGame(game.gameId);
                    }
                }
            }
            if (message.type === messages_1.EXIT_GAME) {
                const gameId = message.payload.gameId;
                const game = this.games.find((game) => game.gameId === gameId);
                if (game) {
                    game.exitGame(user);
                    this.removeGame(game.gameId);
                }
            }
            if (message.type === messages_1.JOIN_ROOM) {
                const gameId = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.gameId;
                if (!gameId) {
                    return;
                }
                let availableGame = this.games.find((game) => game.gameId === gameId);
                const gameFromDb = yield db_1.db.game.findUnique({
                    where: { id: gameId },
                    include: {
                        moves: {
                            orderBy: {
                                moveNumber: "asc",
                            },
                        },
                        blackPlayer: true,
                        whitePlayer: true,
                    },
                });
                // There is a game created but no second player available
                if (availableGame && !availableGame.player2UserId) {
                    SocketManager_1.socketManager.addUser(user, availableGame.gameId);
                    yield availableGame.updateSecondPlayer(user.userId);
                    return;
                }
                if (!gameFromDb) {
                    user.socket.send(JSON.stringify({
                        type: messages_1.GAME_NOT_FOUND,
                    }));
                    return;
                }
                if (gameFromDb.status !== client_1.GameStatus.IN_PROGRESS) {
                    user.socket.send(JSON.stringify({
                        type: messages_1.GAME_ENDED,
                        payload: {
                            result: gameFromDb.result,
                            status: gameFromDb.status,
                            moves: gameFromDb.moves,
                            blackPlayer: {
                                id: gameFromDb.blackPlayer.id,
                                name: gameFromDb.blackPlayer.name,
                            },
                            whitePlayer: {
                                id: gameFromDb.whitePlayer.id,
                                name: gameFromDb.whitePlayer.name,
                            },
                        },
                    }));
                    return;
                }
                if (!availableGame) {
                    const game = new Game_1.Game(gameFromDb === null || gameFromDb === void 0 ? void 0 : gameFromDb.whitePlayerId, gameFromDb === null || gameFromDb === void 0 ? void 0 : gameFromDb.blackPlayerId, gameFromDb.id, gameFromDb.startAt);
                    game.seedMoves((gameFromDb === null || gameFromDb === void 0 ? void 0 : gameFromDb.moves) || []);
                    this.games.push(game);
                    availableGame = game;
                }
                console.log(availableGame.getPlayer1TimeConsumed());
                console.log(availableGame.getPlayer2TimeConsumed());
                user.socket.send(JSON.stringify({
                    type: messages_1.GAME_JOINED,
                    payload: {
                        gameId,
                        moves: gameFromDb.moves,
                        blackPlayer: {
                            id: gameFromDb.blackPlayer.id,
                            name: gameFromDb.blackPlayer.name,
                        },
                        whitePlayer: {
                            id: gameFromDb.whitePlayer.id,
                            name: gameFromDb.whitePlayer.name,
                        },
                        player1TimeConsumed: availableGame.getPlayer1TimeConsumed(),
                        player2TimeConsumed: availableGame.getPlayer2TimeConsumed(),
                    },
                }));
                SocketManager_1.socketManager.addUser(user, gameId);
            }
        }));
    }
}
exports.GameManager = GameManager;
