const mongoose = require("mongoose");

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

// Memory cache for active rooms
const roomState = {};
const saveTimeouts = {};

const RoomController = {
  async getRoom(roomId) {
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
  },

  updateRoomState(roomId, updates) {
    if (!roomState[roomId]) return;
    
    // Update local state
    Object.assign(roomState[roomId], updates);

    // Debounced save to MongoDB (Write-Behind)
    if (saveTimeouts[roomId]) clearTimeout(saveTimeouts[roomId]);
    
    saveTimeouts[roomId] = setTimeout(async () => {
      try {
        await Room.findOneAndUpdate(
          { roomId },
          { 
            files: roomState[roomId].files, 
            activeFile: roomState[roomId].activeFile,
            messages: roomState[roomId].messages 
          }
        );
        delete saveTimeouts[roomId];
      } catch (err) {
        console.error(`Failed to save room ${roomId} to DB:`, err);
      }
    }, 5000); // Save to DB every 5 seconds of inactivity
  },

  getRoomSync(roomId) {
    return roomState[roomId];
  },

  cleanupRoom(roomId) {
    // If we have a pending save, do it now
    if (saveTimeouts[roomId]) {
      clearTimeout(saveTimeouts[roomId]);
      this.saveImmediately(roomId);
    }
    delete roomState[roomId];
  },

  async saveImmediately(roomId) {
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
};

module.exports = RoomController;
