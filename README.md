# Real-time Code Editor

This is a real-time code editor that allows multiple users to collaborate on code simultaneously. It's built with the MERN stack (MongoDB, Express, React, Node.js) and uses Socket.io for real-time communication.

## Features

*   Real-time code editing
*   Syntax highlighting
*   Multiple language support (JavaScript, CSS, HTML)
*   File explorer
*   Create, rename, and delete files
*   Real-time cursor and selection tracking
*   User presence indicators

## Project Structure

```
.
├── build
├── node_modules
├── public
│   ├── index.html
│   └── ...
├── src
│   ├── components
│   │   ├── Client.js
│   │   ├── Editor.js
│   │   └── FileSidebar.js
│   ├── pages
│   │   ├── EditorPage.js
│   │   └── Home.js
│   ├── App.js
│   ├── index.js
│   └── ...
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## Getting Started

### Prerequisites

*   Node.js
*   npm

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/your-username/real-time-code-editor.git
    ```

2.  Install the dependencies:

    ```bash
    npm install
    ```

### Running the Application

1.  Start the server:

    ```bash
    npm run server:dev
    ```

2.  Start the client:

    ```bash
    npm run start:front
    ```

3.  Open your browser and navigate to `http://localhost:3000`.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License.