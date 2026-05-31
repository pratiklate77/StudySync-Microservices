const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const http = require("http");
const https = require("https");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(morgan("dev"));

// Configure proxy routes for microservices in exact order of specificity
const proxies = [
  { path: "/api/v1/groups/:groupId/messages", target: "http://localhost:8003" },
  { path: "/api/v1/groups/:groupId/online", target: "http://localhost:8003" },
  { path: "/api/v1/groups/:groupId/read", target: "http://localhost:8003" },
  {
    path: "/api/v1/groups/:groupId/unread-count",
    target: "http://localhost:8003",
  },
  { path: "/api/v1/messages", target: "http://localhost:8003" },
  { path: "/api/v1/recommendations", target: "http://localhost:8008" },
  { path: "/api/v1/admin/verification", target: "http://localhost:8006" }, // verification service admin routes
  { path: "/api/v1/admin", target: "http://localhost:8004" }, // admin service (auth, users, analytics)
  { path: "/api/v1/auth", target: "http://localhost:8000" },
  { path: "/api/v1/tutors", target: "http://localhost:8000" },
  { path: "/api/v1/sessions", target: "http://localhost:8001" },
  { path: "/api/v1/groups", target: "http://localhost:8002" },
  { path: "/api/v1/payments", target: "http://localhost:8005" },
  { path: "/api/v1/wallet", target: "http://localhost:8005" },
  { path: "/api/v1/verification", target: "http://localhost:8006" },
  { path: "/api/v1/notifications", target: "http://localhost:8007" },
];

// Set up proxy middleware for each route in order
proxies.forEach(({ path, target }) => {
  // Convert Express path parameters (e.g. :groupId) to regex patterns
  const pathRegexStr = path.replace(/:[^\\/]+/g, "[^/]+");
  const regex = new RegExp(`^${pathRegexStr}(\\/|\\?|$)`);

  app.use(
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathFilter: (pathname) => regex.test(pathname),
      ...(path === "/api/v1/admin"
        ? { pathRewrite: { "^/api/v1/admin": "/api/v1" } }
        : {}),
    }),
  );
});

// ── Server-side health check endpoint ──────────────────────────────────────
// Pings all microservices from Node (no CORS issues) and returns statuses
const SERVICES = [
  { name: "Identity Service", port: 8000, path: "/health" },
  { name: "Session Service", port: 8001, path: "/health" },
  { name: "Group Service", port: 8002, path: "/health" },
  { name: "Chat Service", port: 8003, path: "/health" },
  { name: "Admin Service", port: 8004, path: "/health" },
  { name: "Payment Service", port: 8005, path: "/health" },
  { name: "Verification Service", port: 8006, path: "/health" },
  { name: "Notification Service", port: 8007, path: "/health" },
  { name: "Recommendation Service", port: 8008, path: "/health" },
  { name: "Vite SPA Frontend", port: 5173, path: "/" },
];

function pingService(port, path) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: "localhost", port, path, timeout: 3000 },
      (res) => {
        resolve({ online: res.statusCode < 500, statusCode: res.statusCode });
        res.resume();
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ online: false, error: "timeout" });
    });
    req.on("error", (e) => resolve({ online: false, error: e.message }));
  });
}

app.get("/health/services", async (req, res) => {
  const results = await Promise.all(
    SERVICES.map(async (svc) => {
      const { online, statusCode, error } = await pingService(
        svc.port,
        svc.path,
      );
      return { name: svc.name, port: svc.port, online, statusCode, error };
    }),
  );
  // Add BFF itself
  results.push({ name: "Node BFF Gateway", port: 3000, online: true });
  res.json({ services: results, checked_at: new Date().toISOString() });
});

// Simple health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "BFF is active and proxying successfully!" });
});

app.listen(PORT, () => {
  console.log(`🚀 StudySync BFF Gateway active on http://localhost:${PORT}`);
});
