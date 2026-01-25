import React, { useEffect, useRef, useState } from "react";
import Codemirror from "codemirror";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { CodemirrorBinding } from "y-codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/dracula.css";
import "codemirror/theme/material.css";
import "codemirror/theme/monokai.css";
import "codemirror/mode/javascript/javascript";
import "codemirror/mode/xml/xml";
import "codemirror/mode/css/css";
import "codemirror/mode/python/python";
import "codemirror/mode/clike/clike";
import "codemirror/addon/edit/closetag";
import "codemirror/addon/edit/closebrackets";

const Editor = ({ 
  roomId,
  activeFile, 
  onCodeChange, 
  onRunCode, 
  output, 
  isCompiling,
  onClearOutput,
  username
}) => {
  const editorRef = useRef(null);
  const textAreaRef = useRef(null);
  const bindingRef = useRef(null);
  const docRef = useRef(null);
  const providerRef = useRef(null);
  const [theme, setTheme] = useState("dracula");

  useEffect(() => {
    if (textAreaRef.current && !editorRef.current) {
      const editor = Codemirror.fromTextArea(textAreaRef.current, {
        theme: theme,
        autoCloseTags: true,
        autoCloseBrackets: true,
        lineNumbers: true,
        extraKeys: {
          "Ctrl-Enter": () => {
            const runBtn = document.querySelector('.runBtn');
            if (runBtn) runBtn.click();
          }
        }
      });
      editorRef.current = editor;
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.toTextArea();
        editorRef.current = null;
      }
      if (bindingRef.current) {
        bindingRef.current.destroy();
      }
      if (providerRef.current) {
        providerRef.current.destroy();
      }
      if (docRef.current) {
        docRef.current.destroy();
      }
    };
  }, [theme]);

  // Handle Collaborative Sync
  useEffect(() => {
    if (!editorRef.current || !activeFile || !roomId) return;

    // Cleanup previous binding
    if (bindingRef.current) {
        bindingRef.current.destroy();
    }
    if (providerRef.current) {
        providerRef.current.destroy();
    }
    if (docRef.current) {
        docRef.current.destroy();
    }

    const ydoc = new Y.Doc();
    docRef.current = ydoc;

    // Connect to a public y-websocket server (or your own if hosted)
    // For local dev, you can use ws://localhost:1234
    // We'll use a unique room name per file in the project
    const provider = new WebsocketProvider(
        'wss://demos.yjs.dev', // Replace with your production websocket server
        `${roomId}-${activeFile}`, 
        ydoc
    );
    providerRef.current = provider;

    const awareness = provider.awareness;
    awareness.setLocalStateField('user', {
        name: username,
        color: stringToColor(username)
    });

    const ytext = ydoc.getText('codemirror');
    const binding = new CodemirrorBinding(ytext, editorRef.current, awareness);
    bindingRef.current = binding;

    // Observe changes to notify parent component if needed (e.g. for saving)
    ytext.observe(() => {
        onCodeChange(ytext.toString());
    });

  }, [activeFile, roomId, username, onCodeChange]);

  // Handle mode updates
  useEffect(() => {
    if (editorRef.current) {
      const extension = activeFile ? activeFile.split(".").pop().toLowerCase() : "js";
      let mode = "javascript";
      if (extension === "css") mode = "css";
      if (extension === "html" || extension === "xml") mode = "xml";
      if (extension === "py") mode = "python";
      if (["cpp", "c", "h", "hpp"].includes(extension)) mode = "text/x-c++src";
      if (extension === "java") mode = "text/x-java";
      if (extension === "cs") mode = "text/x-csharp";

      if (editorRef.current.getOption("mode") !== mode) {
        editorRef.current.setOption("mode", mode);
      }
    }
  }, [activeFile]);

  function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${hash % 360}, 70%, 50%)`;
  };

  return (
    <div className="editorContainer">
      <div className="editorHeader">
        <div className="activeFileTab">
          <span className="tabIcon">{activeFile ? activeFile.split('.').pop() : ''}</span>
          {activeFile || "No file selected"}
        </div>
        <div className="editorActions">
          <select 
            className="themeSelector" 
            value={theme} 
            onChange={(e) => {
              setTheme(e.target.value);
            }}
          >
            <option value="dracula">Dracula</option>
            <option value="material">Material</option>
            <option value="monokai">Monokai</option>
          </select>
          <button 
            className={`headerBtn runBtn ${isCompiling ? 'disabled' : ''}`} 
            onClick={() => onRunCode()}
            disabled={isCompiling}
          >
            {isCompiling ? "Running..." : "Run"}
          </button>
          <button className="headerBtn" onClick={() => {
            navigator.clipboard.writeText(editorRef.current.getValue());
          }} title="Copy Code">
            Copy
          </button>
        </div>
      </div>
      <div className="editorWorkspace">
        <textarea ref={textAreaRef} />
        <div className="outputPanel">
          <div className="outputHeader">
            <span>Terminal</span>
            <button className="clearBtn" onClick={onClearOutput}>Clear</button>
          </div>
          <pre className="outputContent">
            {output || "Run code to see output..."}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default Editor;