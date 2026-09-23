import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
const PORT = process.env.PORT || 3001;
createApp().listen(PORT, () => {
  console.log(`TrueSight.ai server running on http://localhost:${PORT}`);
  console.log(`Web search: ${process.env.TAVILY_API_KEY?.trim() ? "configured (Tavily)" : "unavailable — set TAVILY_API_KEY in server/.env"}`);
});
