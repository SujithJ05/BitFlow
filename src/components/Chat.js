import React, { useState, useEffect, useRef } from "react";

const Chat = ({ messages, onSendMessage, username }) => {
  const [text, setText] = useState("");
  const chatEndRef = useRef(null);

  const handleSend = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onSendMessage(text);
      setText("");
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chatPanel">
      <div className="chatHeader">Team Chat</div>
      <div className="messageList">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.username === username ? "own" : ""}`}>
            <span className="msgUser">{msg.username}</span>
            <div className="msgText">{msg.text}</div>
            <span className="msgTime">{new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <form className="chatInput" onSubmit={handleSend}>
        <input 
          type="text" 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default Chat;
