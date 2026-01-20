import React, { useEffect, useRef, useState } from "react";
import Codemirror from "codemirror";
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
  activeFile, 
  code, 
  onCodeChange, 
  onRunCode, 
  output, 
  isCompiling,
  onCursorMove,
  otherCursors,
  onClearOutput
}) => {
  const editorRef = useRef(null);
  const textAreaRef = useRef(null);
  const markersRef = useRef({});
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

      editor.on("change", (instance, changes) => {
        if (changes.origin !== "setValue") {
          onCodeChange(instance.getValue());
        }
      });

      editor.on("cursorActivity", (instance) => {
        const cursor = instance.getCursor();
        onCursorMove(cursor);
      });
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.toTextArea();
        editorRef.current = null;
      }
    };
  }, [onCodeChange, onCursorMove, theme]);

  // Handle content and mode updates
  useEffect(() => {
    if (editorRef.current) {
      const currentCode = editorRef.current.getValue();
      if (code !== undefined && code !== currentCode) {
        editorRef.current.setValue(code || "");
      }

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
  }, [code, activeFile]);

  // Update Remote Cursors
  useEffect(() => {
    if (editorRef.current) {
      // Clear old markers
      Object.values(markersRef.current).forEach(marker => marker.clear());
      markersRef.current = {};

      // Set new markers for each user
      Object.entries(otherCursors).forEach(([socketId, data]) => {
        const { cursor, username } = data;
        const cursorElement = document.createElement("div");
        cursorElement.className = "remote-cursor";
        cursorElement.style.borderLeft = `2px solid ${stringToColor(username)}`;
        
        const label = document.createElement("div");
        label.className = "cursor-label";
        label.innerText = username;
        label.style.backgroundColor = stringToColor(username);
        cursorElement.appendChild(label);

        markersRef.current[socketId] = editorRef.current.setBookmark(cursor, {
          widget: cursorElement
        });
      });
    }
  }, [otherCursors]);

  const stringToColor = (str) => {
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
              editorRef.current.setOption("theme", e.target.value);
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
          <button className="headerBtn" onClick={() => {
            const element = document.createElement("a");
            const file = new Blob([editorRef.current.getValue()], {type: 'text/plain'});
            element.href = URL.createObjectURL(file);
            element.download = activeFile || "code.txt";
            document.body.appendChild(element);
            element.click();
          }} title="Download File">
            Download
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
