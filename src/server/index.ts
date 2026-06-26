import { env } from "./config/env";
import { createApp } from "./app";

const app = createApp({ serveClient: true });

app.listen(env.port, env.host, () => {
  console.log(`Brand Experience Agent listening on http://${env.host}:${env.port}`);
});
