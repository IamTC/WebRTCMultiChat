import { Application } from "express";
// import * as express from 'express';
import express from 'express';
import { Server as SocketIOServer } from "socket.io";
import socketIO from 'socket.io';
import { createServer, Server as HTTPServer} from "http";
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

      this.io.sockets.emit("user-joined", socket.id, this.io.engine.clientsCount, Object.keys(this.io.sockets.clients().sockets));

      // New user joins
      const existingSocket = this.activeSockets.find(
        existingSocket => existingSocket === socket.id
      );

      // if new user
      if (!existingSocket) {
        this.activeSockets.push(socket.id);

        socket.emit("update-user-list", {
          users: this.activeSockets.filter(
            existingSocket => existingSocket !== socket.id
          )
        });

        socket.broadcast.emit("update-user-list", {
          users: [socket.id]
        });
      }

      socket.on('signal', (toId, message) => {
        socket.to(toId).emit('signal', socket.id, message);
      });

      socket.on("call-user", (data: any) => {
        socket.to(data.to).emit("call-made", {
          offer: data.offer,
          socket: socket.id
        });
      });

      socket.on("make-answer", data => {
        socket.to(data.to).emit("answer-made", {
          socket: socket.id,
          answer: data.answer
        });
      });

      socket.on("reject-call", data => {
        socket.to(data.from).emit("call-rejected", {
          socket: socket.id
        });
      });

      socket.on("disconnect", () => {
        this.activeSockets = this.activeSockets.filter(
          existingSocket => existingSocket !== socket.id
        );
        socket.broadcast.emit("remove-user", {
          socketId: socket.id
        });
      });
    });
  }

  public listen(callback: (port: any) => void): void {
    this.httpServer.listen(this.DEFAULT_PORT, () => {
      callback(this.DEFAULT_PORT);
    });
  }
}