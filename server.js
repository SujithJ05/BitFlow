// server.js

const express = require("express");
const app = express();
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const axios = require("axios");
const mongoose = require("mongoose");
const ACTIONS = require("./src/Actions");

// Connect to MongoDB (You can replace this with your own URI)
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/code_sync";
mongoose.connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// Define Schema for Room Persistence
const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  files: { type: Object, default: {} },
  activeFile: { type: String },
  messages: [{
    username: String,
    text: String,
    time: { type: Date, default: Date.now }
  }]
});
const Room = mongoose.model("Room", roomSchema);

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("build"));
app.get(/^(?!\/api).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

const userSocketMap = {};
// We'll still keep an in-memory cache for speed, but sync to DB
const roomState = {};
const cleanupTimeouts = {};

function getAllConnectedClients(roomId) {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => {
      return {
        socketId,
        username: userSocketMap[socketId],
      };
    }
  );
}

async function loadRoomFromDB(roomId) {
  if (roomState[roomId]) return roomState[roomId];
  let room = await Room.findOne({ roomId });
  if (!room) {
    room = new Room({
      roomId,
      files: {
        "src/index.js": `// Welcome to your new project!\nconsole.log('Hello from src!');`,
        "README.md": `# Project Documentation\nStart editing to see changes in real-time.`,
      },
      activeFile: "src/index.js"
    });
    await room.save();
  }
  roomState[roomId] = room.toObject();
  return roomState[roomId];
}

async function saveRoomToDB(roomId) {
  if (roomState[roomId]) {
    await Room.findOneAndUpdate(
      { roomId },
      { 
        files: roomState[roomId].files, 
        activeFile: roomState[roomId].activeFile,
        messages: roomState[roomId].messages 
      }
    );
  }
}

io.on("connection", (socket) => {
  socket.on(ACTIONS.JOIN, async ({ roomId, username }) => {
    if (!roomId || !username) return;
    
    userSocketMap[socket.id] = username;
    socket.join(roomId);

    const state = await loadRoomFromDB(roomId);

    const clients = getAllConnectedClients(roomId);
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
    if (!roomId || !fileName) return;
    if (roomState[roomId]) {
      roomState[roomId].files[fileName] = newCode;
      socket.in(roomId).emit(ACTIONS.FILE_CHANGE, { fileName, newCode });
      saveRoomToDB(roomId); // Async save
    }
  });

  socket.on(ACTIONS.CURSOR_MOVE, ({ roomId, cursor, username }) => {
    socket.in(roomId).emit(ACTIONS.CURSOR_MOVE, { cursor, username, socketId: socket.id });
  });

  socket.on(ACTIONS.SEND_MESSAGE, ({ roomId, text, username }) => {
    const message = { username, text, time: new Date() };
    if (roomState[roomId]) {
      if (!roomState[roomId].messages) roomState[roomId].messages = [];
      roomState[roomId].messages.push(message);
      io.to(roomId).emit(ACTIONS.RECEIVE_MESSAGE, message);
      saveRoomToDB(roomId);
    }
  });

  socket.on(ACTIONS.FILE_CREATE, ({ roomId, fileName }) => {
    if (!roomId || !fileName) return;
    
    // Sanitize fileName: Remove path traversal and invalid characters
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 50);
    if (!sanitizedName) return;

    if (roomState[roomId] && !roomState[roomId].files[sanitizedName]) {
      roomState[roomId].files[sanitizedName] = ""; // Create an empty file
      // Broadcast the updated file list to everyone
      io.to(roomId).emit(ACTIONS.FILES_SYNC, roomState[roomId]);
    }
  });

  socket.on(ACTIONS.FILE_DELETE, ({ roomId, fileName }) => {
    if (!roomId || !fileName) return;

    if (roomState[roomId] && roomState[roomId].files[fileName]) {
      delete roomState[roomId].files[fileName];
      // If the deleted file was the active one, pick a new active file
      if (roomState[roomId].activeFile === fileName) {
        const remainingFiles = Object.keys(roomState[roomId].files);
        roomState[roomId].activeFile =
          remainingFiles.length > 0 ? remainingFiles[0] : null;
      }
      // Broadcast the updated file list to everyone
      io.to(roomId).emit(ACTIONS.FILES_SYNC, roomState[roomId]);
    }
  });

  // ==================== NEW EVENT HANDLER FOR RENAMING ====================
  socket.on(ACTIONS.FILE_RENAME, ({ roomId, oldFileName, newFileName }) => {
    if (!roomId || !oldFileName || !newFileName) return;

    // Sanitize newFileName
    const sanitizedNewName = newFileName.replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 50);
    if (!sanitizedNewName) return;

    const room = roomState[roomId];
    if (
      room &&
      room.files[oldFileName] !== undefined && // Check that the old file exists
      room.files[sanitizedNewName] === undefined // And that the new name isn't already taken
    ) {
      // Copy content to the new file name
      room.files[sanitizedNewName] = room.files[oldFileName];
      // Delete the old file
      delete room.files[oldFileName];

      // If the renamed file was the active one, update the activeFile pointer
      if (room.activeFile === oldFileName) {
        room.activeFile = sanitizedNewName;
      }

      // Broadcast the full updated state to all clients to ensure they are in sync
      io.to(roomId).emit(ACTIONS.FILES_SYNC, room);
    }
  });
  // ========================================================================

  socket.on(ACTIONS.CODE_RUN, async ({ roomId, fileName, code }) => {
    if (fileName.endsWith(".keep")) return;
    console.log(`Running code for room ${roomId}, file: ${fileName}`);
    const extension = fileName.split(".").pop().toLowerCase();
    const languageMap = {
      js: "javascript",
      py: "python",
      cpp: "cpp",
      c: "c",
      java: "java",
      cs: "csharp",
      go: "go",
      rs: "rust",
    };

    const language = languageMap[extension] || "javascript";
    console.log(`Detected language: ${language}`);

    try {
      const response = await axios.post("https://emkc.org/api/v2/piston/execute", {
        language: language,
        version: "*",
        files: [
          {
            content: code,
          },
        ],
      });

      console.log("Piston API response received");
      const result = response.data.run.output || response.data.run.stdout || response.data.run.stderr || "No output from execution.";
      console.log(`Result length: ${result.length}`);
      io.to(roomId).emit(ACTIONS.CODE_RUN, { result });
    } catch (error) {
      console.error("Execution error:", error.response?.data || error.message);
      io.to(roomId).emit(ACTIONS.CODE_RUN, { 
        result: "Error: Could not execute code. " + (error.response?.data?.message || error.message) 
      });
    }
  });

  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });

    // Clean up room state after a delay if no one is left
    const allRooms = io.sockets.adapter.rooms;
    rooms.forEach((roomId) => {
      const room = allRooms.get(roomId);
      // Check if room will be empty after this user disconnects
      if (room && room.size === 1) {
        // Wait 30 minutes before cleaning up the room state
        cleanupTimeouts[roomId] = setTimeout(() => {
          delete roomState[roomId];
          delete cleanupTimeouts[roomId];
          console.log(`Room ${roomId} state cleaned up after 30 mins of inactivity.`);
        }, 30 * 60 * 1000); 
        console.log(`Room ${roomId} scheduled for cleanup in 30 mins.`);
      }
    });

    delete userSocketMap[socket.id];
    socket.leave();
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
