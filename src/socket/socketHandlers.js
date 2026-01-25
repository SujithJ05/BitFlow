const axios = require("axios");
const ACTIONS = require("../Actions");
const RoomController = require("../controllers/roomController");
const RateLimiter = require("../utils/RateLimiter");

const userSocketMap = {};
const cleanupTimeouts = {};
const codeRunLimiter = new RateLimiter(5, 10000); // 5 runs every 10 seconds

function getAllConnectedClients(io, roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => ({
            socketId,
            username: userSocketMap[socketId],
        })
    );
}

module.exports = (io) => {
    io.on("connection", (socket) => {
        socket.on(ACTIONS.JOIN, async ({ roomId, username }) => {
            if (!roomId || !username) return;

            userSocketMap[socket.id] = username;
            socket.join(roomId);

            // Clear cleanup timeout if someone joins back
            if (cleanupTimeouts[roomId]) {
                clearTimeout(cleanupTimeouts[roomId]);
                delete cleanupTimeouts[roomId];
            }

            const state = await RoomController.getRoom(roomId);
            const clients = getAllConnectedClients(io, roomId);

            clients.forEach(({ socketId }) => {
                io.to(socketId).emit(ACTIONS.JOINED, {
                    clients,
                    username,
                    socketId: socket.id,
                });
            });

            io.to(socket.id).emit(ACTIONS.FILES_SYNC, state);
        });

        socket.on(ACTIONS.FILE_CHANGE, ({ roomId, fileName, newCode }) => {
            if (!roomId || !fileName || newCode === undefined) return;
            
            // Security: Limit file size to 1MB
            if (newCode.length > 1000000) return;

            const room = RoomController.getRoomSync(roomId);
            if (room) {
                room.files[fileName] = newCode;
                socket.in(roomId).emit(ACTIONS.FILE_CHANGE, { fileName, newCode });
                RoomController.updateRoomState(roomId, { files: room.files });
            }
        });

        socket.on(ACTIONS.CURSOR_MOVE, ({ roomId, cursor, username }) => {
            socket.in(roomId).emit(ACTIONS.CURSOR_MOVE, { cursor, username, socketId: socket.id });
        });

        socket.on(ACTIONS.SEND_MESSAGE, ({ roomId, text, username }) => {
            if (!text || text.length > 2000) return;
            const message = { username, text, time: new Date() };
            const room = RoomController.getRoomSync(roomId);
            if (room) {
                if (!room.messages) room.messages = [];
                room.messages.push(message);
                io.to(roomId).emit(ACTIONS.RECEIVE_MESSAGE, message);
                RoomController.updateRoomState(roomId, { messages: room.messages });
            }
        });

        socket.on(ACTIONS.FILE_CREATE, ({ roomId, fileName }) => {
            if (!roomId || !fileName) return;
            const sanitizedName = fileName.replace(/[^a-zA-Z0-9._\-/]/g, '').substring(0, 50);
            if (!sanitizedName) return;

            const room = RoomController.getRoomSync(roomId);
            if (room && !room.files[sanitizedName]) {
                room.files[sanitizedName] = "";
                io.to(roomId).emit(ACTIONS.FILES_SYNC, room);
                RoomController.updateRoomState(roomId, { files: room.files });
            }
        });

        socket.on(ACTIONS.FILE_DELETE, ({ roomId, fileName }) => {
            if (!roomId || !fileName) return;
            const room = RoomController.getRoomSync(roomId);
            if (room) {
                if (room.files[fileName]) {
                    delete room.files[fileName];
                } else {
                    const prefix = fileName + '/';
                    Object.keys(room.files).forEach(key => {
                        if (key.startsWith(prefix)) delete room.files[key];
                    });
                }

                if (room.activeFile === fileName || (room.activeFile && room.activeFile.startsWith(fileName + '/'))) {
                    const remainingFiles = Object.keys(room.files);
                    room.activeFile = remainingFiles.length > 0 ? remainingFiles[0] : null;
                }
                io.to(roomId).emit(ACTIONS.FILES_SYNC, room);
                RoomController.updateRoomState(roomId, { files: room.files, activeFile: room.activeFile });
            }
        });

        socket.on(ACTIONS.FILE_RENAME, ({ roomId, oldFileName, newFileName }) => {
            if (!roomId || !oldFileName || !newFileName) return;
            const sanitizedNewName = newFileName.replace(/[^a-zA-Z0-9._\-/]/g, '').substring(0, 50);
            const room = RoomController.getRoomSync(roomId);
            if (room) {
                let changed = false;
                if (room.files[oldFileName] !== undefined && room.files[sanitizedNewName] === undefined) {
                    room.files[sanitizedNewName] = room.files[oldFileName];
                    delete room.files[oldFileName];
                    if (room.activeFile === oldFileName) room.activeFile = sanitizedNewName;
                    changed = true;
                } else {
                    const oldPrefix = oldFileName + '/';
                    const newPrefix = sanitizedNewName + '/';
                    Object.keys(room.files).forEach(key => {
                        if (key.startsWith(oldPrefix)) {
                            const newKey = newPrefix + key.substring(oldPrefix.length);
                            room.files[newKey] = room.files[key];
                            delete room.files[key];
                            if (room.activeFile === key) room.activeFile = newKey;
                            changed = true;
                        }
                    });
                }
                if (changed) {
                    io.to(roomId).emit(ACTIONS.FILES_SYNC, room);
                    RoomController.updateRoomState(roomId, { files: room.files, activeFile: room.activeFile });
                }
            }
        });

        socket.on(ACTIONS.CODE_RUN, async ({ roomId, fileName, code }) => {
            if (!codeRunLimiter.isAllowed(socket.id)) {
                return io.to(socket.id).emit(ACTIONS.CODE_RUN, { result: "Rate limit exceeded. Please wait a moment." });
            }

            const extension = fileName.split(".").pop().toLowerCase();
            const languageMap = { js: "javascript", py: "python", cpp: "cpp", c: "c", java: "java", cs: "csharp", go: "go", rs: "rust" };
            const language = languageMap[extension] || "javascript";

            try {
                const response = await axios.post("https://emkc.org/api/v2/piston/execute", {
                    language, version: "*", files: [{ content: code }]
                });
                const result = response.data.run.output || "No output.";
                io.to(roomId).emit(ACTIONS.CODE_RUN, { result });
            } catch (error) {
                io.to(roomId).emit(ACTIONS.CODE_RUN, { result: "Error: Could not execute code." });
            }
        });

        socket.on("disconnecting", () => {
            const rooms = [...socket.rooms];
            rooms.forEach((roomId) => {
                socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                    socketId: socket.id,
                    username: userSocketMap[socket.id],
                });

                const room = io.sockets.adapter.rooms.get(roomId);
                if (room && room.size === 1) {
                    cleanupTimeouts[roomId] = setTimeout(() => {
                        RoomController.cleanupRoom(roomId);
                        delete cleanupTimeouts[roomId];
                    }, 30 * 60 * 1000);
                }
            });
            delete userSocketMap[socket.id];
        });
    });
};
