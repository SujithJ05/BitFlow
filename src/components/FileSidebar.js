import React, { useState, useEffect, useRef } from "react";

const FileSidebar = ({
  files,
  onFileSelect,
  onNewFile,
  onFileDelete,
  onFileRename,
  activeFile,
}) => {
  const [menuData, setMenuData] = useState({
    visible: false,
    x: 0,
    y: 0,
    file: null,
  });
  const [expandedFolders, setExpandedFolders] = useState({ "/": true });
  const sidebarRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = () => {
      if (menuData.visible) {
        setMenuData({ visible: false, x: 0, y: 0, file: null });
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [menuData.visible]);

  // Convert flat file list to a tree structure
  const buildFileTree = (fileList) => {
    const root = { name: "root", type: "folder", children: {}, path: "" };
    fileList.forEach((filePath) => {
      const parts = filePath.split("/");
      let current = root;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          current.children[part] = { name: part, type: "file", path: filePath };
        } else {
          if (!current.children[part]) {
            current.children[part] = {
              name: part,
              type: "folder",
              children: {},
              path: parts.slice(0, index + 1).join("/"),
            };
          }
          current = current.children[part];
        }
      });
    });
    return root;
  };

  const toggleFolder = (path, e) => {
    e.stopPropagation();
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleNewItem = (isFolder) => {
    const name = prompt(`Enter new ${isFolder ? "folder" : "file"} name (use / for paths):`);
    if (name && name.trim() !== "") {
      const path = name.trim();
      // If it's a folder, we create a placeholder file to keep it in the list
      // Or just let the user type 'folder/file.js'
      onNewFile(isFolder ? `${path}/.keep` : path);
    }
  };

  const renderTree = (node) => {
    const sortedChildren = Object.values(node.children).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "folder" ? -1 : 1;
    });

    return (
      <ul className="fileTreeList">
        {sortedChildren.map((item) => {
          if (item.name === ".keep") return null;
          const isExpanded = expandedFolders[item.path];
          
          return (
            <li key={item.path} className="treeItem">
              <div 
                className={`treeLabel ${item.type} ${item.path === activeFile ? "active" : ""}`}
                onClick={() => item.type === "file" ? onFileSelect(item.path) : toggleFolder(item.path, { stopPropagation: () => {} })}
              >
                <span className="treeIcon" onClick={(e) => item.type === "folder" && toggleFolder(item.path, e)}>
                  {item.type === "folder" ? (isExpanded ? "📂" : "📁") : "📄"}
                </span>
                <span className="itemName">{item.name}</span>
                <button
                  className="btn menuButton"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMenuData({ visible: true, x: rect.left - 80, y: rect.top + 20, file: item.path });
                  }}
                >
                  ⋮
                </button>
              </div>
              {item.type === "folder" && isExpanded && renderTree(item)}
            </li>
          );
        })}
      </ul>
    );
  };

  const tree = buildFileTree(files);

  return (
    <div className="fileManager" ref={sidebarRef}>
      <div className="fileManagerHeader">
        <h3 className="fileManagerTitle">Explorer</h3>
        <div className="fileActions">
          <button onClick={() => handleNewItem(false)} title="New File">📄+</button>
          <button onClick={() => handleNewItem(true)} title="New Folder">📁+</button>
        </div>
      </div>
      <div className="treeContainer">
        {renderTree(tree)}
      </div>

      {menuData.visible && (
        <div
          className="fileMenu"
          style={{ top: `${menuData.y}px`, left: `${menuData.x}px` }}
        >
          <button onClick={() => onFileRename(menuData.file, prompt("New name:", menuData.file))}>Rename</button>
          <button className="deleteOption" onClick={() => onFileDelete(menuData.file)}>Delete</button>
        </div>
      )}
    </div>
  );
};

export default FileSidebar;