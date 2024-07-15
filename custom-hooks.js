/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from "react";
import * as WebAPI from "./proto/webapi_2";
import { WebSocketClient } from "./WebSocketClient";

const useMessageSender = () => {
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);
  const [message, setMessage] = useState<WebAPI.ServerMsg | null>(null);
  const messageQueue = useRef<WebAPI.ClientMsg[]>([]);

  useEffect(() => {
    const ws = WebSocketClient.getInstance();
    setWsClient(ws);

    ws.onOpen = () => {};

    ws.onMessage = async (msg: WebAPI.ServerMsg) => {
      try {
        console.log("Got message", msg);
        setMessage(msg);
      } catch (error) {
        console.error("Error decoding message:", error);
      }
    };

    ws.onClose = () => {};

    ws.onError = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      console.log("Cleaning up hook ...");
    };
  }, []);

  useEffect(() => {
    if (wsClient && wsClient.isReady && messageQueue.current.length > 0) {
      while (messageQueue.current.length > 0) {
        const msg = messageQueue.current.shift();
        console.log("Sending message de-queue:", msg);
        if (msg) {
          sendMessage(msg);
        }
      }
    }
  }, [wsClient]);

  const sendMessage = (msg: WebAPI.ClientMsg) => {
    if (!wsClient || wsClient.isReady === false) {
      console.log("Sending message in-queue:", msg);
      messageQueue.current.push(msg);
    } else {
      try {
        wsClient.send(msg);
        console.log("Sending message: Done!");
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  };

  return { message, sendMessage };
};

export default useMessageSender;


----------------------------------------------------

import * as WebAPI from "./proto/webapi_2";
import * as UserSession from "./proto/user_session_2";

export class WebSocketClient {
  private socket?: WebSocket;
  private isLoggedIn = false;
  private socketUrl = "wss://api.cqg.com";
  private isUserLogout = false;
  private static instance: WebSocketClient | null = null;

  constructor() {
    if (WebSocketClient.instance) {
      return WebSocketClient.instance;
    }
    WebSocketClient.instance = this;

    this.initSocket();
  }

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  private initSocket() {
    console.log("Connecting to WebSocket ...");
    this.socket = new WebSocket(this.socketUrl);
    this.socket.onopen = this.onWsOpen.bind(this);
    this.socket.onmessage = this.onWsMessage.bind(this);
    this.socket.onclose = this.onWsClose.bind(this);
    this.socket.onerror = this.onWsError.bind(this);
  }

  private closeSocket() {
    console.log("Closing connection ...");
    this.socket?.close();
    delete this.socket;
  }

  private onWsOpen(event: Event) {
    console.log("WebSocket connection opened");

    this.initiateLogon();

    if (this.onOpen) this.onOpen(event);
  }

  private async onWsMessage(event: MessageEvent) {
    const data = await event.data.arrayBuffer();
    const msg = WebAPI.ServerMsg.decode(new Uint8Array(data));
    
    if (!!msg.logonResult) {
      if (msg.logonResult?.resultCode === 0) {
        this.isLoggedIn = true;
        console.log("Logged in successfully!");
      }
      
      if (!!msg.logonResult && msg.logonResult?.resultCode !== 0) {
        console.log("Login failed!", msg.logonResult);
        this.socket?.close();
      }
    }

    if (msg?.loggedOff) {
      console.log("Logged Off ...", msg?.loggedOff);
    }

    if (this.onMessage) this.onMessage(msg);
  }

  private onWsClose(event: CloseEvent) {
    console.log("WebSocket connection closed");
    
    if (!this.isUserLogout) {
      debugger;
      this.closeSocket();
      
      // If any cleanup is required outside.
      if (this.onClose) this.onClose(event);

      console.log("Reconnecting ...");
      this.initSocket();
    }
  }

  private onWsError(event: Event) {
    console.error("WebSocket error:", event);
    if (this.onError) this.onError(event);
  }

  public send(message: WebAPI.ClientMsg): Error | void {
    console.log("Sending message:", message);
    const encoded = WebAPI.ClientMsg.encode(message).finish();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(encoded);
    } else {
      return new ConnectionNotReadyError("Connection is not ready");
    }
  }

  public close() {
    this.closeSocket();
  }

  public onOpen?: (event: Event) => void;
  public onMessage?: (event: WebAPI.ServerMsg) => void;
  public onClose?: (event: CloseEvent) => void;
  public onError?: (event: Event) => void;

  public get isReady(): boolean {
    return this.isLoggedIn && this.socket?.readyState === WebSocket.OPEN;
  }

  private initiateLogon() {
    let clMsg = WebAPI.ClientMsg.create();
    let logonMsg = UserSession.Logon.create();
    logonMsg.userName = "cmetest";
    logonMsg.password = "pass";
    logonMsg.clientAppId = "ConnamaraMultiSession";
    logonMsg.clientVersion = "1.1.5038.15046";
    clMsg.logon = logonMsg;
    this.send(clMsg);
  }
}

class ConnectionNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionNotReadyError";
    Object.setPrototypeOf(this, ConnectionNotReadyError.prototype);
  }
}
