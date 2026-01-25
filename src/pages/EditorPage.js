import React, { useState, useRef, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import ACTIONS from "../Actions";
import Client from "../components/Client";
import Editor from "../components/Editor";
import FileSidebar from "../components/FileSidebar";
import Chat from "../components/Chat";
import { initSocket } from "../socket";
import {
  useLocation,
  useNavigate,
  Navigate,
  useParams,
} from "react-router-dom";

const EditorPage = () => {
  const socketRef = useRef(null);
  const location = useLocation();
  const { roomId } = useParams();
  const reactNavigator = useNavigate();

  const [clients, setClients] = useState([]);
  const [files, setFiles] = useState({});
  const [activeFile, setActiveFile] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [output, setOutput] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [messages, setMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      socketRef.current = await initSocket();

      const handleErrors = (e) => {
        console.log("socket error", e);
        toast.error("Socket connection failed, try again later.");
        reactNavigator("/");
      };

      socketRef.current.on("connect_error", (err) => handleErrors(err));
      socketRef.current.on("connect_failed", (err) => handleErrors(err));

      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username: location.state?.username,
      });

      socketRef.current.on(ACTIONS.JOINED, ({ clients, username }) => {
        if (username !== location.state?.username) {
          toast.success(`${username} joined the room.`);
        }
        setClients(clients);
      });

      socketRef.current.on(ACTIONS.FILES_SYNC, ({ files, activeFile: serverActiveFile, messages: history }) => {
        setFiles(files);
        if (history) setMessages(history);
        setActiveFile((prev) => {
          if (files[prev] !== undefined) return prev;
          return serverActiveFile || Object.keys(files)[0] || "";
        });
      });

      socketRef.current.on(ACTIONS.FILE_CHANGE, ({ fileName, newCode }) => {
        setFiles((prevFiles) => ({
          ...prevFiles,
          [fileName]: newCode,
        }));
      });

      socketRef.current.on(ACTIONS.CODE_RUN, ({ result }) => {
        setIsCompiling(false);
        setOutput(result || "No output");
      });

      socketRef.current.on(ACTIONS.RECEIVE_MESSAGE, (message) => {
        setMessages((prev) => [...prev, message]);
      });

      socketRef.current.on(ACTIONS.DISCONNECTED, ({ username, socketId }) => {
        toast.success(`${username} left the room.`);
        setClients((prev) => prev.filter((c) => c.socketId !== socketId));
      });
    };
    init();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current.off(ACTIONS.JOINED);
        socketRef.current.off(ACTIONS.DISCONNECTED);
        socketRef.current.off(ACTIONS.FILES_SYNC);
        socketRef.current.off(ACTIONS.FILE_CHANGE);
        socketRef.current.off(ACTIONS.CODE_RUN);
        socketRef.current.off(ACTIONS.RECEIVE_MESSAGE);
      }
    };
  }, [location.state?.username, reactNavigator, roomId]);

  const sendMessage = useCallback((text) => {
    socketRef.current.emit(ACTIONS.SEND_MESSAGE, {
      roomId,
      text,
      username: location.state?.username,
    });
  }, [roomId, location.state?.username]);


  const handleNewFile = (fileName) => {
    if (files[fileName] !== undefined) {
      toast.error(`File "${fileName}" already exists.`);
      return;
    }
    socketRef.current.emit(ACTIONS.FILE_CREATE, { roomId, fileName });
  };

  const handleDeleteFile = (fileName) => {
    socketRef.current.emit(ACTIONS.FILE_DELETE, { roomId, fileName });
  };

  // ==================== NEW EVENT HANDLER FOR RENAMING ====================
  const handleFileRename = (oldFileName, newFileName) => {
    // Prevent renaming to a file that already exists
    if (files[newFileName] !== undefined) {
      toast.error(`A file named "${newFileName}" already exists.`);
      return;
    }
    socketRef.current.emit(ACTIONS.FILE_RENAME, {
      roomId,
      oldFileName,
      newFileName,
    });
  };
  // =======================================================================

  const handleCodeChange = useCallback((newCode) => {
    if (activeFile) {
      // Update local state immediately for responsiveness
      setFiles((prev) => ({ ...prev, [activeFile]: newCode }));
      setIsSaving(true);

      // Debounce the socket emission
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        socketRef.current.emit(ACTIONS.FILE_CHANGE, {
          roomId,
          fileName: activeFile,
          newCode,
        });
        setIsSaving(false);
      }, 600); // 600ms debounce
    }
  }, [activeFile, roomId]);

  const runCode = useCallback(() => {
    if (!activeFile || files[activeFile] === undefined) {
      toast.error("Please select a file to run");
      return;
    }
    setIsCompiling(true);
    setOutput("Compiling and running " + activeFile + "...");
    socketRef.current.emit(ACTIONS.CODE_RUN, {
      roomId,
      fileName: activeFile,
      code: files[activeFile] || "",
    });
  }, [activeFile, files, roomId]);

  async function copyRoomId() {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success("Room ID has been copied to your clipboard");
    } catch (err) {
      toast.error("Could not copy the Room ID");
    }
  }

  function leaveRoom() {
    reactNavigator("/");
  }

  if (!location.state) {
    return <Navigate to="/" />;
  }

  return (
    <div className="mainWrap">
      <div className="aside">
        <div className="asideInner">
          <div className="logo">
            <img className="logoImage" src="/code-sync.png" alt="logo" />
          </div>
          <div className="statusContainer">
            <h3>Connected</h3>
            {isSaving && <span className="savingIndicator">Saving...</span>}
          </div>
          <div className="clientsList">
            {clients.map((client) => (
              <Client key={client.socketId} username={client.username} />
            ))}
          </div>
          <FileSidebar
            files={Object.keys(files)}
            onFileSelect={(name) => setActiveFile(name)}
            onNewFile={handleNewFile}
            onFileDelete={handleDeleteFile}
            onFileRename={handleFileRename}
            activeFile={activeFile}
          />
        </div>
        <button className="btn chatToggleBtn" onClick={() => setShowChat(!showChat)}>
          {showChat ? "Hide Chat" : "Show Chat"}
        </button>
        <button className="btn copyBtn" onClick={copyRoomId}>
          Copy ROOM ID
        </button>
        <button className="btn leaveBtn" onClick={leaveRoom}>
          Leave
        </button>
      </div>
      <div className="editorWrap">
        <Editor
          roomId={roomId}
          activeFile={activeFile}
          onCodeChange={handleCodeChange}
          onRunCode={runCode}
          onClearOutput={() => setOutput("")}
          output={output}
          isCompiling={isCompiling}
          username={location.state?.username}
        />
      </div>
      {showChat && (
        <Chat 
          messages={messages} 
          onSendMessage={sendMessage} 
          username={location.state?.username} 
        />
      )}
    </div>
  );
};

export default EditorPage;
