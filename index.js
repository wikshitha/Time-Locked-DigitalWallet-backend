import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";;
import cors from "cors"
import bodyParser from "body-parser";
import authRoutes from "./routes/authRoutes.js";
import vaultRoutes from "./routes/vaultRoutes.js";
import releaseRoutes from "./routes/releaseRoutes.js";
import auditLogRoutes from "./routes/auditLogRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import keyBackupRoutes from "./routes/keyBackupRoutes.js";
import inactivityRoutes from "./routes/inactivityRoutes.js";
import { startInactivityWatcher } from "./jobs/inactivityWatcher.js";
import { startGracePeriodChecker } from "./jobs/gracePeriodChecker.js";
import { startReleaseScheduler } from "./jobs/releaseScheduler.js";

dotenv.config();

const app = express();


app.use(cors());
app.use(bodyParser.json({ limit: "500mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/vaults", vaultRoutes);
app.use("/api/keybackup", keyBackupRoutes);
app.use("/api/releases", releaseRoutes);
app.use("/api/auditlogs", auditLogRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/inactivity", inactivityRoutes);



app.listen(3000, () => {
    console.log("Server is running on port 3000");
    startInactivityWatcher(); // start daily watcher
    startGracePeriodChecker();
    startReleaseScheduler(); // start release scheduler
});

let mongoUrl = process.env.MONGO_URL;

mongoose.connect(mongoUrl)

let connection = mongoose.connection
connection.once("open",()=>{
    console.log("Mongodb connection succes");
    
})

