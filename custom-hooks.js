import { useEffect, useRef, useState } from "react";
import * as WebAPI from "./proto/webapi_2";
import * as UserSession from "./proto/user_session_2";

const useWebSocket = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [message, setMessage] = useState<WebAPI.ServerMsg | null>(null);
  const [loginCreds, setLoginCreds] = useState<UserSession.Logon | null>(null);
  const messageQueue = useRef<WebAPI.ClientMsg[]>([]);
  const [reLogonCount, setReLogonCount] = useState(1);
  const [loginDetails, setLoginDetails] = useState<UserSession.LogonResult | null>(null);

  useEffect(() => {
    console.log("Connecting to WebSocket ...");

    const ws = new WebSocket("wss://api.site.com");

    ws.onopen = () => {
      console.log("Connected to WebSocket ...");
      login();
      setSocket(ws);
    };

    ws.onmessage = async (event) => {
      try {
        const data = await event.data.arrayBuffer();
        const msg = WebAPI.ServerMsg.decode(new Uint8Array(data));
        console.log("Got message", msg);
        setMessage(msg);

        if (!!msg.logonResult) {
          if (msg.logonResult?.resultCode === 0) {
            console.log("Logged in successfully!");
            setLoginDetails(msg.logonResult);
          }
          if (!!msg.logonResult && msg.logonResult?.resultCode !== 0) {
            console.log("Login failed!", msg.logonResult);
            ws.close();
          }
        }

        if (!!msg.loggedOff) {
          console.log("Logged off!", msg.loggedOff);
          ws.close();
        }
      } catch (error) {
        console.error("Error decoding message:", error);
      }
    };

    ws.onclose = () => {
      console.log("Disconnected from WebSocket");
      setSocket(null);
      setLoginDetails(null);
      // triggerReLogin();
      setReLogonCount(reLogonCount + 1);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      console.log("Cleaning up WebSocket ...");
      ws.close();
    };
  }, [reLogonCount]);

  useEffect(() => {
    if (socket && socket.readyState === WebSocket.OPEN && messageQueue.current.length > 0) {
      while (messageQueue.current.length > 0) {
        const msg = messageQueue.current.shift();
        console.log("Sending message de-queue:", msg);
        if (msg) {
          sendMessage(msg);
        }
      }
    }
  }, [socket]);

  const sendMessage = (msg: WebAPI.ClientMsg) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.log("Sending message in-queue:", msg);
      messageQueue.current.push(msg);
    } else {
      try {
        console.log("Sending message:", msg);
        const encoded = WebAPI.ClientMsg.encode(msg).finish();
        socket.send(encoded);
        console.log("Sending message: Done!");
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  };

  const login = () => {
    let clMsg = WebAPI.ClientMsg.create();
    let logonMsg = UserSession.Logon.create();
    logonMsg.userName = "user-name";
    logonMsg.password = "pass";
    logonMsg.clientAppId = "any app id";
    logonMsg.clientVersion = "1.0.0";
    clMsg.logon = logonMsg;
    setLoginCreds(logonMsg);

    if (loginDetails == null) {
      console.log("Sending Logging in ...");
      sendMessage(clMsg);
    }
  };

  return { socket, message, sendMessage, login };
};

export default useWebSocket;
