"use strict";

const path = require("path");
const { app, BrowserWindow } = require("electron");

// Desktop builds should play music/SFX immediately and let Chromium's audio
// service reach PipeWire / PulseAudio / ALSA cleanly across Linux sandboxes.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", "AudioServiceSandbox");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    title: "Beast and Crimson",
    icon: path.join(__dirname, "..", "assets", "art", "crest.png"),
    backgroundColor: "#0c0907",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
