const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:8000",
      target: "http://localhost:8000",
      changeOrigin: true,
      ws: true,
    })
  );

  app.use(
    "/ws",
    createProxyMiddleware({
      target: "http://localhost:8000",
      changeOrigin: true,
      ws: true,
    })
  );
};
