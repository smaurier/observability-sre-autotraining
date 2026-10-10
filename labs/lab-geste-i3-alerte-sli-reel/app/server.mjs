import http from "node:http";

// API TribuZen miniature : créer une "sortie" (Z du cours 17-distributed-systems, même domaine).
// FAILURE_RATE pilote le taux d'erreur pour que le lab puisse déclencher une vraie dégradation.
let total = { "200": 0, "500": 0 };
const failureRate = () => Number(process.env.FAILURE_RATE ?? "0");

function handleSorties(res) {
  const fail = Math.random() < failureRate();
  const status = fail ? 500 : 200;
  total[String(status)] = (total[String(status)] ?? 0) + 1;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(fail ? JSON.stringify({ error: "db timeout" }) : JSON.stringify({ id: "sortie-1" }));
}

function handleMetrics(res) {
  const lines = [
    "# HELP http_requests_total Total des requêtes HTTP par status",
    "# TYPE http_requests_total counter",
    `http_requests_total{route="/sorties",status="200"} ${total["200"] ?? 0}`,
    `http_requests_total{route="/sorties",status="500"} ${total["500"] ?? 0}`,
  ];
  res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
  res.end(lines.join("\n") + "\n");
}

const server = http.createServer((req, res) => {
  if (req.url === "/metrics") return handleMetrics(res);
  if (req.url === "/sorties" && req.method === "POST") return handleSorties(res);
  res.writeHead(404);
  res.end();
});

const port = Number(process.env.PORT ?? 3100);
server.listen(port, () => console.log(`demo-app sorties listening on ${port}, FAILURE_RATE=${failureRate()}`));
