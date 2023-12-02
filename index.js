const AutoLaunch = require("auto-launch"); // Import the auto-launch module
const { app, ipcMain, BrowserWindow, screen } = require("electron");
const wifi = require("node-wifi");
const os = require("os");
const path = require("path");
const fs = require('fs');
const unhandled = require('electron-unhandled');
const startServer = require('./wroomroom-unmodal/app/src/Server.js');

unhandled();




function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (let ifaceName in interfaces) {
    const iface = interfaces[ifaceName];
    for (let alias of iface) {
      if (alias.family === "IPv4" && !alias.internal) {
        console.log(alias.address);

        return alias.address;
      }
    }
  }
  return "localhost";
}

wifi.init({
  iface: null,
});

async function connectToWiFi(ssid, password) {
  return new Promise((resolve, reject) => {
    wifi.connect({ ssid, password }, (error) => {
      if (error) {
        console.error("Connection Error:", error);
        reject(error);
      } else {
        console.log("Connected to WiFi:", ssid);
        resolve();
      }
    });
  });
}


ipcMain.on("wifi-credentials", async (event, { ssid, password }) => {
  console.log(ssid, password);
  try {
    // await connectToWiFi(ssid, password);
    console.log("connection-success");
    //wait for 5 second
    // await new Promise((resolve) => setTimeout(resolve, 5000));
    runServer(); // Your function to create main app windows
    event.reply("connection-success");

    // ... Start your server and other components ...
  } catch (error) {
    // Handle connection error (e.g., show error message, prompt retry)
    console.error("WiFi connection failed:", error);
    event.reply("connection-failed");
  }
});



ipcMain.on("wifi-modify", async (event, { ssid, password }) => {
  console.log(ssid, password);
  try {
    await connectToWiFi(ssid, password);
    console.log("connection-success");
    event.reply("connection-success");


    // ... Start your server and other components ...
  } catch (error) {
    // Handle connection error (e.g., show error message, prompt retry)
    console.error("WiFi connection failed:", error);
    event.reply("connection-failed");
  }
});

//send local ip
ipcMain.on("get-local-ip", async (event) => {
  const localIP = getLocalIP();
  event.reply("local-ip", localIP);
});

function createWifiConfigWindow() {
  const wifiConfigWindow = new BrowserWindow({
    width: 500,
    height: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
  });

  // Load the WiFi configuration page
  wifiConfigWindow.loadFile("wifi-config.html");

  return wifiConfigWindow;
}

function runServer() {
  const localIP = getLocalIP();


  // Wait until the app is ready
  app.whenReady().then(() => {
    // Get all the displays
    const displays = screen.getAllDisplays();
    const externalDisplay = displays.find(
      (display) => display.bounds.x !== 0 || display.bounds.y !== 0
    );

    // First window
    const win1 = new BrowserWindow({
      width: 800,
      height: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
    });

    if (externalDisplay) {
      // Load URL in the first window
      win1.loadURL(`https://${localIP}:8010/view/room`);

      //load full screen
      win1.setFullScreen(true);

      // Second window, positioned based on external display
      const win2 = new BrowserWindow({
        x: externalDisplay.bounds.x + 50,
        y: externalDisplay.bounds.y + 50,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: true,
        },
      });

      // Load URL in the second window
      // win2.loadURL(`https://${localIP}:8010/qrcode/room`);
      win2.loadFile('qrcode.html')
      //load full screen
      win2.setFullScreen(true);
    } else {
      // No external display found, load second URL in the first window
      // win1.loadURL(`https://${localIP}:8010/qrcode/room`);
      win1.loadFile('qrcode.html')
      win1.maximize();
      //load full screen
      win1.setFullScreen(true);

      const win2 = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: true,
        },
      });
      win2.loadURL(`https://${localIP}:8010/view/room`);
      win2.maximize();
      //load full screen
      win2.setFullScreen(true);
    }
  });
}

function getResolvedPath(relativePath) {
  // Check if app is running in development or in packaged mode
  if (app.isPackaged) {
    // In packaged mode, __dirname points to resources/app.asar
    return path.join(process.resourcesPath, 'app.asar', relativePath);
  } else {
    // In development, use __dirname as usual
    return path.join(__dirname, relativePath);
  }
}




app.on("ready", () => {
  //auto launch
  const autoLaunch = new AutoLaunch({
    name: "Wroomroom",
    path: app.getPath("exe"),
  });

  autoLaunch.isEnabled().then((isEnabled) => {
    if (!isEnabled) autoLaunch.enable();
  }
  );
  createWifiConfigWindow();
});

app.on(
  "certificate-error",
  (event, webContents, url, error, certificate, callback) => {
    // Warning: This bypasses SSL certificate validation. Use only for local development.
    event.preventDefault();
    callback(true);
  }
);


