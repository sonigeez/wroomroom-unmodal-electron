const AutoLaunch = require("auto-launch"); // Import the auto-launch module
const { app, ipcMain, BrowserWindow, screen } = require("electron");
const wifi = require("node-wifi");
const os = require("os");
const path = require("path");
const fs = require('fs');
const startServer = require('./wroomroom-unmodal/app/src/Server.js');





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


ipcMain.on("wifi-credentials", async (event, { ssid, password }) => {
  console.log(ssid, password);
  await wifi.connect({ ssid, password });
  //check if connected
  const connection = await wifi.getCurrentConnections();
  //check ssid
  if (connection[0].ssid === ssid) {
    console.log("Connected to network.");
    // wait for 5 second
    await new Promise((resolve) => setTimeout(resolve, 5000));
    runServer();
    console.log("connection-success");
    event.reply("connection-success");
  } else {
    console.log("Not connected to network.");
    event.reply("connection-failed");
  }
});



ipcMain.on("wifi-modify", async (event, { ssid, password }) => {
  await wifi.connect({ ssid, password });
  //check if connected
  const connection = await wifi.getCurrentConnections();
  //check ssid
  if (connection[0].ssid === ssid) {
    console.log("Connected to network.");
    // wait for 5 second
    await new Promise((resolve) => setTimeout(resolve, 5000));
    runServer();
    console.log("connection-success");
    event.reply("connection-success");
  } else {
    console.log("Not connected to network.");
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
    fullscreen: true,
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

    // Determine the primary and secondary display based on size
    let primaryDisplay, secondaryDisplay;
    if (displays.length > 1) {
      // Sort displays by size (smallest to largest)
      displays.sort((a, b) => (a.size.width * a.size.height) - (b.size.width * b.size.height));
      // Smallest display is secondary
      secondaryDisplay = displays[0];
      // Largest display is primary
      primaryDisplay = displays[displays.length - 1];
    } else {
      // Only one display, use it as primary
      primaryDisplay = displays[0];
    }

    // Create windows for each display
    const createWindow = (display, url) => {
      const window = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        },
      });

      window.loadURL(url);
      window.setFullScreen(true);
      return window;
    };

    // Load different content based on display size
    if (secondaryDisplay) {
      // Load QR code in the smaller display
      createWindow(secondaryDisplay, `file://${path.join(__dirname, 'qrcode.html')}`);
      // Load room view in the larger display
      createWindow(primaryDisplay, `https://${localIP}:8010/view/room`);
    } else {
      // If only one display, load QR code and maximize
      createWindow(primaryDisplay, `file://${path.join(__dirname, 'qrcode.html')}`);
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


