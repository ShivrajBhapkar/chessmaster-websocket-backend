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
exports.Game = void 0;
exports.isPromoting = isPromoting;
const chess_js_1 = require("chess.js");
const messages_1 = require("./messages");
const db_1 = require("./db");
const crypto_1 = require("crypto");
const SocketManager_1 = require("./SocketManager");
const client_1 = require("@prisma/client");
const GAME_TIME_MS = 10 * 60 * 60 * 1000;
function isPromoting(chess, from, to) {
    if (!from) {
        return false;
    }
    const piece = chess.get(from);
    if ((piece === null || piece === void 0 ? void 0 : piece.type) !== "p") {
        return false;
    }
    if (piece.color !== chess.turn()) {
        return false;
    }
    if (!["1", "8"].some((it) => to.endsWith(it))) {
        return false;
    }
    return chess
        .moves({ square: from, verbose: true })
        .map((it) => it.to)
        .includes(to);
}
class Game {
    constructor(player1UserId, player2UserId, gameId, startTime) {
        this.moveCount = 0;
        this.timer = null;
        this.moveTimer = null;
        this.result = null;
        this.player1TimeConsumed = 0;
        this.player2TimeConsumed = 0;
        this.startTime = new Date(Date.now());
        this.lastMoveTime = new Date(Date.now());
        this.player1UserId = player1UserId;
        this.player2UserId = player2UserId;
        this.board = new chess_js_1.Chess();
        this.gameId = gameId !== null && gameId !== void 0 ? gameId : (0, crypto_1.randomUUID)();
        if (startTime) {
            this.startTime = startTime;
            this.lastMoveTime = startTime;
        }
    }
    seedMoves(moves) {
        console.log(moves);
        moves.forEach((move) => {
            if (isPromoting(this.board, move.from, move.to)) {
                this.board.move({
                    from: move.from,
                    to: move.to,
                    promotion: "q",
                });
            }
            else {
                this.board.move({
                    from: move.from,
                    to: move.to,
                });
            }
        });
        this.moveCount = moves.length;
        if (moves[moves.length - 1]) {
            this.lastMoveTime = moves[moves.length - 1].createdAt;
        }
        moves.map((move, index) => {
            if (move.timeTaken) {
                if (index % 2 === 0) {
                    this.player1TimeConsumed += move.timeTaken;
                }
                else {
                    this.player2TimeConsumed += move.timeTaken;
                }
            }
        });
        this.resetAbandonTimer();
        this.resetMoveTimer();
    }
    updateSecondPlayer(player2UserId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.player2UserId = player2UserId;
            const users = yield db_1.db.user.findMany({
                where: {
                    id: {
                        in: [this.player1UserId, (_a = this.player2UserId) !== null && _a !== void 0 ? _a : ""],
                    },
                },
            });
            try {
                yield this.createGameInDb();
            }
            catch (e) {
                console.error(e);
                return;
            }
            const WhitePlayer = users.find((user) => user.id === this.player1UserId);
            const BlackPlayer = users.find((user) => user.id === this.player2UserId);
            SocketManager_1.socketManager.broadcast(this.gameId, JSON.stringify({
                type: messages_1.INIT_GAME,
                payload: {
                    gameId: this.gameId,
                    whitePlayer: {
                        name: WhitePlayer === null || WhitePlayer === void 0 ? void 0 : WhitePlayer.name,
                        id: this.player1UserId,
                        isGuest: (WhitePlayer === null || WhitePlayer === void 0 ? void 0 : WhitePlayer.provider) === client_1.AuthProvider.GUEST,
                    },
                    blackPlayer: {
                        name: BlackPlayer === null || BlackPlayer === void 0 ? void 0 : BlackPlayer.name,
                        id: this.player2UserId,
                        isGuest: (BlackPlayer === null || BlackPlayer === void 0 ? void 0 : BlackPlayer.provider) === client_1.AuthProvider.GUEST,
                    },
                    fen: this.board.fen(),
                    moves: [],
                },
            }));
        });
    }
    createGameInDb() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.startTime = new Date(Date.now());
            this.lastMoveTime = this.startTime;
            const game = yield db_1.db.game.create({
                data: {
                    id: this.gameId,
                    timeControl: "CLASSICAL",
                    status: "IN_PROGRESS",
                    startAt: this.startTime,
                    currentFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                    whitePlayer: {
                        connect: {
                            id: this.player1UserId,
                        },
                    },
                    blackPlayer: {
                        connect: {
                            id: (_a = this.player2UserId) !== null && _a !== void 0 ? _a : "",
                        },
                    },
                },
                include: {
                    whitePlayer: true,
                    blackPlayer: true,
                },
            });
            this.gameId = game.id;
        });
    }
    addMoveToDb(move, moveTimestamp) {
        return __awaiter(this, void 0, void 0, function* () {
            yield db_1.db.$transaction([
                db_1.db.move.create({
                    data: {
                        gameId: this.gameId,
                        moveNumber: this.moveCount + 1,
                        from: move.from,
                        to: move.to,
                        before: move.before,
                        after: move.after,
                        createdAt: moveTimestamp,
                        timeTaken: moveTimestamp.getTime() - this.lastMoveTime.getTime(),
                        san: move.san,
                    },
                }),
                db_1.db.game.update({
                    data: {
                        currentFen: move.after,
                    },
                    where: {
                        id: this.gameId,
                    },
                }),
            ]);
        });
    }
    makeMove(user, move) {
        return __awaiter(this, void 0, void 0, function* () {
            // validate the type of move using zod
            if (this.board.turn() === "w" && user.userId !== this.player1UserId) {
                return;
            }
            if (this.board.turn() === "b" && user.userId !== this.player2UserId) {
                return;
            }
            if (this.result) {
                console.error(`User ${user.userId} is making a move post game completion`);
                return;
            }
            const moveTimestamp = new Date(Date.now());
            try {
                if (isPromoting(this.board, move.from, move.to)) {
                    this.board.move({
                        from: move.from,
                        to: move.to,
                        promotion: "q",
                    });
                }
                else {
                    this.board.move({
                        from: move.from,
                        to: move.to,
                    });
                }
            }
            catch (e) {
                console.error("Error while making move");
                return;
            }
            // flipped because move has already happened
            if (this.board.turn() === "b") {
                this.player1TimeConsumed =
                    this.player1TimeConsumed +
                        (moveTimestamp.getTime() - this.lastMoveTime.getTime());
            }
            if (this.board.turn() === "w") {
                this.player2TimeConsumed =
                    this.player2TimeConsumed +
                        (moveTimestamp.getTime() - this.lastMoveTime.getTime());
            }
            yield this.addMoveToDb(move, moveTimestamp);
            this.resetAbandonTimer();
            this.resetMoveTimer();
            this.lastMoveTime = moveTimestamp;
            SocketManager_1.socketManager.broadcast(this.gameId, JSON.stringify({
                type: messages_1.MOVE,
                payload: {
                    move,
                    player1TimeConsumed: this.player1TimeConsumed,
                    player2TimeConsumed: this.player2TimeConsumed,
                },
            }));
            if (this.board.isGameOver()) {
                const result = this.board.isDraw()
                    ? "DRAW"
                    : this.board.turn() === "b"
                        ? "WHITE_WINS"
                        : "BLACK_WINS";
                this.endGame("COMPLETED", result);
            }
            this.moveCount++;
        });
    }
    getPlayer1TimeConsumed() {
        if (this.board.turn() === "w") {
            return (this.player1TimeConsumed +
                (new Date(Date.now()).getTime() - this.lastMoveTime.getTime()));
        }
        return this.player1TimeConsumed;
    }
    getPlayer2TimeConsumed() {
        if (this.board.turn() === "b") {
            return (this.player2TimeConsumed +
                (new Date(Date.now()).getTime() - this.lastMoveTime.getTime()));
        }
        return this.player2TimeConsumed;
    }
    resetAbandonTimer() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.timer) {
                clearTimeout(this.timer);
            }
            this.timer = setTimeout(() => {
                this.endGame("ABANDONED", this.board.turn() === "b" ? "WHITE_WINS" : "BLACK_WINS");
            }, 60 * 1000);
        });
    }
    resetMoveTimer() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.moveTimer) {
                clearTimeout(this.moveTimer);
            }
            const turn = this.board.turn();
            const timeLeft = GAME_TIME_MS -
                (turn === "w"
                    ? this.player1TimeConsumed
                    : this.player2TimeConsumed);
            this.moveTimer = setTimeout(() => {
                this.endGame("TIME_UP", turn === "b" ? "WHITE_WINS" : "BLACK_WINS");
            }, timeLeft);
        });
    }
    exitGame(user) {
        return __awaiter(this, void 0, void 0, function* () {
            this.endGame("PLAYER_EXIT", user.userId === this.player2UserId ? "WHITE_WINS" : "BLACK_WINS");
        });
    }
    endGame(status, result) {
        return __awaiter(this, void 0, void 0, function* () {
            const updatedGame = yield db_1.db.game.update({
                data: {
                    status,
                    result: result,
                },
                where: {
                    id: this.gameId,
                },
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
            SocketManager_1.socketManager.broadcast(this.gameId, JSON.stringify({
                type: messages_1.GAME_ENDED,
                payload: {
                    result,
                    status,
                    moves: updatedGame.moves,
                    blackPlayer: {
                        id: updatedGame.blackPlayer.id,
                        name: updatedGame.blackPlayer.name,
                    },
                    whitePlayer: {
                        id: updatedGame.whitePlayer.id,
                        name: updatedGame.whitePlayer.name,
                    },
                },
            }));
            // clear timers
            this.clearTimer();
            this.clearMoveTimer();
        });
    }
    clearMoveTimer() {
        if (this.moveTimer)
            clearTimeout(this.moveTimer);
    }
    setTimer(timer) {
        this.timer = timer;
    }
    clearTimer() {
        if (this.timer)
            clearTimeout(this.timer);
    }
}
exports.Game = Game;
