"use strict";

const express = require("express");
const cors = require("cors");
const compression = require("compression");
const https = require("httpolyglot");
const mediasoup = require("mediasoup");
const mediasoupClient = require("mediasoup-client");
const http = require("http");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const config = require("./config");
const checkXSS = require("./XSS.js");
const Host = require("./Host");
const Room = require("./Room");
const Peer = require("./Peer");
const Logger = require("./Logger");
const log = new Logger("Server");

const bodyParser = require("body-parser");

const app = express();

const options = {
  cert: fs.readFileSync(path.join(__dirname, config.server.ssl.cert), "utf-8"),
  key: fs.readFileSync(path.join(__dirname, config.server.ssl.key), "utf-8"),
};

const httpsServer = https.createServer(options, app);
const io = require("socket.io")(httpsServer, {
  maxHttpBufferSize: 1e7,
  transports: ["websocket"],
});
const host = "https://" + "localhost" + ":" + config.server.listen.port; // config.server.listen.ip

const hostCfg = {
  protected: config.host.protected,
  username: config.host.username,
  password: config.host.password,
  authenticated: !config.host.protected,
};

const apiBasePath = "/api/v1"; // api endpoint path
const api_docs = host + apiBasePath + "/docs"; // api docs


// Stats
const defaultStats = {
  enabled: true,
  src: "",
  id: "",
};

// OpenAI/ChatGPT

// directory
const dir = {
  public: path.join(__dirname, '../../', 'public'),
};

// html views
const views = {

  about: path.join(dir.public, 'views', 'about.html'),
  landing: path.join(dir.public, 'views', 'landing.html'),
  login: path.join(dir.public, 'views', 'login.html'),
  newRoom: path.join(dir.public, 'views', 'newroom.html'),
  notFound: path.join(dir.public, 'views', '404.html'),
  permission: path.join(dir.public, 'views', 'permission.html'),
  privacy: path.join(dir.public, 'views', 'privacy.html'),
  room: path.join(dir.public, 'views', 'Room.html'),
  viewer: path.join(dir.public, 'views', 'viewer.html'),
  qrcode: path.join(dir.public, 'views', 'qrcode.html'),
  horizontal: path.join(dir.public, 'views', 'horizontalView.html'),
  stream: path.join(dir.public, 'views', 'stream.html'),

};

let announcedIP = config.mediasoup.webRtcTransport.listenIps[0].announcedIp; // AnnouncedIP (server public IPv4)

let authHost; // Authenticated IP by Login

let roomList = new Map();

let presenters = {}; // collect presenters grp by roomId

// All mediasoup workers
let workers = [];
let nextMediasoupWorkerIdx = 0;

// Autodetect announcedIP (https://www.ipify.org)
if (!announcedIP) {
  http.get(
    {
      host: "api.ipify.org",
      port: 80,
      path: "/",
    },
    (resp) => {
      resp.on("data", (ip) => {
        announcedIP = ip.toString();
        config.mediasoup.webRtcTransport.listenIps[0].announcedIp = announcedIP;
        startServer();
      });
    }
  );
} else {
  startServer();
}

