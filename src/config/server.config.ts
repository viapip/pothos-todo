export default {
  port: 4000,
  host: "localhost",
  cors: {
    origin: "*",
    credentials: true,
  },
  experimental: {
    websocket: true,
  },
};