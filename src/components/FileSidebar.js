import React, { useState } from "react";
import { 
  VscNewFile, 
  VscNewFolder, 
  VscChevronRight, 
  VscChevronDown, 
  VscEdit, 
  VscTrash
} from "react-icons/vsc";
import { 
  SiJavascript, 
  SiCss3, 
  SiHtml5, 
  SiJson, 
  SiMarkdown 
} from "react-icons/si";
import { FaFile } from "react-icons/fa";

const getFileIcon = (fileName) => {
  const extension = fileName.split('.').pop().toLowerCase();
  switch (extension) {
    case 'js':
    case 'jsx':
      return <SiJavascript color="#f7df1e" />;
    case 'css':
      return <SiCss3 color="#264de4" />;
    case 'html':
      return <SiHtml5 color="#e34c26" />;
    case 'json':
      return <SiJson color="#cbcbcb" />;
    case 'md':
      return <SiMarkdown color="#ffffff" />;
    default:
      return <FaFile color="#888" />;
  }
};

const FileSidebar = ({
  files,
  onFileSelect,
  onNewFile,
  onFileDelete,
  onFileRename,
  activeFile,
}) => {
  const [expandedFolders, setExpandedFolders] = useState({ "/": true });
  const [hoveredItem, setHoveredItem] = useState(null);
  
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
      onNewFile(isFolder ? `${path}/.keep` : path);
    }
  };

  const handleRename = (path, currentName, e) => {
    e.stopPropagation();
    const newName = prompt("Rename to:", currentName);
    if (newName && newName !== currentName) {
      const parts = path.split('/');
      parts.pop();
      const parentPath = parts.join('/');
      // If it's a file at root, parentPath is empty.
      // We need to reconstruct the full path for the new file.
      // Note: The current prop onFileRename expects (oldPath, newPath).
      // However, usually we just want to rename the filename part.
      // The socket event handler seems to expect full paths.
      // Let's assume the user enters just the new name, not the full path.
      
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;
      onFileRename(path, newPath);
    }
  };

  const handleDelete = (path, e) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete ${path}?`)) {
      onFileDelete(path);
    }
  };

  const renderTree = (node, depth = 0) => {
    const sortedChildren = Object.values(node.children).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "folder" ? -1 : 1;
    });

    return (
      <ul className="fileTreeList">
        {sortedChildren.map((item) => {
          if (item.name === ".keep") return null;
          const isExpanded = expandedFolders[item.path];
          const isSelected = item.path === activeFile;
          
          return (
            <li key={item.path} className="treeItem">
              <div 
                className={`treeLabel ${isSelected ? "active" : ""}`}
                style={{ paddingLeft: `${depth * 10 + 10}px` }}
                onClick={() => item.type === "file" ? onFileSelect(item.path) : toggleFolder(item.path, { stopPropagation: () => {} })}
                onMouseEnter={() => setHoveredItem(item.path)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <span className="treeIcon" onClick={(e) => item.type === "folder" && toggleFolder(item.path, e)}>
                  {item.type === "folder" ? (
                    isExpanded ? <VscChevronDown /> : <VscChevronRight />
                  ) : (
                    getFileIcon(item.name)
                  )}
                </span>
                
                <span className="itemName">{item.name}</span>
                
                {hoveredItem === item.path && (
                  <div className="itemActions">
                    <button 
                      className="actionBtn" 
                      title="Rename"
                      onClick={(e) => handleRename(item.path, item.name, e)}
                    >
                      <VscEdit />
                    </button>
                    <button 
                      className="actionBtn delete" 
                      title="Delete"
                      onClick={(e) => handleDelete(item.path, e)}
                    >
                      <VscTrash />
                    </button>
                  </div>
                )}
              </div>
              {item.type === "folder" && isExpanded && renderTree(item, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  const tree = buildFileTree(files);

  return (
    <div className="fileManager">
      <div className="fileManagerHeader">
        <h3 className="fileManagerTitle">EXPLORER</h3>
        <div className="fileActions">
          <button onClick={() => handleNewItem(false)} title="New File"><VscNewFile /></button>
          <button onClick={() => handleNewItem(true)} title="New Folder"><VscNewFolder /></button>
        </div>
      </div>
      <div className="treeContainer">
        {renderTree(tree)}
      </div>
    </div>
  );
};

export default FileSidebar;