async function startServer() {
  // Start the app
  app.use(cors());
  app.use(compression());
  app.use(express.json());
  app.use(express.static(dir.public));
  app.use(bodyParser.urlencoded({ extended: true }));

  // all start from here
  app.get("*", function (next) {
    next();
  });

  // Remove trailing slashes in url handle bad requests
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError || err.status === 400 || "body" in err) {
      log.error("Request Error", {
        header: req.headers,
        body: req.body,
        error: err.message,
      });
      return res.status(400).send({ status: 404, message: err.message }); // Bad request
    }
    if (req.path.substr(-1) === "/" && req.path.length > 1) {
      let query = req.url.slice(req.path.length);
      res.redirect(301, req.path.slice(0, -1) + query);
    } else {
      next();
    }
  });

  // main page
  app.get(["/"], (req, res) => {
    if (hostCfg.protected == true) {
      hostCfg.authenticated = false;
      res.sendFile(views.login);
    } else {
      res.sendFile(views.landing);
    }
  });

  app.get("/api/rooms/:roomId/users", (req, res) => {
    const roomId = req.params.roomId;
    const room = roomList.get(roomId);
    const peersMap = room.getPeers();
    const peersArray = Array.from(peersMap.values());

    if (peersArray) {
      const users = peersArray.map(peer => (peer.peer_info.peer_name));
      res.json(users);
  } else {
      res.status(404).send('Room not found');
  }
});

  // handle logged on host protected
  app.get(["/logged"], (req, res) => {
    const ip = getIP(req);
    if (allowedIP(ip)) {
      res.sendFile(views.landing);
    } else {
      hostCfg.authenticated = false;
      res.sendFile(views.login);
    }
  });

  // handle login on host protected
  app.post(["/login"], (req, res) => {
    if (hostCfg.protected == true) {
      let ip = getIP(req);
      log.debug(`Request login to host from: ${ip}`, req.body);
      const { username, password } = checkXSS(req.body);
      if (username == hostCfg.username && password == hostCfg.password) {
        hostCfg.authenticated = true;
        authHost = new Host(ip, true);
        log.debug("LOGIN OK", {
          ip: ip,
          authorized: authHost.isAuthorized(ip),
        });
        res.status(200).json({ message: "authorized" });
      } else {
        log.debug("LOGIN KO", { ip: ip, authorized: false });
        hostCfg.authenticated = false;
        res.status(401).json({ message: "unauthorized" });
      }
    } else {
      res.redirect("/");
    }
  });

  // no room name specified to join || direct join
  app.get("/join/", (req, res) => {
    if (hostCfg.authenticated && Object.keys(req.query).length > 0) {
      log.debug("Direct Join", req.query);
      // http://localhost:3010/join?room=test&password=0&name=wroomroom&audio=1&video=1&screen=1&notify=1
      const { room, name, audio, video } = checkXSS(req.query);
      if (room && name && audio && video) {
        return res.sendFile(views.room);
      }
    }
    res.redirect("/");
  });

  app.get("/view", (req, res) => {
    res.sendFile(views.viewer);
  });
  app.get("/qrcode/:roomId", (req, res) => {
    res.sendFile(views.qrcode);
  });
  app.get("/horizontal", (req, res) => {
    //redirect it
    res.sendFile(views.horizontal);
  });
  app.get("/stream", (req, res) => {
    res.sendFile(views.stream);
  });

  app.get("/view/:roomId", (req, res) => {
    //redirect it
    res.sendFile(views.viewer);
  });

  // join room by id
  app.get("/join/:roomId", (req, res) => {
    if (hostCfg.authenticated) {
      res.sendFile(views.room);
    } else {
      res.redirect("/");
    }
  });

  // not specified correctly the room id
  app.get("/join/*", (req, res) => {
    res.redirect("/");
  });

  // if not allow video/audio
  app.get(["/permission"], (req, res) => {
    res.sendFile(views.permission);
  });

  // privacy policy
  app.get(["/privacy"], (req, res) => {
    res.sendFile(views.privacy);
  });

  // wroomroom about
  app.get(["/about"], (req, res) => {
    res.sendFile(views.about);
  });

  // Get stats endpoint
  app.get(["/stats"], (req, res) => {
    const stats = config.stats ? config.stats : defaultStats;
    // log.debug('Send stats', stats);
    res.send(stats);
  });

  // ####################################################
  // START SERVER
  // ####################################################

  httpsServer.listen(config.server.listen.port, () => {
    log.log(
      `%c

    
        `,
      "font-family:monospace"
    );

    if (config.ngrok.authToken !== "") {
      return ngrokStart();
    }
    log.info("Settings", {
      node_version: process.versions.node,
      hostConfig: hostCfg,
      announced_ip: announcedIP,
      server: host,
      api_docs: api_docs,
      mediasoup_worker_bin: mediasoup.workerBin,
      mediasoup_server_version: mediasoup.version,
      mediasoup_client_version: mediasoupClient.version,
      ip_lookup_enabled: config.IPLookup.enabled,
    });
  });

  // ####################################################
  // WORKERS
  // ####################################################

  (async () => {
    try {
      await createWorkers();
    } catch (err) {
      log.error("Create Worker ERR --->", err);
      process.exit(1);
    }
  })();

  async function createWorkers() {
    const { numWorkers } = config.mediasoup;

    const { logLevel, logTags, rtcMinPort, rtcMaxPort } =
      config.mediasoup.worker;

    log.debug("WORKERS:", numWorkers);

    for (let i = 0; i < numWorkers; i++) {
      let worker = await mediasoup.createWorker({
        logLevel: logLevel,
        logTags: logTags,
        rtcMinPort: rtcMinPort,
        rtcMaxPort: rtcMaxPort,
      });
      worker.on("died", () => {
        log.error(
          "Mediasoup worker died, exiting in 2 seconds... [pid:%d]",
          worker.pid
        );
        setTimeout(() => process.exit(1), 2000);
      });
      workers.push(worker);
    }
  }

  async function getMediasoupWorker() {
    const worker = workers[nextMediasoupWorkerIdx];
    if (++nextMediasoupWorkerIdx === workers.length) nextMediasoupWorkerIdx = 0;
    return worker;
  }

  // ####################################################
  // SOCKET IO
  // ####################################################

  io.on("connection", (socket) => {
    socket.on("clientError", (error) => {
      log.error("Client error", error);
      socket.destroy();
    });


    socket.on("createRoom", async ({ room_id }, callback) => {
      socket.room_id = room_id;

      if (roomList.has(socket.room_id)) {
        callback({ error: "already exists" });
      } else {
        log.debug("Created room", { room_id: socket.room_id });
        let worker = await getMediasoupWorker();
        roomList.set(socket.room_id, new Room(socket.room_id, worker, io));
        callback({ room_id: socket.room_id });
      }
    });

    socket.on("getPeerCounts", async ({}, callback) => {
      if (!roomList.has(socket.room_id)) return;

      let peerCounts = roomList.get(socket.room_id).getPeersCount();

      log.debug("Peer counts", { peerCounts: peerCounts });

      callback({ peerCounts: peerCounts });
    });

    socket.on("cmd", (dataObject) => {
      if (!roomList.has(socket.room_id)) return;

      const data = checkXSS(dataObject);

      log.debug("Cmd", data);

      // cmd|foo|bar|....
      const words = data.split("|");
      let cmd = words[0];
      switch (cmd) {
        case "privacy":
          roomList
            .get(socket.room_id)
            .getPeers()
            .get(socket.id)
            .updatePeerInfo({ type: cmd, status: words[2] == "true" });
          break;
        default:
          break;
        //...
      }

      roomList.get(socket.room_id).broadCast(socket.id, "cmd", data);
    });

    socket.on("roomAction", async (dataObject) => {
      if (!roomList.has(socket.room_id)) return;

      const data = checkXSS(dataObject);

      const isPresenter = await isPeerPresenter(
        socket.room_id,
        data.peer_name,
        data.peer_uuid
      );

      log.debug("Room action:", data);
      switch (data.action) {
        case "lock":
          if (!isPresenter) return;
          if (!roomList.get(socket.room_id).isLocked()) {
            roomList.get(socket.room_id).setLocked(true, data.password);
            roomList
              .get(socket.room_id)
              .broadCast(socket.id, "roomAction", data.action);
          }
          break;
        case "checkPassword":
          let roomData = {
            room: null,
            password: "KO",
          };
          if (data.password == roomList.get(socket.room_id).getPassword()) {
            roomData.room = roomList.get(socket.room_id).toJson();
            roomData.password = "OK";
          }
          roomList
            .get(socket.room_id)
            .sendTo(socket.id, "roomPassword", roomData);
          break;
        case "unlock":
          if (!isPresenter) return;
          roomList.get(socket.room_id).setLocked(false);
          roomList
            .get(socket.room_id)
            .broadCast(socket.id, "roomAction", data.action);
          break;
        case "lobbyOn":
          if (!isPresenter) return;
          roomList.get(socket.room_id).setLobbyEnabled(true);
          roomList
            .get(socket.room_id)
            .broadCast(socket.id, "roomAction", data.action);
          break;
        case "lobbyOff":
          if (!isPresenter) return;
          roomList.get(socket.room_id).setLobbyEnabled(false);
          roomList
            .get(socket.room_id)
            .broadCast(socket.id, "roomAction", data.action);
          break;
      }
      log.debug("Room status", {
        locked: roomList.get(socket.room_id).isLocked(),
        lobby: roomList.get(socket.room_id).isLobbyEnabled(),
      });
    });

    socket.on("roomLobby", (dataObject) => {
      if (!roomList.has(socket.room_id)) return;

      const data = checkXSS(dataObject);

      data.room = roomList.get(socket.room_id).toJson();

      log.debug("Room lobby", {
        peer_id: data.peer_id,
        peer_name: data.peer_name,
        peers_id: data.peers_id,
        lobby: data.lobby_status,
        broadcast: data.broadcast,
      });

      if (data.peers_id && data.broadcast) {
        for (let peer_id in data.peers_id) {
          roomList
            .get(socket.room_id)
            .sendTo(data.peers_id[peer_id], "roomLobby", data);
        }
      } else {
        roomList.get(socket.room_id).sendTo(data.peer_id, "roomLobby", data);
      }
    });

    socket.on("peerAction", async (dataObject) => {
      if (!roomList.has(socket.room_id)) return;

      const data = checkXSS(dataObject);

      log.debug("Peer action", data);

      const presenterActions = ["mute", "hide", "eject"];
      if (presenterActions.some((v) => data.action === v)) {
        const isPresenter = await isPeerPresenter(
          socket.room_id,
          data.from_peer_name,
          data.from_peer_uuid
        );
        if (!isPresenter) return;
      }

      if (data.broadcast) {
        roomList
          .get(socket.room_id)
          .broadCast(data.peer_id, "peerAction", data);
      } else {
        roomList.get(socket.room_id).sendTo(data.peer_id, "peerAction", data);
      }
    });

    socket.on("updatePeerInfo", (dataObject) => {
      if (!roomList.has(socket.room_id)) return;

      const data = checkXSS(dataObject);

      // update my peer_info status to all in the room
      roomList
        .get(socket.room_id)
        .getPeers()
        .get(socket.id)
        .updatePeerInfo(data);
      roomList.get(socket.room_id).broadCast(socket.id, "updatePeerInfo", data);
    });



    socket.on("fileAbort", (dataObject) => {
      if (!roomList.has(socket.room_id)) return;

      const data = checkXSS(dataObject);

      roomList.get(socket.room_id).broadCast(socket.id, "fileAbort", data);
    });

    socket.on("shareVideoAction", (dataObject) => {
      if (!roomList.has(socket.room_id)) return;

      const data = checkXSS(dataObject);

      if (data.action == "open" && !isValidHttpURL(data.video_url)) {
        log.debug("Video src not valid", data);
        return;
      }

      log.debug("Share video: ", data);
      if (data.peer_id == "all") {
        roomList
          .get(socket.room_id)
          .broadCast(socket.id, "shareVideoAction", data);
      } else {
        roomList
          .get(socket.room_id)
          .sendTo(data.peer_id, "shareVideoAction", data);
      }
    });



    socket.on("setVideoOff", (dataObject) => {
      if (!roomList.has(socket.room_id)) return;

      const data = checkXSS(dataObject);

      log.debug("Video off", getPeerName());
      roomList.get(socket.room_id).broadCast(socket.id, "setVideoOff", data);
    });

    socket.on("join", async (dataObject, cb) => {
      if (!roomList.has(socket.room_id)) {
        return cb({
          error: "Room does not exist",
        });
      }

      // Get peer IPv4 (::1 Its the loopback address in ipv6, equal to 127.0.0.1 in ipv4)
      const peer_ip =
        socket.handshake.headers["x-forwarded-for"] ||
        socket.conn.remoteAddress;

      // Get peer Geo Location
      if (config.IPLookup.enabled && peer_ip != "::1") {
        dataObject.peer_geo = await getPeerGeoLocation(peer_ip);
      }

      const data = checkXSS(dataObject);

      log.debug("User joined", data);
      roomList.get(socket.room_id).addPeer(new Peer(socket.id, data));

      if (roomList.get(socket.room_id).isLocked()) {
        log.debug("User rejected because room is locked");
        return cb("isLocked");
      }

      if (roomList.get(socket.room_id).isLobbyEnabled()) {
        log.debug("User waiting to join room because lobby is enabled");
        roomList.get(socket.room_id).broadCast(socket.id, "roomLobby", {
          peer_id: data.peer_info.peer_id,
          peer_name: data.peer_info.peer_name,
          lobby_status: "waiting",
        });
        return cb("isLobby");
      }

      if (!(socket.room_id in presenters)) presenters[socket.room_id] = {};

      const peer_name = roomList.get(socket.room_id).getPeers()?.get(socket.id)
        ?.peer_info?.peer_name;
      const peer_uuid = roomList.get(socket.room_id).getPeers()?.get(socket.id)
        ?.peer_info?.peer_uuid;

      if (Object.keys(presenters[socket.room_id]).length === 0) {
        presenters[socket.room_id] = {
          peer_ip: peer_ip,
          peer_name: peer_name,
          peer_uuid: peer_uuid,
          is_presenter: true,
        };
      }

      log.debug("[Join] - Connected presenters grp by roomId", presenters);

      const isPresenter = await isPeerPresenter(
        socket.room_id,
        peer_name,
        peer_uuid
      );

      roomList
        .get(socket.room_id)
        .getPeers()
        .get(socket.id)
        .updatePeerInfo({ type: "presenter", status: isPresenter });

      log.debug("[Join] - Is presenter", {
        roomId: socket.room_id,
        peer_name: peer_name,
        peer_presenter: isPresenter,
      });

      cb(roomList.get(socket.room_id).toJson());
    });

    socket.on("getRouterRtpCapabilities", (_, callback) => {
      if (!roomList.has(socket.room_id)) {
        return callback({ error: "Room not found" });
      }

      log.debug("Get RouterRtpCapabilities", getPeerName());
      try {
        callback(roomList.get(socket.room_id).getRtpCapabilities());
      } catch (err) {
        callback({
          error: err.message,
        });
      }
    });

    socket.on("getProducers", () => {
      if (!roomList.has(socket.room_id)) return;

      log.debug("Get producers", getPeerName());

      // send all the current producer to newly joined member
      let producerList = roomList.get(socket.room_id).getProducerListForPeer();

      socket.emit("newProducers", producerList);
    });

    socket.on("updateUserList", ()=>{

    })

    socket.on("createWebRtcTransport", async (_, callback) => {
      if (!roomList.has(socket.room_id)) {
        return callback({ error: "Room not found" });
      }

      log.debug("Create webrtc transport", getPeerName());
      try {
        const { params } = await roomList
          .get(socket.room_id)
          .createWebRtcTransport(socket.id);
        callback(params);
      } catch (err) {
        log.error("Create WebRtc Transport error: ", err.message);
        callback({
          error: err.message,
        });
      }
    });

    socket.on(
      "connectTransport",
      async ({ transport_id, dtlsParameters }, callback) => {
        if (!roomList.has(socket.room_id)) {
          return callback({ error: "Room not found" });
        }

        log.debug("Connect transport", getPeerName());

        await roomList
          .get(socket.room_id)
          .connectPeerTransport(socket.id, transport_id, dtlsParameters);

        callback("success");
      }
    );

    socket.on(
      "produce",
      async (
        { producerTransportId, kind, appData, rtpParameters },
        callback
      ) => {
        if (!roomList.has(socket.room_id)) {
          return callback({ error: "Room not found" });
        }

        let peer_name = getPeerName(false);

        // peer_info audio Or video ON
        let data = {
          peer_name: peer_name,
          peer_id: socket.id,
          kind: kind,
          type: appData.mediaType,
          status: true,
        };
        await roomList
          .get(socket.room_id)
          .getPeers()
          .get(socket.id)
          .updatePeerInfo(data);

        let producer_id = await roomList
          .get(socket.room_id)
          .produce(
            socket.id,
            producerTransportId,
            rtpParameters,
            kind,
            appData.mediaType
          );

        log.debug("Produce", {
          kind: kind,
          type: appData.mediaType,
          peer_name: peer_name,
          peer_id: socket.id,
          producer_id: producer_id,
        });

        // add & monitor producer audio level
        if (kind === "audio") {
          roomList
            .get(socket.room_id)
            .addProducerToAudioLevelObserver({ producerId: producer_id });
        }

        callback({
          producer_id,
        });
      }
    );

    socket.on(
      "consume",
      async (
        { consumerTransportId, producerId, rtpCapabilities },
        callback
      ) => {
        if (!roomList.has(socket.room_id)) {
          return callback({ error: "Room not found" });
        }

        let params = await roomList
          .get(socket.room_id)
          .consume(socket.id, consumerTransportId, producerId, rtpCapabilities);

        log.debug("Consuming", {
          peer_name: getPeerName(false),
          producer_id: producerId,
          consumer_id: params ? params.id : undefined,
        });

        callback(params);
      }
    );

    socket.on("producerClosed", (data) => {
      if (!roomList.has(socket.room_id)) return;

      log.debug("Producer close", data);

      // peer_info audio Or video OFF
      roomList
        .get(socket.room_id)
        .getPeers()
        .get(socket.id)
        .updatePeerInfo(data);
      roomList.get(socket.room_id).closeProducer(socket.id, data.producer_id);
    });

    socket.on("resume", async (_, callback) => {
      await consumer.resume();
      callback();
    });

    socket.on("getRoomInfo", async (_, cb) => {
      if (!roomList.has(socket.room_id)) return;

      log.debug("Send Room Info to", getPeerName());
      cb(roomList.get(socket.room_id).toJson());
    });

    socket.on("refreshParticipantsCount", () => {
      if (!roomList.has(socket.room_id)) return;

      let data = {
        room_id: socket.room_id,
        peer_counts: roomList.get(socket.room_id).getPeers().size,
      };
      log.debug("Refresh Participants count", data);
      roomList
        .get(socket.room_id)
        .broadCast(socket.id, "refreshParticipantsCount", data);
    });

    socket.on("message", (dataObject) => {
      if (!roomList.has(socket.room_id)) return;

      const data = checkXSS(dataObject);

      // check if the message coming from real peer
      const realPeer = isRealPeer(data.peer_name, data.peer_id);
      if (!realPeer) {
        const peer_name = getPeerName(false);
        log.debug("Fake message detected", {
          realFrom: peer_name,
          fakeFrom: data.peer_name,
          msg: data.msg,
        });
        return;
      }

      log.debug("message", data);
      if (data.to_peer_id == "all") {
        roomList.get(socket.room_id).broadCast(socket.id, "message", data);
      } else {
        roomList.get(socket.room_id).sendTo(data.to_peer_id, "message", data);
      }
    });


    socket.on("disconnect", async () => {
      if (!roomList.has(socket.room_id)) return;

      const peerName =
        roomList.get(socket.room_id).getPeers()?.get(socket.id)?.peer_info
          ?.peer_name || "";
      const peerUuid =
        roomList.get(socket.room_id).getPeers()?.get(socket.id)?.peer_info
          ?.peer_uuid || "";
      const isPresenter = await isPeerPresenter(
        socket.room_id,
        peerName,
        peerUuid
      );

      log.debug("Disconnect", peerName);

      roomList.get(socket.room_id).removePeer(socket.id);

      if (roomList.get(socket.room_id).getPeers().size === 0) {
        if (roomList.get(socket.room_id).isLocked()) {
          roomList.get(socket.room_id).setLocked(false);
        }
        if (roomList.get(socket.room_id).isLobbyEnabled()) {
          roomList.get(socket.room_id).setLobbyEnabled(false);
        }
        delete presenters[socket.room_id];
        log.debug(
          "Disconnect - current presenters grouped by roomId",
          presenters
        );
      }

      roomList
        .get(socket.room_id)
        .broadCast(socket.id, "removeMe", removeMeData(peerName, isPresenter));

      removeIP(socket);
    });

    socket.on("exitRoom", async (_, callback) => {
      if (!roomList.has(socket.room_id)) {
        return callback({
          error: "Not currently in a room",
        });
      }

      const peerName =
        roomList.get(socket.room_id).getPeers()?.get(socket.id)?.peer_info
          ?.peer_name || "";
      const peerUuid =
        roomList.get(socket.room_id).getPeers()?.get(socket.id)?.peer_info
          ?.peer_uuid || "";
      const isPresenter = await isPeerPresenter(
        socket.room_id,
        peerName,
        peerUuid
      );

      log.debug("Exit room", peerName);

      // close transports
      await roomList.get(socket.room_id).removePeer(socket.id);

      roomList
        .get(socket.room_id)
        .broadCast(socket.id, "removeMe", removeMeData(peerName, isPresenter));

      if (roomList.get(socket.room_id).getPeers().size === 0) {
        roomList.delete(socket.room_id);
      }

      socket.room_id = null;

      removeIP(socket);

      callback("Successfully exited room");
    });

    // common
    function getPeerName(json = true) {
      try {
        let peer_name =
          (roomList.get(socket.room_id) &&
            roomList.get(socket.room_id).getPeers()?.get(socket.id)?.peer_info
              ?.peer_name) ||
          "undefined";
        if (json) {
          return {
            peer_name: peer_name,
          };
        }
        return peer_name;
      } catch (err) {
        log.error("getPeerName", err);
        return json ? { peer_name: "undefined" } : "undefined";
      }
    }

    function isRealPeer(name, id) {
      let peerName =
        (roomList.get(socket.room_id) &&
          roomList.get(socket.room_id).getPeers()?.get(id)?.peer_info
            ?.peer_name) ||
        "undefined";
      if (peerName == name) return true;
      return false;
    }

    function isValidFileName(fileName) {
      const invalidChars = /[\\\/\?\*\|:"<>]/;
      return !invalidChars.test(fileName);
    }

    function isValidHttpURL(input) {
      const pattern = new RegExp(
        "^(https?:\\/\\/)?" + // protocol
          "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // domain name
          "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR ip (v4) address
          "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // port and path
          "(\\?[;&a-z\\d%_.~+=-]*)?" + // query string
          "(\\#[-a-z\\d_]*)?$",
        "i"
      ); // fragment locator
      return pattern.test(input);
    }

    function removeMeData(peerName, isPresenter) {
      const roomId = roomList.get(socket.room_id) && socket.room_id;
      const peerCounts =
        roomList.get(socket.room_id) &&
        roomList.get(socket.room_id).getPeers().size;
      log.debug("REMOVE ME DATA", {
        roomId: roomId,
        name: peerName,
        isPresenter: isPresenter,
        count: peerCounts,
      });
      return {
        room_id: roomId,
        peer_id: socket.id,
        peer_counts: peerCounts,
        isPresenter: isPresenter,
      };
    }

    function bytesToSize(bytes) {
      let sizes = ["Bytes", "KB", "MB", "GB", "TB"];
      if (bytes == 0) return "0 Byte";
      let i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
      return Math.round(bytes / Math.pow(1024, i), 2) + " " + sizes[i];
    }
  });

  async function isPeerPresenter(room_id, peer_name, peer_uuid) {
    let isPresenter = false;

    if (
      typeof presenters[room_id] === "undefined" ||
      presenters[room_id] === null
    )
      return false;

    try {
      isPresenter =
        typeof presenters[room_id] === "object" &&
        Object.keys(presenters[room_id]).length > 1 &&
        presenters[room_id]["peer_name"] === peer_name &&
        presenters[room_id]["peer_uuid"] === peer_uuid;
    } catch (err) {
      log.error("isPeerPresenter", err);
      return false;
    }

    log.debug("isPeerPresenter", {
      room_id: room_id,
      peer_name: peer_name,
      peer_uuid: peer_uuid,
      isPresenter: isPresenter,
    });

    return isPresenter;
  }

  async function getPeerGeoLocation(ip) {
    const endpoint = config.IPLookup.getEndpoint(ip);
    log.debug("Get peer geo", { ip: ip, endpoint: endpoint });
    return axios
      .get(endpoint)
      .then((response) => response.data)
      .catch((error) => log.error(error));
  }

  function getIP(req) {
    return req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  }
  function allowedIP(ip) {
    return authHost != null && authHost.isAuthorized(ip);
  }
  function removeIP(socket) {
    if (hostCfg.protected == true) {
      let ip = socket.handshake.address;
      if (ip && allowedIP(ip)) {
        authHost.deleteIP(ip);
        hostCfg.authenticated = false;
        log.debug("Remove IP from auth", { ip: ip });
      }
    }
  }
}

module.exports = startServer;
