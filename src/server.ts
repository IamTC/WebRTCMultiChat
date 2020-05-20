import { Application } from "express";
// import * as express from 'express';
import express from 'express';
import { Server as SocketIOServer } from "socket.io";
import socketIO from 'socket.io';
import { createServer, Server as HTTPServer } from "http";
// import { createServer, Server as HTTPSServer } from 'https';
import * as path from "path";
import * as fs from 'fs';

export class Server {
  private httpServer: HTTPServer;
  private app: Application;
  private io: any;

  private activeSockets: string[] = [];

  private readonly DEFAULT_PORT = process.env.PORT || 5000;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = socketIO(this.httpServer) as any;

    this.configureApp();
    this.configureRoutes();
    this.handleSocketConnection();
  }

  private configureApp(): void {
    this.app.use(express.static(path.join(__dirname, "../public")));
  }

  private configureRoutes(): void {
    this.app.get("/", (req, res) => {
      res.sendFile(__dirname + "/../public/index.html");
    });
  }

  private handleSocketConnection(): void {
    this.io.on("connection", socket => {

      let room;

      socket.on('joinedRoom', (roomId) => {
        socket.join(roomId);
        room = roomId;

        this.io.of('/').in(room).clients((error, clients) => {
          if (error) throw error;

          this.io.sockets.in(room).emit("user-joined", socket.id, clients.length, clients);
        });

      })

      socket.on('signal', (toId, message) => {
        this.io.to(toId).emit('signal', socket.id, message);
      });

      socket.on('disconnect', () => {
        this.io.sockets.in(room).emit('remove-user', socket.id);
      })
    });
  }

  public listen(callback: (port: any) => void): void {
    this.httpServer.listen(this.DEFAULT_PORT, () => {
      callback(this.DEFAULT_PORT);
    });
  }
}